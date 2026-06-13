import { useEffect, useRef, useState, useMemo, useCallback, Fragment } from 'react';
import { useChatStore, resolveUserName } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import GroupAvatar from './GroupAvatar';
import MediaMessageBubble from './MediaMessageBubble';
import MediaViewer from './MediaViewer';
import LinkPreviewCard from './LinkPreviewCard';
import { convertUtcToLocal, tokenizeText, formatSystemMessage } from '../../lib/utils';


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

interface Props {
  conversationId: string;
  markAsRead: (conversationId: string, messageId: string) => Promise<void>;
  isConnected: boolean;
}

export default function MessageList({ conversationId, markAsRead, isConnected }: Props) {
  const { messages, setMessages, prependMessages, conversations } = useChatStore();
  //const userCache = useChatStore(state => state.userCache);
  const typingByConversationId = useChatStore((state) => state.typingByConversationId);
  const currentUserId = useAuthStore(state => state.user?.id);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.conversationId === conversationId),
    [conversations, conversationId]
  );

  const isGroup = activeConversation?.type === 1;
  const opponentUser = !isGroup ? activeConversation?.user : null;

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
      if (entry.userId === currentUserId) return false;
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

        // System message: render căn giữa
        if (msg.messageType === 4) {
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

        const isMine = msg.fromUserId?.toLowerCase() === currentUserId?.toLowerCase();
        const nextMsg = currentMessages[idx + 1];
        const isSameSenderAsPrev = prevMsg?.fromUserId?.toLowerCase() === msg.fromUserId?.toLowerCase() && prevMsg?.messageType !== 4;
        const isSameSenderAsNext = nextMsg?.fromUserId?.toLowerCase() === msg.fromUserId?.toLowerCase() && nextMsg?.messageType !== 4;
        // Show avatar only on the LAST message of an opponent group
        const showAvatar = !isMine && !isSameSenderAsNext;
        // Tight gap within same-sender group, larger gap between groups
        const marginTop = idx === 0 ? 'mt-0' : isSameSenderAsPrev ? 'mt-0.5' : 'mt-4';

        // Check if this is our last message, sent successfully but not yet read
        const isLastMessage = idx === currentMessages.length - 1;
        const isSentNotRead = isMine && !msg.isLoading && !msg.error && isLastMessage && (
          isGroup
            ? (!msg.readBy || msg.readBy.filter(rId => rId?.toLowerCase() !== currentUserId?.toLowerCase()).length === 0)
            : (msg.id !== lastReadMessageId)
        );

        // Read receipt logic: 1-1 và group chat
        // Chat 1-1: hiện avatar đối phương tại tin nhắn cuối cùng họ đã đọc
        const isLastReadByOpponent = !isGroup && msg.id === lastReadMessageId && opponentUser;

        // Group chat: hiện avatar những người đã đọc tại tin nhắn này
        // Chỉ hiện avatar nếu đây là tin nhắn "xa nhất" mà người đó đã đọc
        // (tránh hiện trùng trên nhiều tin nhắn)
        const groupReadAvatars: Array<{ userId: string; avatar: string; name: string }> = [];
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

        // Hiện tên sender trên tin nhắn đầu tiên trong group (tin của người khác)
        const showSenderName = isGroup && !isMine && !isSameSenderAsPrev;

        return (
          <Fragment key={msg.id || idx}>
            {showSeparator && (
              <div className="flex justify-center w-full my-4 animate-fade-in">
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#2C2C2C] px-3 py-1 rounded-full select-none">
                  {formatSeparatorTime(msg.sendTime)}
                </span>
              </div>
            )}
            <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${marginTop} w-full`}>
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

                <div className={`relative group flex flex-col ${isMine ? 'items-end' : 'items-start'} min-w-0`}>
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
                        formattedTime={formatMessageTime(msg.sendTime)}
                      />
                      {/* Text content đính kèm media */}
                      {msg.content && msg.url && msg.content !== msg.url && (
                        <div
                          className={`mt-1 py-2 px-4 text-[15px] leading-relaxed break-words w-fit rounded-2xl ${isMine
                            ? 'bg-[#8ED8ED] text-gray-900 rounded-br-none'
                            : 'bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-gray-100 shadow-sm rounded-bl-none'
                            }`}
                        >
                          {msg.content}
                        </div>
                      )}
                    </>
                  ) : msg.messageType === 6 ? (
                    /* Sticker message: 130x130 với background-image, không có bubble nền */
                    <div className="relative group flex flex-col items-center">
                      <div
                        className="w-[130px] h-[130px] bg-contain bg-no-repeat bg-center"
                        style={{ backgroundImage: `url(${msg.content})` }}
                        title="Nhãn dán"
                      />
                      <span className={`text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 select-none opacity-0 group-hover:opacity-100 transition-opacity`}>
                        {formatMessageTime(msg.sendTime)}
                      </span>
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
                      <div className="py-2 px-4 text-[15px] leading-relaxed break-words relative pr-12 pb-1.5">
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
                          return <span key={index}>{token.text}</span>;
                        })}
                        <span className={`absolute bottom-0.5 right-1.5 text-[9px] select-none ${isMine ? 'text-gray-700' : 'text-gray-500 dark:text-gray-400'}`}>
                          {formatMessageTime(msg.sendTime)}
                        </span>
                      </div>
                      <LinkPreviewCard messageContent={msg.content} isMine={isMine} insideBubble={true} />
                    </div>
                  ) : (
                    /* Text message */
                    <div
                      className={`py-2 px-4 text-[15px] leading-relaxed break-words w-fit relative pr-12 pb-1.5 ${isMine
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
                      <span>{msg.content}</span>
                      <span className={`absolute bottom-0.5 right-1.5 text-[9px] select-none ${isMine ? 'text-gray-700' : 'text-gray-500 dark:text-gray-400'}`}>
                        {formatMessageTime(msg.sendTime)}
                      </span>
                    </div>
                  )}
                  {/* Timestamp: hiện khi hover */}
                  <span className={`absolute -top-5 text-[10px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isMine ? 'right-0' : 'left-0'}`}>
                    {formatMessageTime(msg.sendTime)}
                  </span>
                </div>

                {/* Status Indicator for mine */}
                {isMine && (msg.isLoading || msg.error || isSentNotRead) && (
                  <div
                    className="flex items-center justify-center w-4 h-4 flex-shrink-0 self-end mb-1 cursor-default"
                    title={msg.error || (isSentNotRead ? "Đã gửi" : "Đang gửi")}
                  >
                    {msg.isLoading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    )}
                    {msg.error && (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    {isSentNotRead && (
                      <Check className="h-3.5 w-3.5 text-gray-400" />
                    )}
                  </div>
                )}
              </div>

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
    </div>
  );
}
