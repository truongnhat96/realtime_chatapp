import { useMemo, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import { useMediaUpload } from '../../hooks/useMediaUpload';
import { ArrowLeft, Phone, Video, Info } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatDetailSidebar from './ChatDetailSidebar';
import GroupAvatar from './GroupAvatar';

interface Props {
  sendMessage: (conversationId: string, content: string, toUserId: string) => Promise<void>;
  sendTyping: (conversationId: string, toUserId: string) => Promise<void>;
  stopTypingSignal: (conversationId: string, toUserId: string) => Promise<void>;
  markAsRead: (conversationId: string, messageId: string) => Promise<void>;
  leaveConversation?: (conversationId: string) => Promise<void>;
  isConnected: boolean;
}

export default function ChatArea({ sendMessage, sendTyping, stopTypingSignal, markAsRead, leaveConversation, isConnected }: Props) {
  const { conversations, activeConversationId, setActiveConversationId, onlineUsers } = useChatStore();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [showDetail, setShowDetail] = useState(false);

  const conversation = useMemo(() => {
    return conversations.find(c => c.conversationId === activeConversationId);
  }, [conversations, activeConversationId]);

  if (!conversation || !activeConversationId) return null;

  const isGroup = conversation.type === 1;
  const user = conversation.user;

  // Cho group, chọn 1 participant bất kỳ (không phải mình) để làm typing target
  const typingTargetUserId = isGroup
    ? (conversation.participants.find(p => p.id !== currentUserId)?.id || '')
    : (user?.id || '');

  const isOnline = !isGroup && user ? (onlineUsers[user.id.toLowerCase()] ?? user.isOnline) : false;

  const displayName = isGroup
    ? (conversation.groupInfo?.name || 'Nhóm chat')
    : (user?.name || '');

  const statusText = !isConnected
    ? 'Đang kết nối...'
    : isGroup
      ? `${conversation.groupInfo?.memberCount || conversation.participants.length} thành viên`
      : (isOnline ? 'Đang hoạt động' : 'Ngoại tuyến');

  const {
    onTypingInputChange,
    stopTyping
  } = useTypingIndicator({
    conversationId: activeConversationId,
    toUserId: typingTargetUserId,
    currentUserId,
    isConnected,
    sendTyping,
    stopTypingSignal
  });

  const { handleSendMediaFiles } = useMediaUpload({
    conversationId: activeConversationId,
    stopTyping,
  });

  const handleSendMessage = async (text: string) => {
    // Send via signalR
    await sendMessage(activeConversationId, text, typingTargetUserId);
    stopTyping();
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
                <GroupAvatar
                  groupImage={conversation.groupInfo?.groupImage}
                  participants={conversation.participants}
                  size={48}
                  totalMembers={conversation.groupInfo?.memberCount}
                />
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
              <span className="text-xs text-[#8ED8ED]">{statusText}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden sm:block">
              <Phone size={22} />
            </button>
            <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden sm:block">
              <Video size={22} />
            </button>
            <button
              onClick={() => setShowDetail(!showDetail)}
              className={`p-2.5 rounded-full transition-colors ${
                showDetail
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
          <div className="px-5 py-4 bg-gray-50 dark:bg-[#181818] border-t border-gray-200 dark:border-gray-800 text-center">
            <span className="text-sm text-gray-500 dark:text-gray-400 italic">
              Bạn đã bị xóa khỏi nhóm
            </span>
          </div>
        ) : (
          <ChatInput
            onSendMessage={handleSendMessage}
            onSendMediaFiles={handleSendMediaFiles}
            onTypingInputChange={onTypingInputChange}
            onStopTyping={stopTyping}
            disabled={!isConnected}
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
