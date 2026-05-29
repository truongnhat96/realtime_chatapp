import { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { X, Search, Loader2, Users } from 'lucide-react';
import { chatApi } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import type { User } from '../../types/chat';

interface Props {
  onClose: () => void;
  onGroupCreated: (conversationId: string) => void;
  /** Nếu truyền vào, modal sẽ chuyển sang chế độ "Thêm thành viên" */
  addToConversationId?: string;
  existingMemberIds?: string[];
}

export default function CreateGroupModal({ onClose, onGroupCreated, addToConversationId, existingMemberIds = [] }: Props) {
  const currentUserId = useAuthStore(state => state.user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAddMode = !!addToConversationId;

  const debouncedQuery = useDebounce(searchQuery, 250);
  const cacheRef = useRef<Record<string, User[]>>({});

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setUsers([]);
      setIsLoading(false);
      return;
    }

    const fetchSearch = async () => {
      // Return from cache if exist
      if (cacheRef.current[debouncedQuery]) {
        setUsers(cacheRef.current[debouncedQuery]);
        return;
      }

      setIsLoading(true);
      try {
        const res = await chatApi.searchUsers(debouncedQuery, 20);
        if (res.isSuccess && res.data) {
          const filtered = res.data.filter(u =>
            u.id !== currentUserId && !existingMemberIds.includes(u.id)
          );
          cacheRef.current[debouncedQuery] = filtered;
          setUsers(filtered);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearch();
  }, [debouncedQuery, currentUserId, existingMemberIds]);

  const toggleUser = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);

    try {
      if (isAddMode && addToConversationId) {
        const res = await chatApi.addParticipant(addToConversationId, Array.from(selectedIds));
        if (res.isSuccess) {
          onGroupCreated(addToConversationId);
          onClose();
        }
      } else {
        if (!groupName.trim()) return;
        const allMemberIds = currentUserId
          ? [currentUserId, ...Array.from(selectedIds)]
          : Array.from(selectedIds);
        const res = await chatApi.createGroup(groupName.trim(), null, allMemberIds);
        if (res.isSuccess && res.data) {
          useChatStore.getState().addConversation({
            conversationId: res.data.conversationId,
            type: 1,
            user: null,
            participants: res.data.participants || [],
            groupInfo: res.data.groupInfo,
            message: 'Bạn đã tạo nhóm.',
            messageType: 4,
            seenMessage: '',
            timeMessage: new Date().toISOString(),
            boxChatInfo: { unreadCount: 0 },
          });
          onGroupCreated(res.data.conversationId);
          onClose();
        }
      }
    } catch (err) {
      console.error('Error creating group / adding members:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={20} />
            {isAddMode ? 'Thêm thành viên' : 'Tạo nhóm mới'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Group Name (chỉ khi tạo mới) */}
        {!isAddMode && (
          <div className="px-4 pt-4">
            <input
              type="text"
              placeholder="Tên nhóm..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full bg-gray-100 dark:bg-[#2C2C2C] text-gray-900 dark:text-gray-100 placeholder-gray-500 py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8ED8ED] transition-all text-sm"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm người dùng..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-[#2C2C2C] text-gray-900 dark:text-gray-100 placeholder-gray-500 py-2.5 pl-10 pr-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8ED8ED] transition-all text-sm"
            />
          </div>
        </div>

        {/* Selected count */}
        {selectedIds.size > 0 && (
          <div className="px-4 pb-2">
            <span className="text-xs text-[#8ED8ED] font-semibold">
              Đã chọn {selectedIds.size} người
            </span>
          </div>
        )}

        {/* User List */}
        <div className="flex-1 overflow-y-auto px-2 min-h-0">
          {isLoading && (
            <div className="flex justify-center p-6">
              <Loader2 className="animate-spin text-[#8ED8ED]" size={24} />
            </div>
          )}

          {!isLoading && searchQuery.trim() && users.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-6">Không tìm thấy người dùng</p>
          )}

          {!isLoading && !searchQuery.trim() && (
            <p className="text-center text-gray-400 text-sm py-6">Nhập tên để tìm kiếm</p>
          )}

          {users.map(user => {
            const isSelected = selectedIds.has(user.id);
            return (
              <div
                key={user.id}
                onClick={() => toggleUser(user.id)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all mb-1 ${
                  isSelected
                    ? 'bg-[#8ED8ED]/15 dark:bg-[#8ED8ED]/10'
                    : 'hover:bg-gray-100 dark:hover:bg-[#2C2C2C]'
                }`}
              >
                <img
                  src={user.urlAvatar || '/default-avatar.png'}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover bg-gray-200 flex-shrink-0"
                />
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.name}
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                  isSelected
                    ? 'bg-[#8ED8ED] border-[#8ED8ED]'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || selectedIds.size === 0 || (!isAddMode && !groupName.trim())}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#8ED8ED] text-white hover:bg-[#7bc8dd]"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin mx-auto" size={20} />
            ) : isAddMode ? (
              `Thêm (${selectedIds.size})`
            ) : (
              `Tạo nhóm (${selectedIds.size})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
