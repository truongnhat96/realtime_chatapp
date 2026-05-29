import { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';
import GroupAvatar from './GroupAvatar';

const PAGE_SIZE = 10;

export default function ConversationList() {
  const { conversations, messages, activeConversationId, openConversation, onlineUsers, setConversations, appendConversations } = useChatStore();
  const currentUserId = useAuthStore(state => state.user?.id);

  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async (page: number, isInitial = false) => {
    if (!currentUserId || (!hasMore && !isInitial)) return;
    setIsLoading(true);
    try {
      const res = await chatApi.getConversations(currentUserId, PAGE_SIZE, page);
      if (res.isSuccess && res.data) {
        const fetched = res.data.items;

        if (isInitial) {
          setConversations(fetched);
        } else {
          appendConversations(fetched);
        }

        setHasMore(res.data.hasNextPage);
        setPageNumber(res.data.currentPage);
      }
    } catch (error) {
      console.error("Failed to load conversations", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, hasMore, setConversations, appendConversations]);

  // Load initial page
  useEffect(() => {
    if (!currentUserId) return;
    setPageNumber(1);
    setHasMore(true);
    fetchConversations(1, true);
  }, [currentUserId]);

  // Infinite scroll: load more when scrolled to bottom
  const handleScroll = () => {
    if (!containerRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      fetchConversations(pageNumber + 1);
    }
  };

  const handleSelect = (id: string) => {
    openConversation(id);
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    // if today, show HH:MM, else show DD/MM
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  };

  const visibleConversations = conversations.filter(conv => {
    if (conv.type === 1) return true;
    console.log(conv.messageType, conv.user?.name)
    return !!conv.message || conv.messageType !== 0 || (messages[conv.conversationId] && messages[conv.conversationId].length > 0);
  });

  return (
    <div className="flex-1 overflow-y-auto px-2" ref={containerRef} onScroll={handleScroll}>
      {isLoading && visibleConversations.length === 0 && (
        <div className="flex justify-center p-4 mt-10">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={24} />
        </div>
      )}

      {!isLoading && visibleConversations.length === 0 && (
        <div className="text-center text-gray-500 mt-10 text-sm">
          Chưa có cuộc trò chuyện nào
        </div>
      )}

      {visibleConversations.map((conv) => {
        const isGroup = conv.type === 1;
        const isActive = activeConversationId === conv.conversationId;

        // Avatar & Online status
        const avatarUser = !isGroup ? conv.user : null;
        const isOnline = avatarUser ? (onlineUsers[avatarUser.id.toLowerCase()] ?? avatarUser.isOnline) : false;

        // Display name
        const displayName = isGroup
          ? (conv.groupInfo?.name || 'Nhóm chat')
          : (avatarUser?.name || '');

        // Unread logic
        const rawUnreadCount = conv.boxChatInfo?.unreadCount ?? (conv.isUnread ? 1 : 0);
        const cachedLastMessage = messages[conv.conversationId]?.[messages[conv.conversationId].length - 1];
        const lastSenderId = conv.boxChatInfo?.lastMessageSenderId || conv.lastMessageSenderId || cachedLastMessage?.fromUserId;
        const lastMessageId = conv.boxChatInfo?.lastMessageId || cachedLastMessage?.id;
        const opponentLastReadMessageId = conv.boxChatInfo?.opponentLastReadMessageId || conv.lastReadMessageId;
        const isMine = !!lastSenderId && !!currentUserId && lastSenderId.toLowerCase() === currentUserId.toLowerCase();
        // Tin nhắn cuối là của mình thì không hiển thị trạng thái unread.
        const unreadCount = isMine ? 0 : rawUnreadCount;
        const isUnread = unreadCount > 0;

        // Avatar "đã xem" chỉ hiện khi: chat 1-1, tin cuối là của mình, đối phương đã đọc đúng tin cuối
        const isSeenByOpponent = !isGroup && isMine && !isUnread && !!lastMessageId && opponentLastReadMessageId === lastMessageId;

        // Preview message prefix
        const messagePrefix = isGroup && isMine
          ? 'Bạn: '
          : isGroup && conv.lastMessageSenderName
            ? `${conv.lastMessageSenderName}: `
            : isMine
              ? 'Bạn: '
              : '';

        return (
          <div
            key={conv.conversationId}
            onClick={() => handleSelect(conv.conversationId)}
            className={`flex items-center gap-3.5 p-3.5 rounded-xl cursor-pointer transition-all mb-1
              ${isActive
                ? 'bg-[#8ED8ED]/20 dark:bg-[#8ED8ED]/10'
                : 'hover:bg-gray-100 dark:hover:bg-[#2C2C2C]'
              }
            `}
          >
            <div className="relative flex-shrink-0">
              {isGroup ? (
                <GroupAvatar
                  groupImage={conv.groupInfo?.groupImage}
                  participants={conv.participants}
                  size={56}
                  totalMembers={conv.groupInfo?.memberCount}
                />
              ) : (
                <>
                  <img src={avatarUser?.urlAvatar || '/default-avatar.png'} alt={displayName} className="w-14 h-14 rounded-full object-cover bg-gray-200" />
                  {isOnline && (
                    <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full transition-colors"></div>
                  )}
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <h4 className={`text-[15px] truncate pr-2 ${isUnread ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-900 dark:text-white font-semibold'}`}>
                  {displayName}
                </h4>
                <span className={`text-xs flex-shrink-0 ${isUnread ? 'text-[#8ED8ED] font-bold' : 'text-gray-400'}`}>
                  {formatTime(conv.timeMessage)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <p className={`text-sm truncate flex-1 ${isUnread ? 'text-gray-900 dark:text-white font-bold' : isActive ? 'text-gray-900 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                  {messagePrefix && <span className="mr-0">{messagePrefix}</span>}
                  {conv.messageType === 1 ? '[Hình ảnh]' : conv.messageType === 2 ? '[Video]' : conv.messageType === 3 ? '[File]' : conv.message}
                </p>
                {isUnread ? (
                  <div className="w-2.5 h-2.5 bg-[#8ED8ED] rounded-full flex-shrink-0"></div>
                ) : isSeenByOpponent && avatarUser ? (
                  <img src={avatarUser.urlAvatar || '/default-avatar.png'} alt="seen" className="w-4 h-4 rounded-full flex-shrink-0 grayscale-[0.5]" />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      {isLoading && conversations.length > 0 && (
        <div className="flex justify-center p-3">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={20} />
        </div>
      )}
    </div>
  );
}
