import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';

const STOP_TYPING_DELAY_MS = 1500;
const TYPING_EMIT_THROTTLE_MS = 1200;
const STALE_TYPING_MAX_AGE_MS = 5000;
const EMPTY_TYPING_USERS: Array<{ userId: string; userName?: string; updatedAt: number }> = [];

interface UseTypingIndicatorParams {
  conversationId: string | null;
  toUserId: string | null;
  currentUserId?: string;
  isConnected: boolean;
  sendTyping: (conversationId: string, toUserId: string) => Promise<void>;
  stopTypingSignal: (conversationId: string, toUserId: string) => Promise<void>;
}

export const useTypingIndicator = ({
  conversationId,
  toUserId,
  currentUserId,
  isConnected,
  sendTyping,
  stopTypingSignal
}: UseTypingIndicatorParams) => {
  const typingByConversationId = useChatStore((state) => state.typingByConversationId);
  const typingUsers = conversationId
    ? (typingByConversationId[conversationId] || EMPTY_TYPING_USERS)
    : EMPTY_TYPING_USERS;
  const clearStaleTyping = useChatStore((state) => state.clearStaleTyping);

  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef(0);
  const isTypingSentRef = useRef(false);
  const activeTargetRef = useRef<{ conversationId: string | null; toUserId: string | null }>({
    conversationId,
    toUserId
  });

  const clearStopTimer = useCallback(() => {
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
  }, []);

  const stopTypingInternal = useCallback(async (targetConversationId?: string | null, targetUserId?: string | null) => {
    clearStopTimer();

    if (!isTypingSentRef.current) {
      return;
    }

    isTypingSentRef.current = false;
    const finalConversationId = targetConversationId ?? conversationId;
    const finalToUserId = targetUserId ?? toUserId;

    if (!isConnected || !finalConversationId || !finalToUserId) {
      return;
    }

    await stopTypingSignal(finalConversationId, finalToUserId);
  }, [clearStopTimer, conversationId, toUserId, isConnected, stopTypingSignal]);

  const notifyTyping = useCallback(async () => {
    if (!isConnected || !conversationId || !toUserId) {
      return;
    }

    const now = Date.now();
    if (!isTypingSentRef.current || now - lastTypingEmitRef.current >= TYPING_EMIT_THROTTLE_MS) {
      await sendTyping(conversationId, toUserId);
      isTypingSentRef.current = true;
      lastTypingEmitRef.current = now;
    }

    clearStopTimer();
    stopTypingTimerRef.current = setTimeout(() => {
      void stopTypingInternal(conversationId, toUserId);
    }, STOP_TYPING_DELAY_MS);
  }, [clearStopTimer, conversationId, toUserId, isConnected, sendTyping, stopTypingInternal]);

  const onTypingInputChange = useCallback((nextValue: string) => {
    if (!nextValue.trim()) {
      void stopTypingInternal();
      return;
    }

    void notifyTyping();
  }, [notifyTyping, stopTypingInternal]);

  const stopTyping = useCallback(() => {
    void stopTypingInternal();
  }, [stopTypingInternal]);

  useEffect(() => {
    const prevTarget = activeTargetRef.current;
    const hasChanged = prevTarget.conversationId !== conversationId || prevTarget.toUserId?.toLowerCase() !== toUserId?.toLowerCase();

    if (hasChanged && isTypingSentRef.current && prevTarget.conversationId && prevTarget.toUserId) {
      void stopTypingInternal(prevTarget.conversationId, prevTarget.toUserId);
    }

    activeTargetRef.current = { conversationId, toUserId };
  }, [conversationId, toUserId, stopTypingInternal]);

  useEffect(() => {
    if (!conversationId) return;

    const intervalId = setInterval(() => {
      clearStaleTyping(conversationId, STALE_TYPING_MAX_AGE_MS);
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [conversationId, clearStaleTyping]);

  useEffect(() => {
    return () => {
      clearStopTimer();
      const activeTarget = activeTargetRef.current;
      if (!isTypingSentRef.current || !isConnected || !activeTarget.conversationId || !activeTarget.toUserId) {
        return;
      }

      void stopTypingSignal(activeTarget.conversationId, activeTarget.toUserId);
      isTypingSentRef.current = false;
    };
  }, [clearStopTimer, isConnected, stopTypingSignal]);

  const visibleTypingUsers = useMemo(() => {
    const now = Date.now();
    return typingUsers.filter((entry) => {
      if (entry.userId?.toLowerCase() === currentUserId?.toLowerCase()) return false;
      return now - entry.updatedAt <= STALE_TYPING_MAX_AGE_MS;
    });
  }, [typingUsers, currentUserId]);

  const isSomeoneTyping = visibleTypingUsers.length > 0;

  const typingDisplayText = useMemo(() => {
    if (!isSomeoneTyping) return '';

    const firstName = visibleTypingUsers[0]?.userName || 'Ai đó';
    if (visibleTypingUsers.length === 1) {
      return `${firstName} đang nhập...`;
    }

    if (visibleTypingUsers.length === 2) {
      const secondName = visibleTypingUsers[1]?.userName || 'Ai đó';
      return `${firstName} và ${secondName} đang nhập...`;
    }

    return `${firstName} và ${visibleTypingUsers.length - 1} người khác đang nhập...`;
  }, [isSomeoneTyping, visibleTypingUsers]);

  return {
    onTypingInputChange,
    stopTyping,
    typingDisplayText,
    isSomeoneTyping
  };
};
