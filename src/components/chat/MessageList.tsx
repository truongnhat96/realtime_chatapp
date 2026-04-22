import { useEffect, useRef, useState, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';


const EMPTY_TYPING_USERS: Array<{ userId: string; userName?: string; updatedAt: number }> = [];
const STALE_TYPING_MAX_AGE_MS = 5000;

interface Props {
  conversationId: string;
  markAsRead: (messageId: string, conversationId: string, senderUserId: string, isRead: boolean) => Promise<void>;
  isConnected: boolean;
}

export default function MessageList({ conversationId, markAsRead, isConnected }: Props) {
  const { messages, setMessages, prependMessages, conversations } = useChatStore();
  const typingByConversationId = useChatStore((state) => state.typingByConversationId);
  const conversationOpenSignal = useChatStore((state) => state.conversationOpenSignal[conversationId] || 0);
  const currentUserId = useAuthStore(state => state.user?.id);
  const opponentUser = conversations.find(c => c.conversationId === conversationId)?.user;

  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentMessages = messages[conversationId] || [];
  const activeConversation = useMemo(
    () => conversations.find((c) => c.conversationId === conversationId),
    [conversations, conversationId]
  );
  const unreadCount = activeConversation?.boxChatInfo?.unreadCount ?? (activeConversation?.isUnread ? 1 : 0);

  const lastMarkedReadIdRef = useRef<string | null>(null);
  const lastObservedMessageIdRef = useRef<string | null>(null);
  const hasMountedConversationRef = useRef(false);

  useEffect(() => {
    lastMarkedReadIdRef.current = null;
    lastObservedMessageIdRef.current = null;
    hasMountedConversationRef.current = false;
  }, [conversationId]);

  // Logic đánh dấu "Đã xem" tập trung: Chỉ gọi Hub 1 lần cho tin nhắn cuối cùng
  useEffect(() => {
    if (!currentUserId || !conversationId || currentMessages.length === 0 || !isConnected) return;
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (!lastMessage) return;

    // Yêu cầu nghiệp vụ:
    // - Tin cuối chưa đọc (list đang bold) => gửi isRead = false
    // - Đang mở chat và có incoming mới vừa đến => gửi isRead = false
    // - Các trường hợp còn lại => gửi isRead = true
    const isIncomingLastMessage = lastMessage.fromUserId !== currentUserId;
    const hasUnreadByConversation = unreadCount > 0 && isIncomingLastMessage;

    const isNewIncomingWhileOpen =
      hasMountedConversationRef.current &&
      isIncomingLastMessage &&
      !!lastObservedMessageIdRef.current &&
      lastObservedMessageIdRef.current !== lastMessage.id;

    const shouldMarkUnread = hasUnreadByConversation || isNewIncomingWhileOpen;
    const isRead = !shouldMarkUnread;
    const currentKey = `${lastMessage.id}:${isRead}:${conversationOpenSignal}`;

    lastObservedMessageIdRef.current = lastMessage.id;
    hasMountedConversationRef.current = true;

    if (currentKey === lastMarkedReadIdRef.current) return;

    lastMarkedReadIdRef.current = currentKey;

    void (async () => {
      await markAsRead(lastMessage.id, conversationId, lastMessage.fromUserId, isRead);

      if (shouldMarkUnread && isIncomingLastMessage) {
        // Đánh dấu ngay ở local (nếu chờ hub có thể bị delay)
        useChatStore.getState().markMessageAsSeen(conversationId, lastMessage.id);
      }
    })();
  }, [conversationId, currentMessages, currentUserId, markAsRead, isConnected, unreadCount, conversationOpenSignal]);



  // Tìm ID của tin nhắn cuối cùng đối phương đã đọc
  const lastReadMessageId = useMemo(() => {
    const conv = conversations.find(c => c.conversationId === conversationId);
    return conv?.boxChatInfo?.opponentLastReadMessageId || conv?.lastReadMessageId;
  }, [conversations, conversationId]);
  const typingUsers = typingByConversationId[conversationId] || EMPTY_TYPING_USERS;
  const isOpponentTyping = typingUsers.some((entry) => {
    if (entry.userId === currentUserId) return false;
    return Date.now() - entry.updatedAt <= STALE_TYPING_MAX_AGE_MS;
  });

  // Fetch initial messages when conversation changes
  useEffect(() => {
    setPageNumber(1);
    setHasMore(true);
    fetchMessages(1, true);
  }, [conversationId]);

  // Scroll to bottom dynamically on new message (only if initially loaded or already near bottom)
  // Simplified: always scroll to bottom on initial load, or when sending/receiving new message.
  useEffect(() => {
    if (pageNumber === 1 && currentMessages.length > 0) {
      scrollToBottom();
    } else if (currentMessages.length > 0) {
      // If a single message was added at the end (not Prepended), scroll to bottom
      scrollToBottom();
    }
  }, [currentMessages.length]);

  useEffect(() => {
    if (isOpponentTyping) {
      scrollToBottom();
    }
  }, [isOpponentTyping]);

  const fetchMessages = async (page: number, isInitial = false) => {
    if (!hasMore && !isInitial) return;
    setIsLoading(true);
    try {
      const res = await chatApi.getMessages(conversationId, 20, page);
      if (res.isSuccess && res.data) {
        const fetched = res.data.items.reverse(); // API might return oldest first, or newest first. Need to reverse to match bottom-to-top rendering appropriately depending on API. Usually pagination gives newest page 1, descending. So reverse it to show oldest at top.

        // Fallback phục hồi read cursor khi vào lại chat: lấy tin gần nhất của mình đã được đối phương xem.
        if (isInitial && currentUserId) {
          const inferredOpponentReadId = [...fetched]
            .reverse()
            .find((m) => m.fromUserId === currentUserId && m.isSeen)?.id;

          if (inferredOpponentReadId) {
            useChatStore.getState().updateOpponentLastReadMessageId(conversationId, inferredOpponentReadId);
          }
        }

        if (isInitial) {
          setMessages(conversationId, fetched);
        } else {
          // Store previous scroll height to maintain scroll position
          const previousScrollHeight = containerRef.current?.scrollHeight || 0;
          prependMessages(conversationId, fetched);

          // Restore scroll position after React renders
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight - previousScrollHeight;
            }
          }, 0);
        }

        setHasMore(res.data.hasNextPage);
        setPageNumber(res.data.currentPage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = () => {
    if (!containerRef.current || isLoading || !hasMore) return;
    // Load more when scrolled to top
    if (containerRef.current.scrollTop === 0) {
      fetchMessages(pageNumber + 1);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-5 flex flex-col bg-gray-50 dark:bg-[#121212]"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {isLoading && (
        <div className="flex justify-center p-3">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={24} />
        </div>
      )}

      {!isLoading && opponentUser && (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <img
            src={opponentUser.urlAvatar || '/default-avatar.png'}
            alt={opponentUser.name}
            className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover bg-gray-200 mb-4"
          />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {opponentUser.name}
          </h3>
          {currentMessages.length === 0 && (
            <p className="text-gray-400 dark:text-gray-500 text-xs text-center uppercase tracking-wider font-semibold">
              Bạn và {opponentUser.name} chưa có cuộc trò chuyện nào!
            </p>
          )}
        </div>
      )}

      {currentMessages.map((msg, idx) => {
        const isMine = msg.fromUserId === currentUserId;
        const prevMsg = currentMessages[idx - 1];
        const nextMsg = currentMessages[idx + 1];
        const isSameSenderAsPrev = prevMsg?.fromUserId === msg.fromUserId;
        const isSameSenderAsNext = nextMsg?.fromUserId === msg.fromUserId;
        // Show avatar only on the LAST message of an opponent group
        const showAvatar = !isMine && !isSameSenderAsNext;
        // Tight gap within same-sender group, larger gap between groups
        const marginTop = idx === 0 ? 'mt-0' : isSameSenderAsPrev ? 'mt-0.5' : 'mt-4';
        
        // Hiển thị avatar người nhận đã đọc (Messenger style)
        // Hiện ở tin nhắn cuối cùng đối phương đã đọc (dù là tin của ai)
        const isLastReadByOpponent = msg.id === lastReadMessageId && opponentUser;

        return (
          <div key={msg.id || idx} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${marginTop} w-full`}>
            <div className={`flex items-end gap-2 max-w-[85%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
              {!isMine && (
                <div className="w-9 flex-shrink-0">
                  {showAvatar ? (
                    <img
                      src={opponentUser?.urlAvatar || '/default-avatar.png'}
                      alt={opponentUser?.name || ''}
                      className="w-9 h-9 rounded-full object-cover bg-gray-200"
                    />
                  ) : (
                    <div className="w-9" />
                  )}
                </div>
              )}

              <div className={`relative group flex flex-col ${isMine ? 'items-end' : 'items-start'} min-w-0`}>
                <div
                  className={`py-2 px-4 text-[15px] leading-relaxed break-words w-fit ${isMine
                    ? `bg-[#8ED8ED] text-gray-900 ${isSameSenderAsPrev && isSameSenderAsNext ? 'rounded-2xl rounded-br-sm'
                      : isSameSenderAsPrev ? 'rounded-2xl rounded-tr-sm rounded-br-none'
                        : isSameSenderAsNext ? 'rounded-2xl rounded-br-sm'
                          : 'rounded-2xl rounded-br-none'
                    }`
                    : `bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-gray-100 shadow-sm ${isSameSenderAsPrev && isSameSenderAsNext ? 'rounded-2xl rounded-bl-sm'
                      : isSameSenderAsPrev ? 'rounded-2xl rounded-tl-sm rounded-bl-none'
                        : isSameSenderAsNext ? 'rounded-2xl rounded-bl-sm'
                          : 'rounded-2xl rounded-bl-none'
                    }`
                  }`}
                >
                  {msg.content}
                </div>
                {/* Timestamp: hiện khi hover */}
                <span className={`absolute -top-5 text-[10px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isMine ? 'right-0' : 'left-0'}`}>
                  {formatMessageTime(msg.sendTime)}
                </span>
              </div>
            </div>
            
            {/* Messenger style: Avatar nhỏ hiện ở góc phải dưới cùng của list */}
            {isLastReadByOpponent && (
              <div className={`mt-1 animate-fade-in-up ${!isMine ? 'self-end mr-0.5' : 'mr-0.5'}`}>
                <img 
                  src={opponentUser.urlAvatar || '/default-avatar.png'} 
                  alt="read" 
                  className="w-3.5 h-3.5 rounded-full border border-white dark:border-[#121212] shadow-sm grayscale-[0.2]"
                  title={`Đã xem lúc ${formatMessageTime(msg.sendTime)}`}
                />
              </div>
            )}
          </div>
        );
      })}

      {isOpponentTyping && opponentUser && (
        <div className="flex justify-start max-w-full mt-2">
          <div className="w-10 mr-2.5 flex-shrink-0 flex items-end">
            <img
              src={opponentUser.urlAvatar || '/default-avatar.png'}
              alt={opponentUser.name}
              className="w-10 h-10 rounded-full object-cover bg-gray-200"
            />
          </div>

          <div className="max-w-[72%] flex flex-col items-start relative">
            <div className="py-2 px-3.5 bg-white dark:bg-[#2C2C2C] rounded-2xl rounded-bl-none shadow-sm">
              <span className="inline-flex items-center gap-1" aria-label={`${opponentUser.name} đang nhập`}>
                <span className="w-2 h-2 rounded-full bg-gray-400/90 dark:bg-gray-300/80 animate-bounce [animation-delay:-0.32s]" />
                <span className="w-2 h-2 rounded-full bg-gray-400/90 dark:bg-gray-300/80 animate-bounce [animation-delay:-0.16s]" />
                <span className="w-2 h-2 rounded-full bg-gray-400/90 dark:bg-gray-300/80 animate-bounce" />
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
