import { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore, resolveUserName } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';
import GroupAvatar from './GroupAvatar';
import { convertUtcToLocal, formatSystemMessage, getReactionEmoji } from '../../lib/utils';
import { useMessageTime } from '../../hooks/useLastOnline';
import type { ConversationItem, MessageItem } from '../../types/chat';

const PAGE_SIZE = 10;

export default function ConversationList() {
  const { conversations, messages, activeConversationId, openConversation, onlineUsers, setConversations, appendConversations } = useChatStore();
  // const userCache = useChatStore(state => state.userCache);
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
        const fetched = res.data.items.map(conv => ({
          ...conv,
          timeMessage: convertUtcToLocal(conv.timeMessage),
          seenMessage: convertUtcToLocal(conv.seenMessage),
          participants: conv.participants.map(p => ({
            ...p,
            joinedAt: p.joinedAt ? convertUtcToLocal(p.joinedAt) : p.joinedAt,
            lastReadAt: p.lastReadAt ? convertUtcToLocal(p.lastReadAt) : p.lastReadAt,
          })),
        }));

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

  // Auto clear unread state in store if the active conversation is removed from group
  useEffect(() => {
    if (activeConversationId) {
      const activeConv = conversations.find(c => c.conversationId === activeConversationId);
      if (activeConv?.isRemovedFromGroup && (activeConv.isUnread || (activeConv.boxChatInfo?.unreadCount ?? 0) > 0)) {
        useChatStore.getState().setConversationUnread(activeConversationId, false);
      }
    }
  }, [activeConversationId, conversations]);

  // Infinite scroll: load more when scrolled to bottom
  const handleScroll = () => {
    if (!containerRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      fetchConversations(pageNumber + 1);
    }
  };

  const handleSelect = async (id: string) => {
    openConversation(id);
    // Mark reaction notification as read if needed
    const conv = conversations.find(c => c.conversationId === id);
    if (
      conv?.lastReactNotification &&
      !conv.lastReactNotification.isRead &&
      currentUserId &&
      conv.lastReactNotification.targetUserId.toLowerCase() === currentUserId.toLowerCase()
    ) {
      useChatStore.getState().markReactNotificationAsReadLocal(id);
    }
  };

  // const formatTime = (isoString: string) => {
  //   if (!isoString) return '';
  //   const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  //   if (match) {
  //     const [_, year, month, day, hour, minute] = match;
  //     const now = new Date();
  //     const formatter = new Intl.DateTimeFormat('en-US', {
  //       timeZone: 'Asia/Ho_Chi_Minh',
  //       year: 'numeric',
  //       month: '2-digit',
  //       day: '2-digit'
  //     });
  //     const parts = formatter.formatToParts(now);
  //     const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  //     const vnToday = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  //     const msgDate = `${year}-${month}-${day}`;

  //     if (vnToday === msgDate) {
  //       return `${hour}:${minute}`;
  //     }
  //     return `${day}-${month}`;
  //   }

  //   const date = new Date(isoString);
  //   if (isNaN(date.getTime())) return '';
  //   return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }).replace(/\//g, '-');
  // };

  const visibleConversations = conversations.filter(conv => {
    if (conv.type === 1) return true;
    const hasLastMessage = conv.boxChatInfo?.lastMessageId && conv.boxChatInfo.lastMessageId !== '00000000-0000-0000-0000-000000000000';
    return (
      !!conv.message ||
      conv.messageType !== 0 ||
      !!conv.isRevoked ||
      !!hasLastMessage ||
      (messages[conv.conversationId] && messages[conv.conversationId].length > 0)
    );
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

      {visibleConversations.map((conv) => (
        <ConversationItem
          key={conv.conversationId}
          conv={conv}
          isActive={activeConversationId === conv.conversationId}
          currentUserId={currentUserId}
          onlineUsers={onlineUsers}
          messages={messages}
          onSelect={handleSelect}
        />
      ))}

      {isLoading && conversations.length > 0 && (
        <div className="flex justify-center p-3">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={20} />
        </div>
      )}
    </div>
  );
}

interface ConversationItemProps {
  conv: ConversationItem;
  isActive: boolean;
  currentUserId: string | undefined;
  onlineUsers: Record<string, boolean>;
  messages: Record<string, MessageItem[]>;
  onSelect: (id: string) => void;
}

function ConversationItem({
  conv,
  isActive,
  currentUserId,
  onlineUsers,
  messages,
  onSelect,
}: ConversationItemProps) {
  // const userCache = useChatStore(state => state.userCache);
  const timeLabel = useMessageTime(conv.timeMessage);

  const isGroup = conv.type === 1;
  const avatarUser = !isGroup ? conv.user : null;
  const isOnline = avatarUser ? (onlineUsers[avatarUser.id.toLowerCase()] ?? avatarUser.isOnline) : false;

  const displayName = isGroup
    ? (conv.groupInfo?.name || 'Nhóm chat')
    : (avatarUser?.name || '');

  const rawUnreadCount = conv.boxChatInfo?.unreadCount ?? (conv.isUnread ? 1 : 0);
  const cachedLastMessage = messages[conv.conversationId]?.[messages[conv.conversationId].length - 1];
  const lastSenderId = conv.boxChatInfo?.lastMessageSenderId || conv.lastMessageSenderId || cachedLastMessage?.fromUserId;
  const lastMessageId = conv.boxChatInfo?.lastMessageId || cachedLastMessage?.id;
  const opponentLastReadMessageId = conv.boxChatInfo?.opponentLastReadMessageId || conv.lastReadMessageId;
  const isMine = !!lastSenderId && !!currentUserId && lastSenderId.toLowerCase() === currentUserId.toLowerCase();
  const unreadCount = isMine ? 0 : rawUnreadCount;
  const hasUnreadReactNotification = !!(conv.lastReactNotification
    && !conv.lastReactNotification.isRead
    && currentUserId
    && conv.lastReactNotification.targetUserId.toLowerCase() === currentUserId.toLowerCase());
  const isUnread = isActive ? false : (unreadCount > 0 || hasUnreadReactNotification);

  const isSeenByOpponent = !isGroup && isMine && !isUnread && !!lastMessageId && opponentLastReadMessageId === lastMessageId;

  const isSystemMessage = conv.messageType === 4;
  const messagePrefix = isSystemMessage
    ? ''
    : isGroup && isMine
      ? 'Bạn: '
      : isGroup && conv.lastMessageSenderName
        ? `${conv.lastMessageSenderName}: `
        : isMine
          ? 'Bạn: '
          : '';

  const lastSenderName = isMine
    ? 'Bạn'
    : isGroup
      ? (conv.lastMessageSenderName || 'Thành viên')
      : (avatarUser?.name || 'Đối phương');

  const showReactNotification = !!conv.lastReactNotification;
  const showPrefix = !conv.isRemovedFromGroup && !!messagePrefix && !conv.isRevoked && !showReactNotification;

  let displayMessage = conv.message;
  if (isSystemMessage) {
    const lastSysMsg = conv.systemMessages?.[0];
    if (lastSysMsg) {
      displayMessage = formatSystemMessage(
        lastSysMsg.type,
        lastSysMsg.actionUserId,
        lastSysMsg.targetUserId,
        currentUserId,
        (id, isCapital) => resolveUserName(id, conv.conversationId, isCapital),
        conv.groupInfo?.name,
        conv.message
      );
    } else {
      displayMessage = 'Tin nhắn hệ thống';
    }
  }

  const isGroupOnline = isGroup && conv.participants.some(p => {
    if (p.id.toLowerCase() === currentUserId?.toLowerCase()) return false;
    return onlineUsers[p.id.toLowerCase()] ?? p.isOnline ?? false;
  });

  return (
    <div
      onClick={() => onSelect(conv.conversationId)}
      className={`flex items-center gap-3.5 p-3.5 rounded-xl cursor-pointer transition-all mb-1
        ${isActive
          ? 'bg-[#8ED8ED]/20 dark:bg-[#8ED8ED]/10'
          : 'hover:bg-gray-100 dark:hover:bg-[#2C2C2C]'
        }
      `}
    >
      <div className="relative flex-shrink-0">
        {isGroup ? (
          <>
            <GroupAvatar
              groupImage={conv.groupInfo?.groupImage}
              participants={conv.participants}
              size={56}
              totalMembers={conv.groupInfo?.memberCount}
            />
            {isGroupOnline && (
              <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full transition-colors"></div>
            )}
          </>
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
            {timeLabel}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <p className={`text-sm truncate flex-1 ${isUnread ? 'text-gray-900 dark:text-white font-bold' : isActive ? 'text-gray-900 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
            {showPrefix && <span className="mr-0">{messagePrefix}</span>}
            {conv.isRemovedFromGroup
              ? 'Bạn đã bị xóa khỏi nhóm'
              : showReactNotification
                ? <span>
                    {resolveUserName(conv.lastReactNotification!.reactorUserId, conv.conversationId, true)}
                    {` đã bày tỏ cảm xúc ${getReactionEmoji(conv.lastReactNotification!.reactionType)} về tin nhắn`}
                  </span>
                : conv.isRevoked
                  ? <span>{isMine ? 'Bạn đã thu hồi một tin nhắn' : `${lastSenderName} đã thu hồi một tin nhắn`}</span>
                  : (conv.messageType === 1 ? '[Hình ảnh]' : conv.messageType === 2 ? '[Video]' : conv.messageType === 3 ? '[File]' : conv.messageType === 5 ? '[Liên kết]' : conv.messageType === 6 ? '[Nhãn dán]' : displayMessage)
            }
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
}
