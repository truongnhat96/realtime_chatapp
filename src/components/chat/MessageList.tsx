import { useEffect, useRef, useState, useMemo, useCallback, Fragment } from 'react';
import { useChatStore, resolveUserName, fetchAndCacheUserProfile } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { chatApi } from '../../lib/api';
import { Loader2, Check, AlertCircle, Reply, MoreVertical, Smile, Phone, Video, PhoneOff, VideoOff, X } from 'lucide-react';
import GroupAvatar from './GroupAvatar';
import MediaMessageBubble from './MediaMessageBubble';
import MediaViewer from './MediaViewer';
import LinkPreviewCard from './LinkPreviewCard';
import { convertUtcToLocal, tokenizeText, formatSystemMessage } from '../../lib/utils';
import ReactionPicker from './ReactionPicker';
import ReactionSummaryPill from './ReactionSummaryPill';
import { useReaction } from '../../hooks/useReaction';


const EMPTY_TYPING_USERS: Array<{ userId: string; userName?: string; updatedAt: number }> = [];
const STALE_TYPING_MAX_AGE_MS = 5000;

const shouldShowSeparator = (msg: import('../../types/chat').MessageItem, prevMsg?: import('../../types/chat').MessageItem) => {
  if (!prevMsg) return true;
  if (!msg.sendTime || !prevMsg.sendTime) return false;

  const currTime = new Date(msg.sendTime).getTime();
  const prevTime = new Date(prevMsg.sendTime).getTime();
  if (isNaN(currTime) || isNaN(prevTime)) return false;

  const getLocalDateString = (isoString: string) => {
    const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[0] : '';
  };
  const currDateStr = getLocalDateString(msg.sendTime);
  const prevDateStr = getLocalDateString(prevMsg.sendTime);
  if (currDateStr !== prevDateStr) return true;

  const THIRTY_MINUTES_MS = 30 * 60 * 1000;
  if (Math.abs(currTime - prevTime) >= THIRTY_MINUTES_MS) return true;

  return false;
};

const formatSeparatorTime = (isoString: string) => {
  if (!isoString) return '';
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return '';
  const [_, year, month, day, hour, minute] = match;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  const vnToday = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;

  const msgDate = `${year}-${month}-${day}`;
  if (vnToday === msgDate) {
    return `${hour}:${minute}`;
  }
  return `${hour}:${minute} ${day}/${month}/${year}`;
};

const formatHoverDateTime = (isoString: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${hours}:${minutes} ${day} Tháng ${month}, ${year}`;
};

const formatCallDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (num: number) => String(num).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};

interface Props {
  conversationId: string;
  markAsRead: (conversationId: string, messageId: string) => Promise<void>;
  isConnected: boolean;
}

export default function MessageList({ conversationId, markAsRead, isConnected }: Props) {
  const { messages, setMessages, prependMessages, conversations, setReplyingMessage, revokeMessage, deleteMessageLocally } = useChatStore();
  //const userCache = useChatStore(state => state.userCache);
  const typingByConversationId = useChatStore((state) => state.typingByConversationId);
  const currentUserId = useAuthStore(state => state.user?.id);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.conversationId === conversationId),
    [conversations, conversationId]
  );

  const isGroup = activeConversation?.type === 1;
  const opponentUser = !isGroup ? activeConversation?.user : null;

  // Highlight tags inside content
  const formatMessageContent = useCallback((content: string, isMine: boolean = false, messageMentions?: import('../../types/chat').MentionItem[]) => {
    if (!content) return '';
    if (!isGroup || !messageMentions || messageMentions.length === 0) return content;

    const mentionedNames: string[] = [];
    messageMentions.forEach(m => {
      if (m.type === 1) {
        mentionedNames.push('mọi người');
      } else if (m.type === 0 && m.userId) {
        const name = (() => {
          const lowerId = m.userId.toLowerCase();

          // 1. Kiểm tra nếu là chính mình để lấy tên thật
          const currentUser = useAuthStore.getState().user;
          const currentUserId = currentUser?.id || (currentUser as any)?.Id;
          if (lowerId === currentUserId?.toLowerCase()) {
            return currentUser?.name || '';
          }

          // 2. Tìm trong participants của cuộc trò chuyện hiện tại
          const member = activeConversation?.participants?.find(part => part.id?.toLowerCase() === lowerId);
          if (member?.name) return member.name;

          // 3. Tìm trong userCache toàn cục
          const cachedName = useChatStore.getState().userCache?.[lowerId];
          if (cachedName) return cachedName;

          // 4. Nếu chưa có thì fetch ngầm để cache cho lần sau
          void fetchAndCacheUserProfile(m.userId);

          return '';
        })();

        if (name) {
          mentionedNames.push(name);
        }
      }
    });

    const uniqueNames = Array.from(new Set(mentionedNames)).filter(Boolean);
    if (uniqueNames.length === 0) return content;

    uniqueNames.sort((a, b) => b.length - a.length);

    const escapedNames = uniqueNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`@(${escapedNames})`, 'gi');

    const parts = content.split(regex);
    return parts.map((part, index) => {
      const isMatch = uniqueNames.some(name => name.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <span
            key={index}
            className={`font-bold select-all ${isMine
              ? 'text-blue-900 font-extrabold'
              : 'text-blue-600 dark:text-blue-400'
              }`}
          >
            @{part}
          </span>
        );
      }
      return part;
    });
  }, [isGroup, activeConversation]);

  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentMessages = messages[conversationId] || [];
  const unreadCount = activeConversation?.boxChatInfo?.unreadCount ?? (activeConversation?.isUnread ? 1 : 0);

  // Media Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);

  // End call modal state
  const [showEndCallModal, setShowEndCallModal] = useState(false);
  const [modalCallType, setModalCallType] = useState<'voice' | 'video'>('voice');
  const [modalConversationId, setModalConversationId] = useState('');

  // More menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { handleReaction } = useReaction(conversationId);

  /** Tính index trong danh sách media slides tổng thể để mở đúng ảnh */
  const openMediaViewer = useCallback((messageId: string, attachmentIndex: number) => {
    let globalIndex = 0;
    for (const msg of currentMessages) {
      if (msg.id === messageId) {
        globalIndex += attachmentIndex;
        break;
      }
      if (msg.messageType === 1) {
        const attCount = msg.attachments?.length || (msg.url ? 1 : 0);
        globalIndex += attCount;
      } else if (msg.messageType === 2) {
        globalIndex += 1;
      }
    }
    setViewerStartIndex(globalIndex);
    setViewerOpen(true);
  }, [currentMessages]);

  // Ref lưu messageId cuối cùng đã gửi markAsRead lên server
  const lastMarkedReadIdRef = useRef<string | null>(null);

  // Reset khi chuyển conversation
  useEffect(() => {
    lastMarkedReadIdRef.current = null;
  }, [conversationId]);

  // Lấy ID tin nhắn incoming cuối cùng (bao gồm cả system messages để đánh dấu đã đọc)
  const lastIncomingMessageId = useMemo(() => {
    if (!currentUserId || currentMessages.length === 0) return null;
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      // System messages được tính là incoming (từ hệ thống, không phải của mình)
      if (msg.messageType === 4) {
        return msg.id;
      }
      if (msg.fromUserId?.toLowerCase() !== currentUserId.toLowerCase()) {
        return msg.id;
      }
      // Nếu tin cuối là của mình → không cần mark read
      break;
    }
    return null;
  }, [currentMessages, currentUserId]);

  // Logic đánh dấu "Đã xem" tập trung:
  // - Khi mở chat có unread → invoke 1 lần duy nhất
  // - Khi đang mở chat và nhận tin nhắn mới từ người khác → invoke cho tin mới
  useEffect(() => {
    if (!currentUserId || !conversationId || !lastIncomingMessageId || !isConnected) return;

    // Đã mark rồi cho message này → skip
    if (lastMarkedReadIdRef.current === lastIncomingMessageId) return;

    // Kiểm tra: có phải mở chat với unread hoặc có tin nhắn mới incoming
    const isFirstOpen = lastMarkedReadIdRef.current === null && unreadCount > 0;
    const isNewIncoming = lastMarkedReadIdRef.current !== null && lastMarkedReadIdRef.current !== lastIncomingMessageId;

    if (!isFirstOpen && !isNewIncoming) {
      // Lần mount đầu mà không có unread → chỉ ghi nhận, không invoke
      lastMarkedReadIdRef.current = lastIncomingMessageId;
      return;
    }

    // Ghi nhận trước khi invoke để ngăn re-trigger
    lastMarkedReadIdRef.current = lastIncomingMessageId;

    void (async () => {
      await markAsRead(conversationId, lastIncomingMessageId);
      useChatStore.getState().markMessageAsSeen(conversationId, lastIncomingMessageId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, lastIncomingMessageId, currentUserId, markAsRead, isConnected]);



  // Tìm ID của tin nhắn cuối cùng đối phương đã đọc
  const lastReadMessageId = useMemo(() => {
    const conv = conversations.find(c => c.conversationId === conversationId);
    return conv?.boxChatInfo?.opponentLastReadMessageId || conv?.lastReadMessageId;
  }, [conversations, conversationId]);
  const typingUsers = typingByConversationId[conversationId] || EMPTY_TYPING_USERS;
  const visibleTypingUsers = useMemo(() => {
    return typingUsers.filter(entry => {
      if (entry.userId.toLowerCase() === currentUserId?.toLowerCase()) return false;
      return Date.now() - entry.updatedAt <= STALE_TYPING_MAX_AGE_MS;
    });
  }, [typingUsers, currentUserId]);
  const isOpponentTyping = visibleTypingUsers.length > 0;


  // Fetch initial messages when conversation changes or user is reactivated/re-added to the group
  useEffect(() => {
    setPageNumber(1);
    setHasMore(true);
    fetchMessages(1, true);
  }, [conversationId, activeConversation?.isRemovedFromGroup]);


  // Scroll to bottom dynamically
  useEffect(() => {
    if (currentMessages.length > 0) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      const isMyMessage = lastMsg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase();

      // Chỉ auto scroll xuống cuối ở phía người gửi khi gửi tin nhắn, hoặc khi ấn vào cuộc trò chuyện
      if (isMyMessage || pageNumber === 1) {
        scrollToBottom();
        // Set timeout lặp lại để đối phó với việc media load sau gây đẩy scroll lên trên
        setTimeout(scrollToBottom, 150);
        setTimeout(scrollToBottom, 400);
      }
    }
  }, [currentMessages.length, conversationId, currentUserId, pageNumber]);


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
        const fetched = res.data.items.reverse().map(msg => ({
          ...msg,
          sendTime: convertUtcToLocal(msg.sendTime),
        }));

        // Fallback phục hồi read cursor khi vào lại chat: lấy tin gần nhất của mình đã được đối phương xem.
        if (isInitial && currentUserId) {
          const inferredOpponentReadId = [...fetched]
            .reverse()
            .find((m) => m.fromUserId?.toLowerCase() === currentUserId?.toLowerCase() && m.isSeen)?.id;

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

  // Lấy avatar theo sender cho group chat
  const getSenderAvatar = (fromUserId: string): string => {
    if (!isGroup) return opponentUser?.urlAvatar || '/default-avatar.png';
    const member = activeConversation?.participants.find(p => p.id?.toLowerCase() === fromUserId?.toLowerCase());
    return member?.urlAvatar || '/default-avatar.png';
  };

  const getSenderName = (fromUserId: string): string => {
    if (!isGroup) return opponentUser?.name || '';
    const member = activeConversation?.participants.find(p => p.id?.toLowerCase() === fromUserId?.toLowerCase());
    return member?.name || 'Thành viên';
  };

  // === Reply handler ===
  const handleReply = useCallback((msg: import('../../types/chat').MessageItem) => {
    const senderName = msg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase()
      ? 'Bạn'
      : (msg.senderName || getSenderName(msg.fromUserId));
    setReplyingMessage({
      messageId: msg.id,
      senderName,
      content: msg.content,
      messageType: msg.messageType,
    });
  }, [currentUserId, setReplyingMessage]);

  // === Revoke message handler ===
  const handleRevoke = useCallback(async (messageId: string) => {
    setActiveMenuId(null);
    try {
      const res = await chatApi.deleteMessage(messageId, true);
      if (res.isSuccess) {
        revokeMessage(conversationId, messageId);
      }
    } catch (error) {
      console.error('Failed to revoke message:', error);
    }
  }, [conversationId, revokeMessage]);

  // === Delete locally handler ===
  const handleDeleteLocally = useCallback(async (messageId: string) => {
    setActiveMenuId(null);
    try {
      const res = await chatApi.deleteMessage(messageId, false);
      if (res.isSuccess) {
        deleteMessageLocally(conversationId, messageId);
      }
    } catch (error) {
      console.error('Failed to delete message locally:', error);
    }
  }, [conversationId, deleteMessageLocally]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuId]);

  // Header section: hiện avatar + tên cuộc hội thoại
  const renderHeaderSection = () => {
    if (isGroup && activeConversation?.groupInfo) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <GroupAvatar
            groupImage={activeConversation.groupInfo.groupImage}
            participants={activeConversation.participants}
            size={96}
            className="mb-4"
            totalMembers={activeConversation.groupInfo.memberCount}
          />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {activeConversation.groupInfo.name}
          </h3>
          {currentMessages.length === 0 && (
            <p className="text-gray-400 dark:text-gray-500 text-xs text-center uppercase tracking-wider font-semibold">
              Hãy bắt đầu trò chuyện!
            </p>
          )}
        </div>
      );
    }

    if (opponentUser) {
      return (
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
      );
    }

    return null;
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

      {!isLoading && renderHeaderSection()}

      {currentMessages.map((msg, idx) => {
        const prevMsg = currentMessages[idx - 1];
        const showSeparator = shouldShowSeparator(msg, prevMsg);
        const isMine = msg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase();
        const isSameSenderAsPrev = prevMsg?.fromUserId?.toLowerCase() === msg.fromUserId?.toLowerCase() && prevMsg?.messageType !== 4;
        const marginTop = idx === 0 ? 'mt-0' : (isSameSenderAsPrev && !showSeparator) ? 'mt-0.5' : 'mt-4';

        // System message: render căn giữa
        if (msg.messageType === 4) {
          if (msg.callId && msg.call && (!msg.systemMessages || msg.systemMessages.length === 0)) {
            const call = msg.call;
            const isCallMine = call.startedByUserId?.toLowerCase() === currentUserId?.toLowerCase();
            const isVideo = call.type === 1;
            const callTypeStr = isVideo ? 'video' : 'thoại';
            const IconComponent = isVideo ? Video : Phone;
            const IconOffComponent = isVideo ? VideoOff : PhoneOff;

            const opponentId = isCallMine
              ? (activeConversation?.user?.id || activeConversation?.participants?.find(p => p.id !== currentUserId)?.id)
              : call.startedByUserId;

            let statusTitle = '';
            let statusSubtitle = '';
            let showButton = false;
            let iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
            let iconToUse = <IconComponent size={18} />;

            // 0 = Ended, 1 = Missed, 2 = Rejected, 3 = Ongoing, 4 = Cancelled
            if (isGroup) {
              statusTitle = `Cuộc gọi ${callTypeStr} nhóm`;
              if (call.status === 3) {
                statusSubtitle = 'Nhấn để tham gia';
                iconBgClass = 'bg-green-500 text-white animate-pulse';
                iconToUse = <IconComponent size={18} />;
              } else {
                statusSubtitle = 'Cuộc gọi đã kết thúc';
                iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                iconToUse = <IconOffComponent size={18} />;
              }
            } else {
              switch (call.status) {
                case 0: // Ended
                  statusTitle = `Cuộc gọi ${callTypeStr}`;
                  statusSubtitle = `Đã kết thúc • ${formatCallDuration(call.durationInSeconds)}`;
                  showButton = true;
                  iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                  iconToUse = <IconComponent size={18} />;
                  break;
                case 1: // Missed
                  statusTitle = 'Đã nhỡ cuộc gọi';
                  statusSubtitle = callTypeStr;
                  showButton = true;
                  if (isCallMine) {
                    iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                    iconToUse = <IconOffComponent size={18} />;
                  } else {
                    iconBgClass = 'bg-red-500 text-white';
                    iconToUse = <IconOffComponent size={18} />;
                  }
                  break;
                case 2: // Rejected
                  statusTitle = `Cuộc gọi ${callTypeStr}`;
                  statusSubtitle = isCallMine ? 'Đối phương từ chối' : 'Bạn từ chối';
                  showButton = true;
                  iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                  iconToUse = <IconOffComponent size={18} />;
                  break;
                case 3: // Ongoing (1-1)
                  statusTitle = `Cuộc gọi ${callTypeStr} đang diễn ra`;
                  statusSubtitle = 'Nhấn để tham gia';
                  iconBgClass = 'bg-green-500 text-white animate-pulse';
                  iconToUse = <IconComponent size={18} />;
                  break;
                case 4: // Cancelled
                  statusTitle = `Cuộc gọi ${callTypeStr}`;
                  statusSubtitle = isCallMine ? 'Bạn đã hủy' : 'Đối phương đã hủy';
                  showButton = true;
                  iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                  iconToUse = <IconOffComponent size={18} />;
                  break;
                default:
                  statusTitle = `Cuộc gọi ${callTypeStr}`;
                  statusSubtitle = '';
                  showButton = true;
                  iconBgClass = 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300';
                  iconToUse = <IconComponent size={18} />;
                  break;
              }
            }

            const nextMsg = currentMessages[idx + 1];
            const isSameSenderAsNext = nextMsg?.fromUserId?.toLowerCase() === msg.fromUserId?.toLowerCase() && nextMsg?.messageType !== 4;
            const showAvatar = !isMine && !isSameSenderAsNext;

            return (
              <Fragment key={msg.id || idx}>
                {showSeparator && (
                  <div className="flex justify-center w-full my-4 animate-fade-in">
                    <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#2C2C2C] px-3 py-1 rounded-full select-none">
                      {formatSeparatorTime(msg.sendTime)}
                    </span>
                  </div>
                )}

                <div
                  id={`msg-${msg.id}`}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${marginTop} w-full transition-all duration-300 rounded-lg p-0.5 animate-fade-in`}
                >
                  {isGroup && !isMine && !isSameSenderAsNext && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-12 mb-0.5 font-medium">
                      {msg.senderName || getSenderName(msg.fromUserId)}
                    </span>
                  )}

                  <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'} max-w-[85%]`}>
                    {!isMine && (
                      <div className="w-9 flex-shrink-0">
                        {showAvatar ? (
                          <img
                            src={msg.senderAvatar || getSenderAvatar(msg.fromUserId)}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover bg-gray-200"
                          />
                        ) : (
                          <div className="w-9" />
                        )}
                      </div>
                    )}

                    <div className="relative flex flex-col items-end group/msg">
                      <div
                        onClick={() => {
                          const isCallOngoing = call.status === 3;
                          if (isCallOngoing) {
                            const callType = call.type === 1 ? 'video' : 'voice';
                            void useCallStore.getState().joinGroupCall(call.id, conversationId, callType, call.startedByUserId);
                          } else {
                            if (isGroup) {
                              setModalCallType(call.type === 1 ? 'video' : 'voice');
                              setModalConversationId(conversationId);
                              setShowEndCallModal(true);
                            } else if (opponentId) {
                              const opponentName = resolveUserName(opponentId, conversationId, true);
                              const opponentAvatar = getSenderAvatar(opponentId) || msg.senderAvatar || '';
                              const callType = call.type === 1 ? 'video' : 'voice';
                              void useCallStore.getState().startCall(conversationId, callType, opponentId, opponentName, opponentAvatar);
                            }
                          }
                        }}
                        className={`w-[230px] p-3 rounded-2xl shadow-xs border flex flex-col gap-2.5 transition-all select-none cursor-pointer
                          bg-gray-100 dark:bg-[#2C2C2C] border-gray-200/60 dark:border-zinc-800 text-gray-900 dark:text-gray-100 hover:shadow-md hover:bg-gray-200/50 dark:hover:bg-zinc-700/50 active:scale-[0.98]
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBgClass}`}>
                            {iconToUse}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-[13px] leading-tight text-gray-900 dark:text-white truncate">
                              {statusTitle}
                            </span>
                            <span className="text-xs leading-tight text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {statusSubtitle}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 select-none">
                              {formatMessageTime(msg.sendTime)}
                            </span>
                          </div>
                        </div>

                        {(showButton || call.status === 3) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (call.status === 3) {
                                const callType = call.type === 1 ? 'video' : 'voice';
                                void useCallStore.getState().joinGroupCall(call.id, conversationId, callType, call.startedByUserId);
                              } else if (opponentId) {
                                const opponentName = resolveUserName(opponentId, conversationId, true);
                                const opponentAvatar = getSenderAvatar(opponentId) || msg.senderAvatar || '';
                                const callType = call.type === 1 ? 'video' : 'voice';
                                void useCallStore.getState().startCall(conversationId, callType, opponentId, opponentName, opponentAvatar);
                              }
                            }}
                            className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors text-center cursor-pointer ${call.status === 3
                              ? 'bg-green-500 hover:bg-green-600 text-white animate-pulse'
                              : 'bg-gray-200/80 hover:bg-gray-300/80 dark:bg-zinc-700/60 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200'
                              }`}
                          >
                            {call.status === 3 ? 'Tham gia' : 'Gọi lại'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          }

          const sysMsgs = msg.systemMessages || [];
          return (
            <Fragment key={msg.id || idx}>
              {showSeparator && (
                <div className="flex justify-center w-full my-4 animate-fade-in">
                  <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#2C2C2C] px-3 py-1 rounded-full select-none">
                    {formatSeparatorTime(msg.sendTime)}
                  </span>
                </div>
              )}
              <div className="flex flex-col items-center gap-1.5 my-2 w-full animate-fade-in">
                {sysMsgs.map((sm, smIdx) => {
                  const formatted = formatSystemMessage(
                    sm.type,
                    sm.actionUserId,
                    sm.targetUserId,
                    currentUserId,
                    (id, isCapital) => resolveUserName(id, conversationId, isCapital),
                    activeConversation?.groupInfo?.name,
                    msg.content
                  );
                  if (!formatted) return null;
                  return (
                    <span key={smIdx} className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#2C2C2C] px-3 py-1 rounded-full text-center">
                      {formatted}
                    </span>
                  );
                })}
              </div>
            </Fragment>
          );
        }

        const nextMsg = currentMessages[idx + 1];
        const isSameSenderAsNext = nextMsg?.fromUserId?.toLowerCase() === msg.fromUserId?.toLowerCase() && nextMsg?.messageType !== 4;
        const isNextSeparator = nextMsg ? shouldShowSeparator(nextMsg, msg) : false;
        // Show avatar only on the LAST message of an opponent group or before separator
        const showAvatar = !isMine && (!isSameSenderAsNext || isNextSeparator);
        const showTime = !isSameSenderAsNext || isNextSeparator;
        const hasReactions = !!(msg.reactions && msg.reactions.length > 0 && msg.messageType !== 6);

        // Check if this is our last message, sent successfully but not yet read
        const isLastMessage = idx === currentMessages.length - 1;
        const isSentNotRead = isMine && !msg.isLoading && !msg.error && isLastMessage && (
          isGroup
            ? true
            : (msg.id !== lastReadMessageId)
        );

        // Read receipt logic: 1-1 và group chat
        // Chat 1-1: hiện avatar đối phương tại tin nhắn cuối cùng họ đã đọc
        const isLastReadByOpponent = !isGroup && msg.id === lastReadMessageId && opponentUser;

        // Group chat: hiện avatar những người đã đọc tại tin nhắn này
        // Chỉ hiện avatar nếu đây là tin nhắn "xa nhất" mà người đó đã đọc
        // (tránh hiện trùng trên nhiều tin nhắn)
        const groupReadAvatars: Array<{ userId: string; avatar: string; name: string }> = [];
        /* Tạm tắt cơ chế người khác đã xem tin nhắn đối với chat nhóm
        if (isGroup && isMine && msg.readBy && msg.readBy.length > 0) {
          for (const readerId of msg.readBy) {
            if (readerId?.toLowerCase() === currentUserId?.toLowerCase()) continue;
            // Kiểm tra xem người này có đọc tin nhắn nào xa hơn không
            const hasReadFurther = currentMessages.slice(idx + 1).some(
              (laterMsg) => laterMsg.readBy?.some(rId => rId?.toLowerCase() === readerId?.toLowerCase())
            );
            if (!hasReadFurther) {
              const member = activeConversation?.participants.find(p => p.id?.toLowerCase() === readerId?.toLowerCase());
              groupReadAvatars.push({
                userId: readerId,
                avatar: member?.urlAvatar || '/default-avatar.png',
                name: member?.name || 'Thành viên',
              });
            }
          }
        }
        */

        // Hiện tên sender trên tin nhắn đầu tiên trong group (tin của người khác) hoặc ngay sau separator
        const showSenderName = isGroup && !isMine && (!isSameSenderAsPrev || showSeparator);

        return (
          <Fragment key={msg.id || idx}>
            {showSeparator && (
              <div className="flex justify-center w-full my-4 animate-fade-in">
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#2C2C2C] px-3 py-1 rounded-full select-none">
                  {formatSeparatorTime(msg.sendTime)}
                </span>
              </div>
            )}
            <div id={`msg-${msg.id}`} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${marginTop} w-full transition-all duration-300 rounded-lg p-0.5`}>
              {showSenderName && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-12 mb-0.5 font-medium">
                  {msg.senderName || getSenderName(msg.fromUserId)}
                </span>
              )}
              <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'} ${(msg.messageType === 1 || msg.messageType === 2 || msg.messageType === 3 || msg.messageType === 5 || msg.messageType === 6) ? 'max-w-[85%]' : 'max-w-[50%]'}`}>
                {!isMine && (
                  <div className="w-9 flex-shrink-0">
                    {showAvatar ? (
                      <img
                        src={msg.senderAvatar || getSenderAvatar(msg.fromUserId)}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover bg-gray-200"
                      />
                    ) : (
                      <div className="w-9" />
                    )}
                  </div>
                )}

                <div className={`relative group/msg flex flex-col ${isMine ? 'items-end' : 'items-start'} min-w-0`}>
                  {/* Reply header: dòng "Bạn đã trả lời ..." */}
                  {msg.replyToMessageId && !msg.isRevoked && (() => {
                    const parentMsg = currentMessages.find(m => m.id === msg.replyToMessageId);
                    const parentSenderName = parentMsg
                      ? (parentMsg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase()
                        ? (isMine ? 'chính mình' : 'bạn')
                        : (parentMsg.senderName || getSenderName(parentMsg.fromUserId)))
                      : null;
                    const selfLabel = isMine ? 'Bạn' : (msg.senderName || getSenderName(msg.fromUserId));
                    return (
                      <div className={`flex items-center gap-1 mb-0.5 ${isMine ? 'mr-1' : 'ml-1'}`}>
                        <Reply size={12} className="text-gray-400 scale-x-[-1]" />
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {parentSenderName ? `${selfLabel} đã trả lời ${parentSenderName}` : `${selfLabel} đã trả lời tin nhắn`}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Replied Message Quote Box */}
                  {msg.replyToMessageId && !msg.isRevoked && (() => {
                    const parentMsg = currentMessages.find(m => m.id === msg.replyToMessageId);
                    if (!parentMsg) return null;
                    const senderName = parentMsg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase()
                      ? 'Bạn'
                      : (parentMsg.senderName || getSenderName(parentMsg.fromUserId));

                    let contentText = parentMsg.content;
                    if (parentMsg.isRevoked) {
                      contentText = 'Tin nhắn đã bị thu hồi';
                    } else if (parentMsg.messageType === 1) {
                      contentText = '[Hình ảnh]';
                    } else if (parentMsg.messageType === 2) {
                      contentText = '[Video]';
                    } else if (parentMsg.messageType === 3) {
                      contentText = `[File] ${parentMsg.fileName || ''}`;
                    } else if (parentMsg.messageType === 6) {
                      contentText = '[Nhãn dán]';
                    }

                    return (
                      <div
                        onClick={() => {
                          const element = document.getElementById(`msg-${msg.replyToMessageId}`);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.classList.add('bg-[#8ED8ED]/20', 'dark:bg-[#8ED8ED]/10');
                            setTimeout(() => {
                              element.classList.remove('bg-[#8ED8ED]/20', 'dark:bg-[#8ED8ED]/10');
                            }, 2000);
                          }
                        }}
                        className={`mb-1 px-3 py-1.5 text-xs rounded-xl cursor-pointer border-l-2 transition-all max-w-full select-none ${isMine
                          ? 'bg-[#8ED8ED]/15 dark:bg-[#8ED8ED]/10 hover:bg-[#8ED8ED]/25 dark:hover:bg-[#8ED8ED]/20 text-gray-800 dark:text-gray-200 border-l-[#8ED8ED]'
                          : 'bg-gray-200/80 dark:bg-zinc-800/90 hover:bg-gray-200 dark:hover:bg-zinc-700/90 text-gray-800 dark:text-gray-200 border-l-gray-400 dark:border-l-zinc-500'
                          }`}
                      >
                        <p className="font-semibold text-[10px] text-[#7bc8dd] dark:text-[#8ED8ED] truncate">
                          {senderName}
                        </p>
                        <p className="truncate text-gray-600 dark:text-gray-300 max-w-[250px]">
                          {contentText}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Revoked message */}
                  {msg.isRevoked ? (
                    <div
                      className={`py-2 px-4 text-[15px] leading-relaxed break-words w-fit rounded-2xl border border-dashed italic text-gray-400 dark:text-gray-500 ${isMine
                        ? 'border-gray-300 dark:border-gray-600 rounded-br-none'
                        : 'border-gray-300 dark:border-gray-600 rounded-bl-none'
                        }`}
                    >
                      <span>
                        {isMine
                          ? 'Bạn đã xóa một tin nhắn'
                          : (() => {
                            const name = msg.senderName || getSenderName(msg.fromUserId);
                            return name ? `${name} đã xóa một tin nhắn` : 'Tin nhắn đã được thu hồi';
                          })()
                        }
                      </span>
                    </div>
                  ) : (
                    <div className={`relative group/bubble w-fit max-w-full ${hasReactions ? 'mb-2' : ''}`}>
                      {/* Media message (Image/Video/File) */}
                      {(msg.messageType === 1 || msg.messageType === 2 || msg.messageType === 3) ? (
                        <>
                          <MediaMessageBubble
                            messageType={msg.messageType}
                            url={msg.url || msg.content}
                            localObjectUrl={msg.localObjectUrl}
                            fileName={msg.fileName}
                            fileSize={msg.fileSize}
                            attachments={msg.attachments}
                            isLoading={msg.isLoading}
                            progress={msg.progress}
                            error={msg.error}
                            isMine={isMine}
                            onImageClick={(attachmentIdx) => openMediaViewer(msg.id, attachmentIdx)}
                            formattedTime={showTime ? formatMessageTime(msg.sendTime) : undefined}
                          />
                          {/* Text content đính kèm media */}
                          {msg.content && msg.url && msg.content !== msg.url && (
                            <div
                              className={`mt-1 py-2 px-4 text-[15px] leading-relaxed break-words w-fit rounded-2xl ${isMine
                                ? 'bg-[#8ED8ED] text-gray-900 rounded-br-none'
                                : 'bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-gray-100 shadow-sm rounded-bl-none'
                                }`}
                            >
                              {formatMessageContent(msg.content, isMine, msg.mentions)}
                            </div>
                          )}
                        </>
                      ) : msg.messageType === 6 ? (
                        /* Sticker message: 130x130 với background-image, không có bubble nền */
                        <div className="relative group flex flex-col items-center">
                          <div className="relative">
                            <div
                              className="w-[130px] h-[130px] bg-contain bg-no-repeat bg-center"
                              style={{ backgroundImage: `url(${msg.content})` }}
                              title="Nhãn dán"
                            />
                            {msg.reactions && msg.reactions.length > 0 && (
                              <ReactionSummaryPill
                                reactions={msg.reactions}
                                isMine={isMine}
                                conversationId={conversationId}
                                messageId={msg.id}
                                currentUserId={currentUserId}
                              />
                            )}
                          </div>
                          {showTime && (
                            <span className={`text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 select-none opacity-0 group-hover:opacity-100 transition-opacity`}>
                              {formatMessageTime(msg.sendTime)}
                            </span>
                          )}
                        </div>
                      ) : msg.messageType === 5 ? (
                        /* Link message: text + preview card wrapped together */
                        <div
                          className={`flex flex-col min-w-0 w-[320px] max-w-full overflow-hidden border border-gray-200/50 dark:border-gray-700/50 ${isMine
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
                          <div className={`pt-2 px-4 text-[15px] leading-relaxed break-words relative ${showTime ? 'pb-5.5' : 'pb-2'
                            }`}>
                            {tokenizeText(msg.content).map((token, index) => {
                              if (token.isUrl) {
                                return (
                                  <a
                                    key={index}
                                    href={token.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`underline break-all ${isMine
                                      ? 'text-blue-800 hover:text-blue-900 font-medium'
                                      : 'text-blue-600 hover:text-blue-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium'
                                      }`}
                                  >
                                    {token.text}
                                  </a>
                                );
                              }
                              return <span key={index}>{formatMessageContent(token.text, isMine, msg.mentions)}</span>;
                            })}
                            {showTime && (
                              <span className={`absolute bottom-0.5 left-3 text-[9px] select-none ${isMine ? 'text-gray-700/80' : 'text-gray-500 dark:text-gray-400/80'}`}>
                                {formatMessageTime(msg.sendTime)}
                              </span>
                            )}
                          </div>
                          <LinkPreviewCard messageContent={msg.content} isMine={isMine} insideBubble={true} />
                        </div>
                      ) : (
                        /* Text message */
                        <div
                          className={`pt-2 px-4 text-[15px] leading-relaxed break-words w-fit relative ${showTime
                            ? 'pb-5.5'
                            : hasReactions
                              ? 'pb-4 pr-6'
                              : 'pb-2'
                            } ${showTime
                              ? (hasReactions ? 'min-w-[120px]' : 'min-w-[90px]')
                              : (hasReactions ? 'min-w-[70px]' : '')
                            } ${isMine
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
                          <span>{formatMessageContent(msg.content, isMine, msg.mentions)}</span>
                          {showTime && (
                            <span className={`absolute bottom-0.5 left-3 text-[9px] select-none ${isMine ? 'text-gray-700/80' : 'text-gray-500 dark:text-gray-400/80'}`}>
                              {formatMessageTime(msg.sendTime)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Hover toolbar: Reaction + Reply + More */}
                      {!msg.isLoading && !msg.error && (
                        <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/bubble:opacity-100 transition-opacity z-10 ${isMine ? '-left-[5.5rem]' : '-right-[5.5rem]'
                          }`}>
                          <div className="relative">
                            <button
                              onClick={() => setReactionPickerMsgId(prev => prev === msg.id ? null : msg.id)}
                              className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                              title="Bày tỏ cảm xúc"
                            >
                              <Smile size={16} />
                            </button>
                            <ReactionPicker
                              isOpen={reactionPickerMsgId === msg.id}
                              onSelect={(reactionType) => {
                                void handleReaction(
                                  msg.id,
                                  msg.fromUserId,
                                  reactionType,
                                  msg.reactions || [],
                                );
                              }}
                              onClose={() => setReactionPickerMsgId(null)}
                              isMine={isMine}
                            />
                          </div>
                          <button
                            onClick={() => handleReply(msg)}
                            className="p-1.5 text-gray-400 hover:text-[#8ED8ED] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                            title="Trả lời"
                          >
                            <Reply size={16} className="scale-x-[-1]" />
                          </button>
                          <div className="relative" ref={activeMenuId === msg.id ? menuRef : undefined}>
                            <button
                              onClick={() => setActiveMenuId(prev => prev === msg.id ? null : msg.id)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                              title="Tùy chọn"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {activeMenuId === msg.id && (
                              <div className={`absolute bottom-full mb-1 bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 z-50 min-w-[160px] ${isMine ? 'right-0' : 'left-0'
                                }`}>
                                {isMine && (
                                  <button
                                    onClick={() => void handleRevoke(msg.id)}
                                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    Thu hồi
                                  </button>
                                )}
                                <button
                                  onClick={() => void handleDeleteLocally(msg.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                  Xóa chỉ ở phía tôi
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Timestamp: hiện khi hover */}
                      <span className={`absolute -top-7 z-20 transition-all duration-200 opacity-0 group-hover/bubble:opacity-100 pointer-events-none select-none whitespace-nowrap px-2.5 py-1 text-[10.5px] font-medium rounded-full shadow-md backdrop-blur-sm border bg-zinc-900/90 text-zinc-100 border-zinc-700/30 dark:bg-white/95 dark:text-zinc-900 dark:border-zinc-200/50 ${isMine ? 'right-0' : 'left-0'
                        }`}>
                        {formatHoverDateTime(msg.sendTime)}
                      </span>

                      {/* Reaction Summary Pill */}
                      {msg.reactions && msg.reactions.length > 0 && msg.messageType !== 6 && (
                        <ReactionSummaryPill
                          reactions={msg.reactions}
                          isMine={isMine}
                          conversationId={conversationId}
                          messageId={msg.id}
                          currentUserId={currentUserId}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Status Indicator for mine (placed below the bubble row) */}
              {isMine && (msg.isLoading || msg.error || isSentNotRead) && (
                <div
                  className="flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium select-none bg-gray-200/60 dark:bg-zinc-800/80 text-gray-600 dark:text-gray-400 w-fit mr-0.5 animate-fade-in-up"
                  title={msg.error || (isSentNotRead ? "Đã gửi" : "Đang gửi")}
                >
                  {msg.isLoading && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                      <span>Đang gửi</span>
                    </>
                  )}
                  {msg.error && (
                    <>
                      <AlertCircle className="h-3 w-3 text-red-500" />
                      <span className="text-red-500">Lỗi gửi</span>
                    </>
                  )}
                  {isSentNotRead && (
                    <>
                      <Check className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                      <span>Đã gửi</span>
                    </>
                  )}
                </div>
              )}

              {/* Chat 1-1: Messenger style avatar nhỏ */}
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

              {/* Group chat: Nhiều avatar xếp hàng ngang */}
              {groupReadAvatars.length > 0 && (
                <div className="mt-1 flex -space-x-1 mr-0.5 animate-fade-in-up">
                  {groupReadAvatars.map((reader) => (
                    <img
                      key={reader.userId}
                      src={reader.avatar}
                      alt={reader.name}
                      className="w-3.5 h-3.5 rounded-full border border-white dark:border-[#121212] shadow-sm object-cover"
                      title={`${reader.name} đã xem`}
                    />
                  ))}
                </div>
              )}
            </div>
          </Fragment>
        );
      })}

      {/* Typing indicator */}
      {isOpponentTyping && (
        <div className="flex justify-start max-w-full mt-2">
          <div className="flex items-end gap-2">
            {/* Render avatar(s) cho typing users */}
            <div className="flex -space-x-2">
              {visibleTypingUsers.slice(0, 3).map(entry => {
                const avatar = getSenderAvatar(entry.userId);
                return (
                  <img
                    key={entry.userId}
                    src={avatar}
                    alt={entry.userName || ''}
                    className="w-8 h-8 rounded-full object-cover bg-gray-200 border-2 border-gray-50 dark:border-[#121212]"
                  />
                );
              })}
            </div>
            <div className="py-2 px-3.5 bg-white dark:bg-[#2C2C2C] rounded-2xl rounded-bl-none shadow-sm">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400/90 dark:bg-gray-300/80 animate-bounce [animation-delay:-0.32s]" />
                <span className="w-2 h-2 rounded-full bg-gray-400/90 dark:bg-gray-300/80 animate-bounce [animation-delay:-0.16s]" />
                <span className="w-2 h-2 rounded-full bg-gray-400/90 dark:bg-gray-300/80 animate-bounce" />
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />

      {/* Fullscreen Media Viewer */}
      <MediaViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        startIndex={viewerStartIndex}
        messages={currentMessages}
      />

      {/* Ended Call Group Modal */}
      {showEndCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in">
          <div className="relative w-full max-w-[340px] p-6 bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl border border-gray-100 dark:border-zinc-800 transition-all scale-in">
            <button
              onClick={() => setShowEndCallModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <h3 className="text-[17px] font-bold text-gray-900 dark:text-white mb-4">
                Cuộc gọi {modalCallType === 'video' ? 'video' : 'thoại'} nhóm đã kết thúc
              </h3>

              <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-6 leading-normal">
                Hãy gọi cho nhóm để bắt đầu cuộc gọi {modalCallType === 'video' ? 'video' : 'thoại'} mới
              </p>

              <div className="flex items-center justify-center gap-3 w-full">
                <button
                  onClick={() => setShowEndCallModal(false)}
                  className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    const opponentName = activeConversation?.groupInfo?.name || 'Nhóm chat';
                    const opponentAvatar = activeConversation?.groupInfo?.groupImage || '';
                    void useCallStore.getState().startCall(modalConversationId, modalCallType, '', opponentName, opponentAvatar);
                    setShowEndCallModal(false);
                  }}
                  className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                >
                  Gọi nhóm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
