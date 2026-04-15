import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';

interface Props {
  conversationId: string;
}

export default function MessageList({ conversationId }: Props) {
  const { messages, setMessages, prependMessages, conversations } = useChatStore();
  const currentUserId = useAuthStore(state => state.user?.id);
  const opponentUser = conversations.find(c => c.conversationId === conversationId)?.user;

  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentMessages = messages[conversationId] || [];

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

  const fetchMessages = async (page: number, isInitial = false) => {
    if (!hasMore && !isInitial) return;
    setIsLoading(true);
    try {
      const res = await chatApi.getMessages(conversationId, 20, page);
      if (res.isSuccess && res.data) {
        const fetched = res.data.items.reverse(); // API might return oldest first, or newest first. Need to reverse to match bottom-to-top rendering appropriately depending on API. Usually pagination gives newest page 1, descending. So reverse it to show oldest at top.

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

        return (
          <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'} group max-w-full ${marginTop}`}>
            {!isMine && (
              <div className="w-10 mr-2.5 flex-shrink-0 flex items-end">
                {showAvatar ? (
                  <img
                    src={opponentUser?.urlAvatar || '/default-avatar.png'}
                    alt={opponentUser?.name || ''}
                    className="w-10 h-10 rounded-full object-cover bg-gray-200"
                  />
                ) : (
                  <div className="w-10 h-10" />
                )}
              </div>
            )}

            <div className={`max-w-[72%] flex flex-col ${isMine ? 'items-end' : 'items-start'} relative`}>
              <div
                className={`py-2.5 px-4 text-[15px] leading-relaxed ${isMine
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
              {/* Timestamp: absolute để không chiếm không gian layout, hiện khi hover */}
              <span className={`absolute -top-5 text-xs text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isMine ? 'right-0' : 'left-0'}`}>
                {formatMessageTime(msg.sendTime)}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
