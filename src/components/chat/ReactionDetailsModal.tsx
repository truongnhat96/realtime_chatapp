import { memo, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ReactionItem } from '../../types/chat';
import { getReactionEmoji } from '../../lib/utils';
import { resolveUserName, resolveUserAvatar } from '../../stores/chatStore';
import { chatApi } from '../../lib/api';
import { useChatStore } from '../../stores/chatStore';

interface ReactionDetailsModalProps {
  reactions: ReactionItem[];
  conversationId: string;
  messageId: string;
  currentUserId: string | undefined;
  onClose: () => void;
}

interface TabItem {
  label: string;
  emoji: string | null;
  reactionType: number | null; // null = "Tất cả"
  count: number;
}

/**
 * Modal hiển thị chi tiết tất cả reaction trên một tin nhắn.
 * Gồm các tab: "Tất cả", và từng loại emoji.
 * Mỗi tab hiển thị danh sách user đã react loại đó.
 * User có thể xóa reaction của chính mình.
 */
const ReactionDetailsModal = memo(function ReactionDetailsModal({
  reactions,
  conversationId,
  messageId,
  currentUserId,
  onClose,
}: ReactionDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<number | null>(null); // null = "Tất cả"
  const overlayRef = useRef<HTMLDivElement>(null);

  const tabs: TabItem[] = useMemo(() => {
    const typeCounts = new Map<number, number>();
    reactions.forEach(r => {
      typeCounts.set(r.reactionType, (typeCounts.get(r.reactionType) || 0) + 1);
    });

    const allTab: TabItem = { label: 'Tất cả', emoji: null, reactionType: null, count: reactions.length };
    const emojiTabs: TabItem[] = Array.from(typeCounts.entries()).map(([type, count]) => ({
      label: getReactionEmoji(type),
      emoji: getReactionEmoji(type),
      reactionType: type,
      count,
    }));

    return [allTab, ...emojiTabs];
  }, [reactions]);

  const filteredReactions = useMemo(() => {
    if (activeTab === null) return reactions;
    return reactions.filter(r => r.reactionType === activeTab);
  }, [reactions, activeTab]);

  const handleRemoveOwnReaction = useCallback(async (reaction: ReactionItem) => {
    try {
      useChatStore.getState().removeReactionFromMessage(conversationId, messageId, reaction.reactionId);
      await chatApi.deleteReaction({
        reactionId: reaction.reactionId,
        conversationId,
        targetUserId: reaction.targetUserId,
      });
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    }
  }, [conversationId, messageId]);

  // Close on overlay click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl w-[360px] max-h-[420px] flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 relative">
          <div className="flex-1 text-center">
            <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">Cảm xúc về tin nhắn</h3>
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.reactionType ?? 'all'}
              onClick={() => setActiveTab(tab.reactionType)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.reactionType
                  ? 'bg-[#8ED8ED]/20 text-[#5bbdd0] dark:text-[#8ED8ED]'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.emoji ? (
                <span className="text-base">{tab.emoji}</span>
              ) : (
                <span>{tab.label}</span>
              )}
              <span className="text-[11px]">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredReactions.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Chưa có cảm xúc nào</p>
          ) : (
            filteredReactions.map((reaction) => {
              const isOwn = currentUserId && reaction.reactorUserId.toLowerCase() === currentUserId.toLowerCase();
              const name = resolveUserName(reaction.reactorUserId, conversationId, true);
              const avatar = resolveUserAvatar(reaction.reactorUserId, conversationId);
              return (
                <div
                  key={reaction.reactionId}
                  onClick={() => {
                    if (isOwn) {
                      void handleRemoveOwnReaction(reaction);
                    }
                  }}
                  className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={avatar}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover bg-gray-200"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate font-semibold">
                        {isOwn ? 'Bạn' : name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {isOwn ? 'Nhấp để gỡ' : 'Nhấp để xem trang cá nhân'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xl select-none pr-1">
                    {getReactionEmoji(reaction.reactionType)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

export default ReactionDetailsModal;
