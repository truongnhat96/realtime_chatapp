import { useEffect, useState, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { chatApi } from '../../lib/api';
import type { User } from '../../types/chat';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { Loader2 } from 'lucide-react';

interface Props {
  query: string;
  onClose: () => void;
}

export default function SearchOverlay({ query, onClose }: Props) {
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<Record<string, User[]>>({});
  
  const currentUserId = useAuthStore(state => state.user?.id);
  const { setActiveConversationId, addConversation } = useChatStore();

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const fetchSearch = async () => {
      // Return from cache if exist
      if (cacheRef.current[debouncedQuery]) {
        setResults(cacheRef.current[debouncedQuery]);
        return;
      }

      setIsLoading(true);
      try {
        const res = await chatApi.searchUsers(debouncedQuery);
        if (res.isSuccess) {
          const fetchedData = res.data || [];
          // Filter out current user from search
          const filtered = fetchedData.filter(u => u.id !== currentUserId);
          cacheRef.current[debouncedQuery] = filtered;
          setResults(filtered);
        }
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearch();
  }, [debouncedQuery, currentUserId]);

  const handleSelectUser = async (targetUser: User) => {
    if (!currentUserId) return;
    try {
      setIsLoading(true);
      // Check if conversation exists
      const checkRes = await chatApi.checkConversation(currentUserId, targetUser.id);
      if (checkRes.isSuccess) {
        if (checkRes.data.hasConversation && checkRes.data.conversationId) {
           // Create stub if it exists but it was somehow not loaded in original list
           addConversation({
             conversationId: checkRes.data.conversationId,
             user: targetUser,
             message: '',
             seenMessage: new Date().toISOString(),
             timeMessage: new Date().toISOString()
           });
           setActiveConversationId(checkRes.data.conversationId);
           onClose();
        } else {
           // Tạo mới conversation
           const createRes = await chatApi.createConversation(currentUserId, targetUser.id);
           if (createRes.isSuccess && createRes.data) {
             const newId = createRes.data;
             addConversation({
               conversationId: newId,
               user: targetUser,
               message: '',
               seenMessage: new Date().toISOString(),
               timeMessage: new Date().toISOString()
             });
             setActiveConversationId(newId);
             onClose();
           }
        }
      }
    } catch (error) {
      console.error("Failed to select/create conversation", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 pb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Kết quả tìm kiếm</h3>
      {isLoading && (
        <div className="flex justify-center p-4">
          <Loader2 className="animate-spin text-[#8ED8ED]" size={24} />
        </div>
      )}
      {!isLoading && debouncedQuery && results.length === 0 && (
        <p className="text-gray-500 text-sm text-center mt-4">Không tìm thấy người dùng nào</p>
      )}
      {!isLoading && results.map(user => (
        <div 
          key={user.id} 
          onClick={() => handleSelectUser(user)}
          className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-[#2C2C2C] rounded-xl cursor-pointer transition-colors"
        >
          <div className="relative">
             <img src={user.urlAvatar || '/default-avatar.png'} alt={user.name} className="w-12 h-12 rounded-full object-cover bg-gray-200" />
             {user.isOnline && (
               <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full"></div>
             )}
          </div>
          <div>
            <h4 className="text-gray-900 dark:text-white font-medium">{user.name}</h4>
            <p className="text-gray-500 text-sm truncate w-48">@{user.userName}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
