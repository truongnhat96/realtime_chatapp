import { useMemo, useState, useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { chatApi } from '../../lib/api';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import { useMediaUpload } from '../../hooks/useMediaUpload';
import { useLastOnline } from '../../hooks/useLastOnline';
import { ArrowLeft, Phone, Video, Info, BellOff } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatDetailSidebar from './ChatDetailSidebar';
import GroupAvatar from './GroupAvatar';

interface Props {
  sendMessage: (
    conversationId: string,
    content: string,
    toUserId: string,
    messageType?: number,
    replyToMessageId?: string,
    mentionedUserIds?: string[],
    mentionEveryone?: boolean
  ) => Promise<void>;
  sendTyping: (conversationId: string, toUserId: string) => Promise<void>;
  stopTypingSignal: (conversationId: string, toUserId: string) => Promise<void>;
  markAsRead: (conversationId: string, messageId: string) => Promise<void>;
  leaveConversation?: (conversationId: string) => Promise<void>;
  isConnected: boolean;
}

export default function ChatArea({ sendMessage, sendTyping, stopTypingSignal, markAsRead, leaveConversation, isConnected }: Props) {
  const { conversations, activeConversationId, setActiveConversationId, onlineUsers, replyingMessage, setReplyingMessage } = useChatStore();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [showDetail, setShowDetail] = useState(false);

  const conversation = useMemo(() => {
    return conversations.find(c => c.conversationId === activeConversationId);
  }, [conversations, activeConversationId]);

  const isGroup = conversation?.type === 1;

  const lastFetchedIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!conversation || !isGroup) return;

    const hasLoadedAll = conversation.participants.length >= (conversation.groupInfo?.memberCount ?? 0);

    // 1. If already fetched and all participants loaded, skip
    if (lastFetchedIdRef.current === conversation.conversationId && hasLoadedAll) return;

    // 2. If a fetch is currently in progress for this conversation, skip
    if (isFetchingRef.current && lastFetchedIdRef.current === conversation.conversationId) return;

    lastFetchedIdRef.current = conversation.conversationId;
    isFetchingRef.current = true;

    void (async () => {
      try {
        const res = await chatApi.getConversationMembers(conversation.conversationId);
        if (res.isSuccess && res.data && lastFetchedIdRef.current === conversation.conversationId) {
          useChatStore.getState().updateConversationParticipants(
            conversation.conversationId,
            res.data.participants,
            res.data.participants.length
          );
        }
      } catch (err) {
        console.error('Error fetching conversation members:', err);
      } finally {
        isFetchingRef.current = false;
      }
    })();
  }, [conversation?.conversationId, isGroup, conversation?.participants.length, conversation?.groupInfo?.memberCount]);

  const user = conversation?.user;

  // Cho group, chọn 1 participant bất kỳ (không phải mình) để làm typing target
  const typingTargetUserId = useMemo(() => {
    if (!conversation) return '';
    return isGroup
      ? (conversation.participants.find(p => p.id !== currentUserId)?.id || '')
      : (user?.id || '');
  }, [conversation, isGroup, currentUserId, user]);

  const isOnline = useMemo(() => {
    if (!conversation) return false;
    if (isGroup) {
      // Nhóm: ít nhất 1 thành viên khác đang online
      return conversation.participants.some(
        p => p.id !== currentUserId && (onlineUsers[p.id.toLowerCase()] ?? p.isOnline)
      );
    }
    return user ? (onlineUsers[user.id.toLowerCase()] ?? user.isOnline ?? false) : false;
  }, [conversation, isGroup, user, onlineUsers, currentUserId]);

  // Lấy lastOnline phù hợp: private → user.lastOnline, group → muộn nhất trong các thành viên
  const lastOnline = useMemo(() => {
    if (!conversation || isOnline) return null; // Đang online, không cần
    if (!isGroup) {
      return user?.lastOnline || null;
    }
    // Group offline: tìm lastOnline muộn nhất trong các thành viên khác
    let latest: string | null = null;
    for (const p of conversation.participants) {
      if (p.id === currentUserId) continue;
      if (p.lastOnline) {
        if (!latest || new Date(p.lastOnline).getTime() > new Date(latest).getTime()) {
          latest = p.lastOnline;
        }
      }
    }
    return latest;
  }, [conversation, isOnline, isGroup, user, currentUserId]);

  const lastOnlineLabel = useLastOnline(lastOnline, isOnline);

  const {
    onTypingInputChange,
    stopTyping
  } = useTypingIndicator({
    conversationId: activeConversationId,
    toUserId: typingTargetUserId || null,
    currentUserId,
    isConnected,
    sendTyping,
    stopTypingSignal
  });

  const { handleSendMediaFiles } = useMediaUpload({
    conversationId: activeConversationId || '',
    stopTyping,
  });

  if (!conversation || !activeConversationId) return null;

  const startCall = useCallStore.getState().startCall;
  const joinGroupCall = useCallStore.getState().joinGroupCall;

  const handleVoiceCall = () => {
    if (isGroup && conversation.callId && conversation.callDetail && conversation.callDetail.status === 3) {
      void joinGroupCall(conversation.callId, conversation.conversationId, 'voice', conversation.callDetail.startedByUserId);
      return;
    }
    const opponentUserId = isGroup ? '' : (user?.id || '');
    const opponentName = isGroup ? (conversation.groupInfo?.name || 'Nhóm chat') : (user?.name || 'Người dùng');
    const opponentAvatar = isGroup ? (conversation.groupInfo?.groupImage || '') : (user?.urlAvatar || '');

    void startCall(conversation.conversationId, 'voice', opponentUserId, opponentName, opponentAvatar);
  };

  const handleVideoCall = () => {
    if (isGroup && conversation.callId && conversation.callDetail && conversation.callDetail.status === 3) {
      void joinGroupCall(conversation.callId, conversation.conversationId, 'video', conversation.callDetail.startedByUserId);
      return;
    }
    const opponentUserId = isGroup ? '' : (user?.id || '');
    const opponentName = isGroup ? (conversation.groupInfo?.name || 'Nhóm chat') : (user?.name || 'Người dùng');
    const opponentAvatar = isGroup ? (conversation.groupInfo?.groupImage || '') : (user?.urlAvatar || '');

    void startCall(conversation.conversationId, 'video', opponentUserId, opponentName, opponentAvatar);
  };

  const displayName = isGroup
    ? (conversation.groupInfo?.name || 'Nhóm chat')
    : (user?.name || '');

  const statusText = !isConnected
    ? 'Đang kết nối...'
    : isGroup
      ? (isOnline ? 'Đang hoạt động' : (lastOnlineLabel !== 'Ngoại tuyến' ? lastOnlineLabel : `${conversation.groupInfo?.memberCount || conversation.participants.length} thành viên`))
      : lastOnlineLabel;

  const handleSendMessage = async (text: string, mentionedUserIds?: string[], mentionEveryone?: boolean) => {
    // Send via signalR
    const replyId = replyingMessage?.messageId;
    setReplyingMessage(null);
    await sendMessage(activeConversationId, text, typingTargetUserId, undefined, replyId, mentionedUserIds, mentionEveryone);
    stopTyping();
  };

  const handleSendSticker = async (stickerUrl: string) => {
    const replyId = replyingMessage?.messageId;
    setReplyingMessage(null);
    await sendMessage(activeConversationId, stickerUrl, typingTargetUserId, 6, replyId);
  };

  const handleSendMediaFilesWithReply = async (files: File[], _content: string | null) => {
    const replyId = replyingMessage?.messageId;
    setReplyingMessage(null);
    await handleSendMediaFiles(files, replyId);
  };

  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#1E1E1E] transition-colors duration-200 min-w-0">
        {/* Header */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3.5">
            <button
              className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full"
              onClick={() => setActiveConversationId(null)}
            >
              <ArrowLeft size={22} />
            </button>

            <div className="relative flex-shrink-0">
              {isGroup ? (
                <>
                  <GroupAvatar
                    groupImage={conversation.groupInfo?.groupImage}
                    participants={conversation.participants}
                    size={48}
                    totalMembers={conversation.groupInfo?.memberCount}
                  />
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full transition-colors"></div>
                  )}
                </>
              ) : (
                <>
                  <img src={user?.urlAvatar || '/default-avatar.png'} alt={user?.name} className="w-12 h-12 rounded-full object-cover bg-gray-200" />
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full transition-colors"></div>
                  )}
                </>
              )}
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900 dark:text-white leading-tight">{displayName}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-[#8ED8ED]">{statusText}</span>
                {conversation.isMuted && (
                  <>
                    <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                    <BellOff size={12} className="text-gray-400 dark:text-gray-500" />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <button onClick={handleVoiceCall} className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden sm:block">
              <Phone size={22} />
            </button>
            <button onClick={handleVideoCall} className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden sm:block">
              <Video size={22} />
            </button>
            <button
              onClick={() => setShowDetail(!showDetail)}
              className={`p-2.5 rounded-full transition-colors ${showDetail
                ? 'bg-[#8ED8ED]/20 text-[#8ED8ED]'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              <Info size={22} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <MessageList conversationId={activeConversationId} markAsRead={markAsRead} isConnected={isConnected} />

        {/* Input hoặc thông báo bị xóa */}
        {conversation.isRemovedFromGroup ? (
          <div className="px-5 py-4 bg-white dark:bg-[#1E1E1E] border-t border-gray-200 dark:border-gray-800 text-center flex flex-col gap-1 justify-center items-center select-none">
            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Bạn không thể nhắn tin cho nhóm này
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-xl leading-normal">
              Bạn đã rời khỏi nhóm này và không thể gửi hoặc nhận cuộc gọi/tin nhắn nữa, trừ khi có người thêm lại bạn vào nhóm.
            </p>
          </div>
        ) : (
          <ChatInput
            conversation={conversation}
            onSendMessage={handleSendMessage}
            onSendMediaFiles={handleSendMediaFilesWithReply}
            onSendSticker={handleSendSticker}
            onTypingInputChange={onTypingInputChange}
            onStopTyping={stopTyping}
            disabled={!isConnected}
            replyingMessage={replyingMessage}
            onCancelReply={() => setReplyingMessage(null)}
          />
        )}
      </div>

      {/* Right Sidebar */}
      {showDetail && (
        <div className="w-80 flex-shrink-0 hidden md:block">
          <ChatDetailSidebar
            conversation={conversation}
            onClose={() => setShowDetail(false)}
            onLeaveConversation={leaveConversation}
          />
        </div>
      )}
    </div>
  );
}
