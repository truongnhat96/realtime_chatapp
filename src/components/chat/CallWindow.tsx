import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useCallStore } from '../../stores/callStore';
import { useAuthStore } from '../../stores/authStore';
import { 
  Phone, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  MonitorUp, 
  Volume2 
} from 'lucide-react';

interface ParticipantVideoProps {
  stream: MediaStream | null;
  isLocal?: boolean;
}

const ParticipantVideo: React.FC<ParticipantVideoProps> = ({ stream, isLocal }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      className="w-full h-full object-cover rounded-xl"
    />
  );
};

const getGridLayout = (count: number) => {
  if (count <= 1) {
    return {
      container: 'grid-cols-1',
      item: () => ''
    };
  }
  if (count === 2) {
    return {
      container: 'grid-cols-1 md:grid-cols-2',
      item: () => ''
    };
  }
  if (count === 3) {
    return {
      container: 'grid-cols-1 md:grid-cols-2',
      item: (index: number) => index === 2 ? 'md:col-span-2 max-w-2xl mx-auto w-full' : ''
    };
  }
  if (count === 4) {
    return {
      container: 'grid-cols-2',
      item: () => ''
    };
  }
  if (count === 5) {
    return {
      container: 'grid-cols-2 md:grid-cols-6',
      item: (index: number) => {
        if (index === 4) return 'col-span-2 md:col-span-3 max-w-xl md:max-w-none mx-auto w-full';
        if (index < 3) return 'md:col-span-2';
        return 'md:col-span-3';
      }
    };
  }
  if (count === 6) {
    return {
      container: 'grid-cols-2 md:grid-cols-3',
      item: () => ''
    };
  }
  return {
    container: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    item: () => ''
  };
};

const CallWindow: React.FC = () => {
  const {
    callState,
    activeCall,
    localStream,
    remoteStreams,
    participants,
    isMuted,
    isVideoOff,
    isScreenSharing,
    acceptCall,
    rejectCall,
    cancelCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare
  } = useCallStore();

  const currentUserId = useAuthStore(state => state.user?.id || (state.user as any)?.Id);
  const gridLayout = useMemo(() => getGridLayout(participants.length), [participants.length]);
  const [timerText, setTimerText] = useState('00:00');
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Xử lý đồng hồ cuộc gọi (Timer) khi trạng thái là 'connected'
  useEffect(() => {
    if (callState === 'connected') {
      let seconds = 0;
      setTimerText('00:00');
      
      timerIntervalRef.current = setInterval(() => {
        seconds++;
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        const pad = (val: number) => String(val).padStart(2, '0');
        
        if (hrs > 0) {
          setTimerText(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
        } else {
          setTimerText(`${pad(mins)}:${pad(secs)}`);
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimerText('00:00');
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [callState]);

  const participantNamesText = useMemo(() => {
    if (!participants || participants.length === 0) return '';
    return participants
      .map(p => p.userId.toLowerCase() === currentUserId?.toLowerCase() ? 'Bạn' : p.userName.split(' ').pop() || p.userName)
      .join(', ');
  }, [participants, currentUserId]);

  if (callState === 'idle' || !activeCall) {
    return null;
  }

  // Luồng giao diện cuộc gọi đến (Ringing Incoming)
  if (callState === 'ringing_incoming') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/95 text-white select-none backdrop-blur-md">
        {/* Blur Avatar Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10 filter blur-3xl"
          style={{ backgroundImage: `url(${activeCall.opponentAvatar || '/default-avatar.png'})` }}
        />
        
        <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center">
          {/* Ringing Avatar with waves */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-[#8ED8ED]/30 animate-ping opacity-75"></div>
            <div className="absolute -inset-4 rounded-full bg-[#8ED8ED]/10 animate-pulse"></div>
            <img 
              src={activeCall.opponentAvatar || '/default-avatar.png'} 
              alt={activeCall.opponentName} 
              className="relative w-32 h-32 rounded-full object-cover border-4 border-[#8ED8ED] shadow-2xl bg-gray-700"
            />
          </div>

          <h2 className="text-2xl font-bold mb-2 tracking-tight">{activeCall.opponentName}</h2>
          <p className="text-gray-400 text-sm mb-12 animate-pulse">
            Đang gọi {activeCall.type === 'video' ? 'video' : 'thoại'} cho bạn...
          </p>

          <div className="flex items-center justify-center gap-8 w-full">
            {/* Nút từ chối cuộc gọi */}
            <button 
              onClick={() => rejectCall()}
              className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-red-600/30 transition-all active:scale-95 group"
            >
              <PhoneOff size={28} className="group-hover:rotate-12 transition-transform" />
            </button>

            {/* Nút chấp nhận cuộc gọi */}
            <button 
              onClick={() => acceptCall()}
              className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-green-500/30 transition-all active:scale-95 animate-bounce group"
            >
              <Phone size={28} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Luồng giao diện cuộc gọi đi (Ringing Outgoing)
  if (callState === 'ringing_outgoing') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/95 text-white select-none backdrop-blur-md">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10 filter blur-3xl"
          style={{ backgroundImage: `url(${activeCall.opponentAvatar || '/default-avatar.png'})` }}
        />

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-60"></div>
            <img 
              src={activeCall.opponentAvatar || '/default-avatar.png'} 
              alt={activeCall.opponentName} 
              className="relative w-32 h-32 rounded-full object-cover border-4 border-white/25 shadow-2xl bg-gray-700"
            />
          </div>

          <h2 className="text-2xl font-bold mb-2 tracking-tight">{activeCall.opponentName}</h2>
          <p className="text-gray-400 text-sm mb-16 animate-pulse">Đang đổ chuông...</p>

          <button 
            onClick={() => cancelCall()}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-red-600/30 transition-all active:scale-95 group"
          >
            <PhoneOff size={28} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </div>
    );
  }

  const showGrid = activeCall.type === 'video' || participants.length > 2;

  // Luồng giao diện khi cuộc gọi đã kết nối (Connected)
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none overflow-hidden">
      
      {/* Header góc trái */}
      <div className="absolute top-4 left-4 z-30 flex flex-col bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/5 shadow-lg">
        <span className="font-semibold text-sm leading-tight text-gray-100 max-w-[200px] sm:max-w-xs truncate">
          {participantNamesText}
        </span>
        <span className="text-xs text-[#8ED8ED] font-mono tracking-wider mt-0.5">
          {timerText} • {participants.length} người
        </span>
      </div>

      {showGrid ? (
        // ------------------ GIAO DIỆN LƯỚI GRID MESH (VIDEO HOẶC GROUP VOICE) ------------------
        <div className="relative w-full h-full flex-1 bg-black flex flex-col pb-28 pt-20">
          <div className={`grid gap-4 w-full max-w-6xl mx-auto h-full p-4 flex-1 ${gridLayout.container}`}>
            {participants.map((p, index) => {
              const isLocal = p.userId.toLowerCase() === currentUserId?.toLowerCase();
              const hasVideo = activeCall.type === 'video' && (isLocal ? !isVideoOff : p.isCameraOn);
              const stream = isLocal ? localStream : remoteStreams[p.userId];

              return (
                <div 
                  key={p.userId}
                  className={`relative rounded-xl overflow-hidden bg-gray-900 border border-white/5 shadow-lg flex flex-col items-center justify-center transition-all ${gridLayout.item(index)}`}
                >
                  {/* Blur Avatar Background when camera is off */}
                  {!hasVideo && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center opacity-10 filter blur-3xl"
                      style={{ backgroundImage: `url(${p.urlAvatar || '/default-avatar.png'})` }}
                    />
                  )}

                  {/* Video Stream or Avatar */}
                  {hasVideo && stream ? (
                    <ParticipantVideo stream={stream} isLocal={isLocal} />
                  ) : (
                    <div className="flex flex-col items-center z-10">
                      <img 
                        src={p.urlAvatar || '/default-avatar.png'} 
                        alt={p.userName} 
                        className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white/10 shadow-2xl bg-gray-700"
                      />
                      {p.isCameraOn && !isLocal && (
                        <span className="text-xs text-gray-400 mt-2 animate-pulse">Connecting camera...</span>
                      )}
                    </div>
                  )}

                  {/* Overlay Name */}
                  <div className="absolute bottom-3 left-3 z-20 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 border border-white/5">
                    <span>{isLocal ? `${p.userName} (Bạn)` : p.userName}</span>
                    {isLocal && isMuted && (
                      <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider bg-red-950/50 px-1.5 py-0.5 rounded border border-red-500/20">Muted</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Toolbar dưới video */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 bg-black/60 backdrop-blur-md px-6 py-3.5 rounded-full border border-white/10 shadow-2xl">
            {/* Tắt camera */}
            {activeCall.type === 'video' && (
              <button 
                onClick={toggleVideo}
                className={`p-3 rounded-full transition-all active:scale-95 ${
                  isVideoOff ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}

            {/* Mute Mic */}
            <button 
              onClick={toggleMute}
              className={`p-3 rounded-full transition-all active:scale-95 ${
                isMuted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {/* Chia sẻ màn hình */}
            {activeCall.type === 'video' && (
              <button 
                onClick={toggleScreenShare}
                className={`p-3 rounded-full transition-all active:scale-95 ${
                  isScreenSharing ? 'bg-[#8ED8ED] text-gray-900' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <MonitorUp size={22} />
              </button>
            )}

            {/* Gác máy */}
            <button 
              onClick={() => cancelCall()}
              className="p-3.5 rounded-full bg-red-600 hover:bg-red-700 hover:rotate-12 transition-all active:scale-95 text-white"
            >
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      ) : (
        // ------------------ GIAO DIỆN VOICE CALL 1-1 ------------------
        <div className="relative flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 px-6 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-[#8ED8ED]/10 animate-pulse scale-110"></div>
            <img 
              src={activeCall.opponentAvatar || '/default-avatar.png'} 
              alt={activeCall.opponentName} 
              className="w-32 h-32 rounded-full object-cover border-4 border-[#8ED8ED]/20 shadow-2xl bg-gray-700"
            />
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-1">{activeCall.opponentName}</h2>
          <span className="text-[#8ED8ED] font-mono text-base font-medium mb-12 tracking-wide">{timerText}</span>

          {/* Sóng âm visualizer */}
          <div className="flex items-center gap-1 mb-20 h-10 select-none">
            <div className="w-1 bg-[#8ED8ED] rounded-full animate-[pulse_1s_infinite_100ms] h-6"></div>
            <div className="w-1 bg-[#8ED8ED] rounded-full animate-[pulse_1s_infinite_300ms] h-10"></div>
            <div className="w-1 bg-[#8ED8ED] rounded-full animate-[pulse_1s_infinite_200ms] h-8"></div>
            <div className="w-1 bg-[#8ED8ED] rounded-full animate-[pulse_1s_infinite_400ms] h-4"></div>
            <div className="w-1 bg-[#8ED8ED] rounded-full animate-[pulse_1s_infinite_150ms] h-7"></div>
          </div>

          {/* Controls Toolbar */}
          <div className="flex items-center gap-8 bg-white/5 backdrop-blur-md px-8 py-4 rounded-full border border-white/5 shadow-2xl">
            {/* Mute Mic */}
            <button 
              onClick={toggleMute}
              className={`p-3.5 rounded-full transition-all active:scale-95 ${
                isMuted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {/* Gác máy */}
            <button 
              onClick={() => cancelCall()}
              className="p-4 rounded-full bg-red-600 hover:bg-red-700 hover:rotate-12 transition-all active:scale-95 text-white"
            >
              <PhoneOff size={26} />
            </button>

            {/* Loa/Âm lượng (Chỉ biểu tượng hiển thị) */}
            <button 
              className="p-3.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"
            >
              <Volume2 size={22} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallWindow;
