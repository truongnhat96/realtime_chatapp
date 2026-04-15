import { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';

const PAGE_SIZE = 10;

export default function ConversationList() {
  const { conversations, activeConversationId, setActiveConversationId, onlineUsers, setConversations, appendConversations } = useChatStore();
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
    setActiveConversationId(id);
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

  return (
    <div className="flex-1 overflow-y-auto px-2" ref={containerRef} onScroll={handleScroll}>
      {isLoading && conversations.length === 0 && (
        <div className="flex justify-center p-4 mt-10">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={24} />
        </div>
      )}

      {!isLoading && conversations.length === 0 && (
        <div className="text-center text-gray-500 mt-10 text-sm">
          Chưa có cuộc trò chuyện nào
        </div>
      )}
      
      {conversations.map((conv) => {
        const isOnline = onlineUsers[conv.user.id] ?? conv.user.isOnline;
        const isActive = activeConversationId === conv.conversationId;

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
               <img src={conv.user.urlAvatar || '/default-avatar.png'} alt={conv.user.name} className="w-14 h-14 rounded-full object-cover bg-gray-200" />
               {isOnline && (
                 <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full transition-colors"></div>
               )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <h4 className="text-[15px] text-gray-900 dark:text-white font-semibold truncate pr-2">{conv.user.name}</h4>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(conv.timeMessage)}</span>
              </div>
              <p className={`text-sm truncate ${isActive ? 'text-gray-900 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {conv.message}
              </p>
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
