import { useCallback, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { chatApi } from '../lib/api';
import type { ReactionItem } from '../types/chat';

/**
 * Custom hook chứa logic xử lý reaction trên tin nhắn.
 * Quản lý việc tạo/cập nhật/xóa reaction và xác định trạng thái IsTargetUserReceiveNotification.
 */
export function useReaction(conversationId: string) {
  const currentUserId = useAuthStore(state => state.user?.id);
  const pendingRef = useRef<Set<string>>(new Set());

  const handleReaction = useCallback(async (
    messageId: string,
    targetUserId: string,
    reactionType: number,
    existingReactions: ReactionItem[],
  ) => {
    if (!currentUserId) return;

    const lockKey = `${messageId}-${currentUserId}`;
    if (pendingRef.current.has(lockKey)) return;
    pendingRef.current.add(lockKey);

    const store = useChatStore.getState();
    const myReaction = existingReactions.find(
      r => r.reactorUserId.toLowerCase() === currentUserId.toLowerCase()
    );

    // Chỉ đánh dấu đã đọc ngay lập tức nếu tự bày tỏ cảm xúc vào tin nhắn của chính mình
    const isTargetUserReceiveNotification =
      targetUserId.toLowerCase() === currentUserId.toLowerCase();

    try {
      if (myReaction) {
        if (myReaction.reactionType === reactionType) {
          // Bấm lại cùng emoji → xóa reaction
          store.removeReactionFromMessage(conversationId, messageId, myReaction.reactionId);
          await chatApi.deleteReaction({
            reactionId: myReaction.reactionId,
            conversationId,
            targetUserId,
          });
        } else {
          // Bấm emoji khác → cập nhật
          const updated: ReactionItem = { ...myReaction, reactionType };
          store.updateReactionInMessage(conversationId, messageId, updated);
          await chatApi.updateReaction({
            reactionId: myReaction.reactionId,
            conversationId,
            messageId,
            reactorUserId: currentUserId,
            targetUserId,
            reactionType,
            isTargetUserReceiveNotification,
          });
        }
      } else {
        // Tạo reaction mới
        const res = await chatApi.createReaction({
          conversationId,
          messageId,
          reactorUserId: currentUserId,
          targetUserId,
          reactionType,
          isTargetUserReceiveNotification,
        });
        if (res.isSuccess && res.data) {
          // SignalR sẽ broadcast lại, nhưng nếu chưa nhận thì thêm trước
          const msgs = useChatStore.getState().messages[conversationId] || [];
          const targetMsg = msgs.find(m => m.id === messageId);
          const alreadyExists = targetMsg?.reactions?.some(
            r => r.reactionId === res.data.reactionId
          );
          if (!alreadyExists) {
            store.addReactionToMessage(conversationId, messageId, res.data);
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle reaction:', error);
    } finally {
      pendingRef.current.delete(lockKey);
    }
  }, [conversationId, currentUserId]);

  return { handleReaction, currentUserId };
}
