import { create } from 'zustand';
import axiosInstance from '../lib/axiosInstance';
import { useAuthStore } from './authStore';
import { useChatStore, resolveUserName, resolveUserAvatar } from './chatStore';

export type CallStateMode = 'idle' | 'ringing_incoming' | 'ringing_outgoing' | 'connected';
export type CallType = 'voice' | 'video';

// Enum CallStatus bên phía Back-end: Ended=0, Missed=1, Rejected=2, Ongoing=3, Cancelled=4
export const CallStatus = {
  Ended: 0,
  Missed: 1,
  Rejected: 2,
  Ongoing: 3,
  Cancelled: 4
} as const;
export type CallStatus = typeof CallStatus[keyof typeof CallStatus];

export interface CallParticipant {
  userId: string;
  joinedAt?: string;
  leftAt?: string;
}

export interface ActiveCall {
  id: string;
  conversationId: string;
  type: CallType;
  startedByUserId: string;
  opponentName: string;
  opponentAvatar: string;
  opponentUserId: string;
}

export interface ParticipantState {
  userId: string;
  userName: string;
  urlAvatar: string;
  isCameraOn?: boolean;
}

interface CallStore {
  callState: CallStateMode;
  activeCall: ActiveCall | null;
  
  // Media streams
  localStream: MediaStream | null;
  remoteStream: MediaStream | null; // Keep as fallback/first stream
  remoteStreams: Record<string, MediaStream>;
  
  // WebRTC
  peerConnection: RTCPeerConnection | null; // Keep as fallback/first pc
  peerConnections: Record<string, RTCPeerConnection>;
  participants: ParticipantState[];
  
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  
  // SignalR Hub instance
  chatHub: any | null;
  
  // Timers
  ringingTimeoutId: ReturnType<typeof setTimeout> | null;

  // Actions
  setChatHub: (chatHub: any) => void;
  startCall: (
    conversationId: string, 
    type: CallType, 
    opponentUserId: string,
    opponentName: string, 
    opponentAvatar: string
  ) => Promise<void>;
  receiveCall: (
    callData: {
      id: string;
      conversationId: string;
      type: CallType;
      startedByUserId: string;
    },
    opponentName: string,
    opponentAvatar: string
  ) => void;
  acceptCall: () => Promise<void>;
  acceptCallLocal: (sendWebRTCSignal: (targetUserId: string, signalData: string) => Promise<void>, targetUserId?: string) => Promise<void>;
  rejectCall: () => Promise<void>;
  cancelCall: (isTimeout?: boolean) => Promise<void>;
  endCallLocal: () => void;
  joinGroupCall: (
    callId: string,
    conversationId: string,
    type: CallType,
    startedByUserId: string
  ) => Promise<void>;
  
  // Media controls
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  
  // WebRTC Signaling Handlers
  handleIceCandidate: (candidate: RTCIceCandidateInit, fromUserId?: string) => Promise<void>;
  handleOffer: (sdp: string, sendWebRTCSignal: (targetUserId: string, signalData: string) => Promise<void>, fromUserId?: string) => Promise<void>;
  handleAnswer: (sdp: string, fromUserId?: string) => Promise<void>;

  // Participant updates
  addParticipant: (userId: string, userName?: string, urlAvatar?: string, isCameraOn?: boolean) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantCamera: (userId: string, isCameraOn: boolean) => void;
}

// Cấu hình WebRTC ICE Servers
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

export const useCallStore = create<CallStore>((set, get) => {
  
  // Helper dọn dẹp WebRTC & Tracks
  const cleanupMediaAndWebRTC = () => {
    const { localStream, remoteStreams, peerConnections, ringingTimeoutId } = get();
    
    if (ringingTimeoutId) {
      clearTimeout(ringingTimeoutId);
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    Object.values(remoteStreams).forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    });

    Object.values(peerConnections).forEach(pc => {
      if (pc) {
        pc.close();
      }
    });
    
    set({
      callState: 'idle',
      activeCall: null,
      localStream: null,
      remoteStream: null,
      remoteStreams: {},
      peerConnection: null,
      peerConnections: {},
      participants: [],
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      ringingTimeoutId: null
    });
  };

  // Helper lấy Media Stream an toàn (có fallback sang Audio-only nếu Device in use / lỗi camera)
  const getUserMediaSafe = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      console.warn("Lỗi khi lấy Media Stream đầy đủ:", err);
      // Nếu yêu cầu có video nhưng gặp lỗi (vd: camera bị chiếm dụng)
      if (constraints.video) {
        console.log("Thử fallback sang chỉ lấy Audio...");
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            audio: constraints.audio,
            video: false
          });
          set({ isVideoOff: true });
          return fallbackStream;
        } catch (fallbackErr) {
          console.error("Lỗi lấy Audio fallback:", fallbackErr);
          throw err;
        }
      }
      throw err;
    }
  };

  // Helper khởi tạo PeerConnection
  const initPeerConnection = (
    opponentUserId: string,
    sendWebRTCSignal: (targetUserId: string, signalData: string) => Promise<void>
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection(rtcConfig);
    
    // Khi có ICE Candidate từ STUN server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendWebRTCSignal(opponentUserId, JSON.stringify({ candidate: event.candidate }));
      }
    };
    
    // Khi nhận được track từ đối phương
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const { remoteStreams } = get();
        const nextStreams = { ...remoteStreams, [opponentUserId]: event.streams[0] };
        set({
          remoteStreams: nextStreams,
          remoteStream: Object.values(nextStreams)[0] || null
        });
      }
    };
    
    // Thêm local tracks vào PeerConnection
    const { localStream } = get();
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }
    
    const { peerConnections } = get();
    set({
      peerConnections: { ...peerConnections, [opponentUserId]: pc },
      peerConnection: pc // Fallback
    });
    return pc;
  };

  return {
    callState: 'idle',
    activeCall: null,
    localStream: null,
    remoteStream: null,
    remoteStreams: {},
    peerConnection: null,
    peerConnections: {},
    participants: [],
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    chatHub: null,
    ringingTimeoutId: null,

    setChatHub: (chatHub) => set({ chatHub }),

    startCall: async (conversationId, type, opponentUserId, opponentName, opponentAvatar) => {
      cleanupMediaAndWebRTC();
      const { chatHub } = get();
      if (!chatHub) {
        console.error("SignalR ChatHub chưa được khởi tạo!");
        return;
      }
      
      try {
        // 1. Gọi API tạo cuộc gọi trong DB
        const apiResponse = await axiosInstance.post<any, any>('/calls/start', {
          conversationId,
          type: type === 'video' ? 1 : 0 // 0=Voice, 1=Video
        });
        
        if (!apiResponse || !apiResponse.isSuccess) {
          throw new Error("Không thể bắt đầu cuộc gọi");
        }
        
        const callId = apiResponse.data.id;
        
        // 2. Lấy Local Media Stream (audio/video)
        const constraints = {
          audio: true,
          video: type === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false
        };
        const stream = await getUserMediaSafe(constraints);
        
        // 3. Lập lịch tự động timeout 35 giây nếu đối phương không nghe máy
        const timeoutId = setTimeout(() => {
          const { callState } = get();
          if (callState === 'ringing_outgoing') {
            console.log("Cuộc gọi tự động hủy sau 35s không trả lời (Missed Call)");
            void get().cancelCall(true);
          }
        }, 35000); // 35s timeout chốt theo feedback người dùng

        // Khởi tạo participants
        const user = useAuthStore.getState().user;
        const myId = user?.id || (user as any)?.Id || '';
        const myName = user?.name || (user as any)?.Name || 'Bạn';
        const myAvatar = user?.urlAvatar || (user as any)?.UrlAvatar || '';

        const initialParticipants: ParticipantState[] = [
          {
            userId: myId,
            userName: myName,
            urlAvatar: myAvatar,
            isCameraOn: type === 'video' ? !get().isVideoOff : false
          }
        ];

        if (opponentUserId) {
          initialParticipants.push({
            userId: opponentUserId,
            userName: opponentName,
            urlAvatar: opponentAvatar,
            isCameraOn: type === 'video'
          });
        }

        set({
          callState: 'ringing_outgoing',
          localStream: stream,
          ringingTimeoutId: timeoutId,
          participants: initialParticipants,
          activeCall: {
            id: callId,
            conversationId,
            type,
            startedByUserId: myId,
            opponentName,
            opponentAvatar,
            opponentUserId
          }
        });

        // 4. Gửi SignalR Event "ringing" thông báo cuộc gọi đến
        const convs = useChatStore.getState().conversations;
        const currentConv = convs.find(c => c.conversationId === conversationId);
        
        if (currentConv && currentConv.type === 1) { // Group chat
          const otherParticipants = currentConv.participants.filter(p => p.id !== myId);
          for (const p of otherParticipants) {
            void chatHub.sendCallSignal(conversationId, p.id, 'ringing', callId, type === 'video' ? 1 : 0);
          }
        } else { // Direct chat
          await chatHub.sendCallSignal(conversationId, opponentUserId, 'ringing', callId, type === 'video' ? 1 : 0);
        }

      } catch (err) {
        console.error("Lỗi bắt đầu cuộc gọi:", err);
        cleanupMediaAndWebRTC();
        throw err;
      }
    },

    receiveCall: (callData, opponentName, opponentAvatar) => {
      cleanupMediaAndWebRTC();
      const user = useAuthStore.getState().user;
      const myId = user?.id || (user as any)?.Id || '';
      const myName = user?.name || (user as any)?.Name || 'Bạn';
      const myAvatar = user?.urlAvatar || (user as any)?.UrlAvatar || '';

      const initialParticipants: ParticipantState[] = [
        {
          userId: myId,
          userName: myName,
          urlAvatar: myAvatar,
          isCameraOn: callData.type === 'video' ? !get().isVideoOff : false
        },
        {
          userId: callData.startedByUserId,
          userName: opponentName,
          urlAvatar: opponentAvatar,
          isCameraOn: callData.type === 'video'
        }
      ];

      set({
        callState: 'ringing_incoming',
        participants: initialParticipants,
        activeCall: {
          id: callData.id,
          conversationId: callData.conversationId,
          type: callData.type,
          startedByUserId: callData.startedByUserId,
          opponentName,
          opponentAvatar,
          opponentUserId: callData.startedByUserId
        }
      });
    },

    acceptCall: async () => {
      const { activeCall, chatHub } = get();
      if (!activeCall || !chatHub) return;

      try {
        // 1. Gọi API báo tham gia cuộc gọi
        const apiResponse = await axiosInstance.post<any, any>('/calls/join', { callId: activeCall.id });
        if (!apiResponse || !apiResponse.isSuccess) {
          throw new Error("Không thể chấp nhận cuộc gọi");
        }

        const activeParticipants = apiResponse.data.activeParticipants as Array<{ userId: string; joinedAt?: string; leftAt?: string }>;
        
        // 2. Lấy Local Media Stream
        const constraints = {
          audio: true,
          video: activeCall.type === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false
        };
        const stream = await getUserMediaSafe(constraints);
        set({ localStream: stream });
        
        // 3. Khởi tạo PeerConnections cho các participants active
        const user = useAuthStore.getState().user;
        const myId = user?.id || (user as any)?.Id || '';
        const myName = user?.name || (user as any)?.Name || 'Bạn';
        const myAvatar = user?.urlAvatar || (user as any)?.UrlAvatar || '';

        const resolvedParticipants: ParticipantState[] = [
          {
            userId: myId,
            userName: myName,
            urlAvatar: myAvatar,
            isCameraOn: activeCall.type === 'video' ? !get().isVideoOff : false
          }
        ];

        set({ callState: 'connected' });

        const sendWebRTCSignalLambda = async (targetId: string, signalData: string) => {
          try {
            await chatHub.sendWebRTCSignal(targetId, signalData);
          } catch (err) {
            console.error("Lỗi gửi WebRTC signal:", err);
          }
        };

        for (const p of activeParticipants) {
          if (p.userId.toLowerCase() === myId.toLowerCase()) continue;
          
          const pName = resolveUserName(p.userId, activeCall.conversationId);
          const pAvatar = resolveUserAvatar(p.userId, activeCall.conversationId);
          resolvedParticipants.push({
            userId: p.userId,
            userName: pName,
            urlAvatar: pAvatar,
            isCameraOn: activeCall.type === 'video'
          });

          // Người mới join chủ động khởi tạo PeerConnection và gửi Offer cho các member cũ
          const pc = initPeerConnection(p.userId, sendWebRTCSignalLambda);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendWebRTCSignalLambda(p.userId, JSON.stringify({ sdp: pc.localDescription }));
        }

        set({ participants: resolvedParticipants });
        
        // 4. Báo cho Caller biết Callee đã nhấn Chấp nhận cuộc gọi qua SignalR (chỉ dành cho 1-1)
        const conv = useChatStore.getState().conversations.find(c => c.conversationId === activeCall.conversationId);
        const isGroupCall = conv?.type === 1;

        if (!isGroupCall) {
          await chatHub.sendCallSignal(
            activeCall.conversationId, 
            activeCall.opponentUserId, 
            'accept', 
            activeCall.id, 
            activeCall.type === 'video' ? 1 : 0
          );
        }

      } catch (err) {
        console.error("Lỗi chấp nhận cuộc gọi:", err);
        cleanupMediaAndWebRTC();
      }
    },

    acceptCallLocal: async (sendWebRTCSignal, targetUserId) => {
      const { activeCall, ringingTimeoutId } = get();
      if (!activeCall) return;
      
      // Xóa timeout đếm ngược 35s
      if (ringingTimeoutId) {
        clearTimeout(ringingTimeoutId);
        set({ ringingTimeoutId: null });
      }

      try {
        set({ callState: 'connected' });
        
        const peerId = targetUserId || activeCall.opponentUserId;
        
        // Caller khởi tạo PeerConnection và tạo SDP Offer
        const pc = initPeerConnection(peerId, sendWebRTCSignal);
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Gửi SDP Offer qua SignalR
        await sendWebRTCSignal(peerId, JSON.stringify({ sdp: pc.localDescription }));
      } catch (err) {
        console.error("Lỗi thiết lập PeerConnection phía Caller:", err);
        cleanupMediaAndWebRTC();
      }
    },

    rejectCall: async () => {
      const { activeCall, chatHub } = get();
      if (!activeCall || !chatHub) return;

      try {
        // Gửi status = Rejected (2) về API
        await axiosInstance.post('/calls/leave', {
          callId: activeCall.id,
          status: CallStatus.Rejected
        });
        
        // Gửi tín hiệu reject qua SignalR
        await chatHub.sendCallSignal(
          activeCall.conversationId, 
          activeCall.opponentUserId, 
          'reject', 
          activeCall.id, 
          activeCall.type === 'video' ? 1 : 0
        );
      } catch (err) {
        console.error("Lỗi từ chối cuộc gọi:", err);
      } finally {
        cleanupMediaAndWebRTC();
      }
    },

    joinGroupCall: async (callId, conversationId, type, startedByUserId) => {
      cleanupMediaAndWebRTC();
      const { chatHub } = get();
      if (!chatHub) {
        console.error("SignalR ChatHub chưa được khởi tạo!");
        return;
      }

      try {
        // 1. Gọi API báo tham gia cuộc gọi
        const apiResponse = await axiosInstance.post<any, any>('/calls/join', { callId });
        if (!apiResponse || !apiResponse.isSuccess) {
          throw new Error("Không thể tham gia cuộc gọi nhóm");
        }

        const activeParticipants = apiResponse.data.activeParticipants as Array<{ userId: string; joinedAt?: string; leftAt?: string }>;

        // 2. Lấy thông tin nhóm/đối phương từ conversation
        const conv = useChatStore.getState().conversations.find(c => c.conversationId === conversationId);
        const opponentName = conv?.groupInfo?.name || 'Nhóm chat';
        const opponentAvatar = conv?.groupInfo?.groupImage || '';

        set({
          callState: 'connected',
          activeCall: {
            id: callId,
            conversationId,
            type,
            startedByUserId,
            opponentName,
            opponentAvatar,
            opponentUserId: startedByUserId
          }
        });

        // 3. Lấy Local Media Stream
        const constraints = {
          audio: true,
          video: type === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false
        };
        const stream = await getUserMediaSafe(constraints);
        set({ localStream: stream });

        // Resolve current user info
        const user = useAuthStore.getState().user;
        const myId = user?.id || (user as any)?.Id || '';
        const myName = user?.name || (user as any)?.Name || 'Bạn';
        const myAvatar = user?.urlAvatar || (user as any)?.UrlAvatar || '';

        const resolvedParticipants: ParticipantState[] = [
          {
            userId: myId,
            userName: myName,
            urlAvatar: myAvatar,
            isCameraOn: type === 'video' ? !get().isVideoOff : false
          }
        ];

        // 4. Khởi tạo PeerConnection cho từng active participant và gửi Offer
        const sendWebRTCSignalLambda = async (targetId: string, signalData: string) => {
          try {
            await chatHub.sendWebRTCSignal(targetId, signalData);
          } catch (err) {
            console.error("Lỗi gửi WebRTC signal:", err);
          }
        };

        for (const p of activeParticipants) {
          if (p.userId.toLowerCase() === myId.toLowerCase()) continue;
          
          const pName = resolveUserName(p.userId, conversationId);
          const pAvatar = resolveUserAvatar(p.userId, conversationId);
          resolvedParticipants.push({
            userId: p.userId,
            userName: pName,
            urlAvatar: pAvatar,
            isCameraOn: type === 'video'
          });

          // Người mới join chủ động khởi tạo PeerConnection và gửi Offer cho các member cũ
          const pc = initPeerConnection(p.userId, sendWebRTCSignalLambda);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendWebRTCSignalLambda(p.userId, JSON.stringify({ sdp: pc.localDescription }));
        }

        set({ participants: resolvedParticipants });

      } catch (err) {
        console.error("Lỗi khi tham gia cuộc gọi nhóm chủ động:", err);
        cleanupMediaAndWebRTC();
      }
    },

    cancelCall: async (isTimeout?: boolean) => {
      const { activeCall, chatHub, callState } = get();
      if (!activeCall) return;

      try {
        let finalStatus: CallStatus;
        if (callState === 'connected') {
          finalStatus = CallStatus.Ended;
        } else if (callState === 'ringing_outgoing' && isTimeout) {
          finalStatus = CallStatus.Missed;
        } else {
          finalStatus = CallStatus.Cancelled;
        }
        
        await axiosInstance.post('/calls/leave', {
          callId: activeCall.id,
          status: finalStatus
        });
        
        const conv = useChatStore.getState().conversations.find(c => c.conversationId === activeCall.conversationId);
        const isGroupCall = conv?.type === 1;

        if (chatHub) {
          if (!isGroupCall || callState === 'ringing_outgoing') {
            if (isGroupCall && conv) {
              const myId = (useAuthStore.getState().user?.id || (useAuthStore.getState().user as any)?.Id || '').toLowerCase();
              const otherParticipants = conv.participants.filter(p => p.id.toLowerCase() !== myId);
              for (const p of otherParticipants) {
                void chatHub.sendCallSignal(activeCall.conversationId, p.id, 'cancel', activeCall.id, activeCall.type === 'video' ? 1 : 0);
              }
            } else if (activeCall.opponentUserId) {
              await chatHub.sendCallSignal(
                activeCall.conversationId, 
                activeCall.opponentUserId, 
                'cancel', 
                activeCall.id, 
                activeCall.type === 'video' ? 1 : 0
              );
            }
          }
        }
      } catch (err) {
        console.error("Lỗi hủy cuộc gọi:", err);
      } finally {
        cleanupMediaAndWebRTC();
      }
    },

    endCallLocal: () => {
      cleanupMediaAndWebRTC();
    },

    toggleMute: () => {
      const { localStream, isMuted } = get();
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = isMuted;
        });
        set({ isMuted: !isMuted });
      }
    },

    toggleVideo: () => {
      const { localStream, isVideoOff, activeCall, chatHub } = get();
      if (localStream && activeCall && activeCall.type === 'video') {
        const nextVideoOff = !isVideoOff;
        localStream.getVideoTracks().forEach(track => {
          track.enabled = !nextVideoOff;
        });
        set({ isVideoOff: nextVideoOff });

        // Notify other participants of camera status
        if (chatHub) {
          const conv = useChatStore.getState().conversations.find(c => c.conversationId === activeCall.conversationId);
          const isGroupCall = conv?.type === 1;
          const statusStr = nextVideoOff ? 'camera_off' : 'camera_on';
          if (isGroupCall && conv) {
            const myId = (useAuthStore.getState().user?.id || (useAuthStore.getState().user as any)?.Id || '').toLowerCase();
            const otherParticipants = conv.participants.filter(p => p.id.toLowerCase() !== myId);
            for (const p of otherParticipants) {
              void chatHub.sendCallSignal(activeCall.conversationId, p.id, statusStr, activeCall.id, 1);
            }
          } else if (activeCall.opponentUserId) {
            void chatHub.sendCallSignal(activeCall.conversationId, activeCall.opponentUserId, statusStr, activeCall.id, 1);
          }
        }
      }
    },

    toggleScreenShare: async () => {
      const { peerConnections, isScreenSharing, localStream, activeCall } = get();
      if (Object.keys(peerConnections).length === 0 || !localStream || !activeCall || activeCall.type !== 'video') return;

      try {
        if (!isScreenSharing) {
          // Bật chia sẻ màn hình
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          
          for (const pc of Object.values(peerConnections)) {
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
              await videoSender.replaceTrack(screenTrack);
            }
          }
          
          // Khi tắt chia sẻ màn hình qua nút mặc định của trình duyệt
          screenTrack.onended = () => {
            void get().toggleScreenShare();
          };
          
          set({ isScreenSharing: true });
        } else {
          // Tắt chia sẻ màn hình, khôi phục camera track
          const cameraStream = await getUserMediaSafe({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          });
          const cameraTrack = cameraStream.getVideoTracks()[0];
          
          for (const pc of Object.values(peerConnections)) {
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender && cameraTrack) {
              await videoSender.replaceTrack(cameraTrack);
            }
          }
          
          // Dọn dẹp stream camera tạm cũ và gán track mới vào localStream
          const oldVideoTrack = localStream.getVideoTracks()[0];
          if (oldVideoTrack) {
            oldVideoTrack.stop();
            localStream.removeTrack(oldVideoTrack);
          }
          localStream.addTrack(cameraTrack);
          
          set({ isScreenSharing: false });
        }
      } catch (err) {
        console.error("Lỗi chia sẻ màn hình:", err);
      }
    },

    handleIceCandidate: async (candidate, fromUserId) => {
      const targetUserId = fromUserId || get().activeCall?.opponentUserId;
      if (!targetUserId) return;

      const pc = get().peerConnections[targetUserId];
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error(`Lỗi thêm ICE Candidate từ ${targetUserId}:`, err);
        }
      }
    },

    handleOffer: async (sdp, sendWebRTCSignal, fromUserId) => {
      const targetUserId = fromUserId || get().activeCall?.opponentUserId;
      if (!targetUserId) return;

      let pc = get().peerConnections[targetUserId];
      if (!pc) {
        pc = initPeerConnection(targetUserId, sendWebRTCSignal);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        await sendWebRTCSignal(targetUserId, JSON.stringify({ sdp: pc.localDescription }));
      } catch (err) {
        console.error(`Lỗi xử lý Offer từ ${targetUserId}:`, err);
      }
    },

    handleAnswer: async (sdp, fromUserId) => {
      const targetUserId = fromUserId || get().activeCall?.opponentUserId;
      if (!targetUserId) return;

      const pc = get().peerConnections[targetUserId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        } catch (err) {
          console.error(`Lỗi xử lý Answer từ ${targetUserId}:`, err);
        }
      }
    },

    addParticipant: (userId, userName, urlAvatar, isCameraOn) => {
      const { participants, activeCall, callState, ringingTimeoutId } = get();
      if (participants.some(p => p.userId.toLowerCase() === userId.toLowerCase())) return;

      const conversationId = activeCall?.conversationId || '';
      const resolvedName = userName || resolveUserName(userId, conversationId);
      const resolvedAvatar = urlAvatar || resolveUserAvatar(userId, conversationId);

      const nextState: any = {
        participants: [
          ...participants,
          {
            userId,
            userName: resolvedName,
            urlAvatar: resolvedAvatar,
            isCameraOn: isCameraOn ?? (activeCall?.type === 'video')
          }
        ]
      };

      if (callState === 'ringing_outgoing') {
        nextState.callState = 'connected';
        if (ringingTimeoutId) {
          clearTimeout(ringingTimeoutId);
          nextState.ringingTimeoutId = null;
        }
      }

      set(nextState);
    },

    removeParticipant: (userId) => {
      const { participants, peerConnections, remoteStreams } = get();
      
      const pc = peerConnections[userId];
      if (pc) {
        pc.close();
      }
      const nextPCs = { ...peerConnections };
      delete nextPCs[userId];

      const stream = remoteStreams[userId];
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const nextStreams = { ...remoteStreams };
      delete nextStreams[userId];

      set({
        participants: participants.filter(p => p.userId.toLowerCase() !== userId.toLowerCase()),
        peerConnections: nextPCs,
        remoteStreams: nextStreams,
        remoteStream: Object.values(nextStreams)[0] || null
      });
    },

    updateParticipantCamera: (userId, isCameraOn) => {
      const { participants } = get();
      set({
        participants: participants.map(p =>
          p.userId.toLowerCase() === userId.toLowerCase()
            ? { ...p, isCameraOn }
            : p
        )
      });
    }
  };
});
