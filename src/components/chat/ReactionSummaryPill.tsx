import { memo, useMemo, useState, useCallback } from 'react';
import type { ReactionItem } from '../../types/chat';
import { getReactionEmoji } from '../../lib/utils';
import ReactionDetailsModal from './ReactionDetailsModal.tsx';

interface ReactionSummaryPillProps {
  reactions: ReactionItem[];
  isMine: boolean;
  conversationId: string;
  messageId: string;
  currentUserId: string | undefined;
}

/**
 * Hiển thị pill tóm tắt các reaction trên tin nhắn.
 * Hiện unique emoji icons + tổng số lượt react.
 * Click vào pill mở ReactionDetailsModal.
 */
const ReactionSummaryPill = memo(function ReactionSummaryPill({
  reactions,
  conversationId,
  messageId,
  currentUserId,
}: ReactionSummaryPillProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const uniqueEmojis = useMemo(() => {
    const typeSet = new Set<number>();
    reactions.forEach(r => typeSet.add(r.reactionType));
    return Array.from(typeSet).map(t => getReactionEmoji(t));
  }, [reactions]);

  const totalCount = reactions.length;

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  if (totalCount === 0) return null;

  return (
    <>
      <button
        onClick={openModal}
        className={`absolute -bottom-2 -right-1 z-30 flex flex-row-reverse items-center justify-center rounded-full bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all cursor-pointer select-none ${
          totalCount > 1 ? 'h-[22px] px-1.5 gap-0.5 text-xs' : 'w-[22px] h-[22px] text-sm'
        }`}
        title="Xem chi tiết cảm xúc"
      >
        {totalCount > 1 && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold leading-none">
            {totalCount}
          </span>
        )}
        {uniqueEmojis.map((emoji, i) => (
          <span key={i} className="text-sm leading-none">{emoji}</span>
        ))}
      </button>

      {isModalOpen && (
        <ReactionDetailsModal
          reactions={reactions}
          conversationId={conversationId}
          messageId={messageId}
          currentUserId={currentUserId}
          onClose={closeModal}
        />
      )}
    </>
  );
});

export default ReactionSummaryPill;
