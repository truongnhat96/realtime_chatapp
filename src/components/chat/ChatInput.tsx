import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Smile, Paperclip, ImagePlus, X, FileText, Plus, Link2, Sticker, Reply } from 'lucide-react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import StickerPicker from './StickerPicker';
import { chatApi } from '../../lib/api';
import { getFirstUrl, normalizeUrl } from '../../lib/utils';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import type { LinkPreviewData, ConversationItem } from '../../types/chat';
import type { ReplyingMessage } from '../../stores/chatStore';

/** Vietnamese i18n for Emoji Mart */
const emojiI18n = {
  search: 'Tìm kiếm biểu tượng cảm xúc',
  search_no_results_1: 'Ôi không!',
  search_no_results_2: 'Không tìm thấy emoji nào',
  pick: 'Chọn một emoji…',
  add_custom: 'Thêm emoji tùy chỉnh',
  categories: {
    activity: 'Hoạt động',
    custom: 'Tùy chỉnh',
    flags: 'Cờ',
    foods: 'Đồ ăn & Thức uống',
    frequent: 'Hay dùng',
    nature: 'Động vật & Thiên nhiên',
    objects: 'Đồ vật',
    people: 'Mặt cười và hình người',
    places: 'Du lịch & Địa điểm',
    search: 'Kết quả tìm kiếm',
    symbols: 'Biểu tượng',
  },
  skins: {
    choose: 'Chọn tông màu da mặc định',
    1: 'Mặc định',
    2: 'Sáng',
    3: 'Trung bình sáng',
    4: 'Trung bình',
    5: 'Trung bình tối',
    6: 'Tối',
  },
};

interface Props {
  conversation?: ConversationItem;
  onSendMessage: (text: string, mentionedUserIds?: string[], mentionEveryone?: boolean) => void | Promise<void>;
  onSendMediaFiles: (files: File[], content: string | null) => void | Promise<void>;
  onSendSticker?: (url: string) => void | Promise<void>;
  onTypingInputChange?: (value: string) => void;
  onStopTyping?: () => void;
  disabled?: boolean;
  replyingMessage?: ReplyingMessage | null;
  onCancelReply?: () => void;
}

/** Detect messageType từ MIME: 1=Image, 2=Video, 3=File */
const detectMessageType = (file: File): number => {
  if (file.type.startsWith('image/')) return 1;
  if (file.type.startsWith('video/')) return 2;
  return 3;
};

/** Format file size cho hiển thị */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type FileAttachment = {
  file: File;
  previewUrl?: string;
  id: string;
};

export default function ChatInput({ conversation, onSendMessage, onSendMediaFiles, onSendSticker, onTypingInputChange, onStopTyping, disabled, replyingMessage, onCancelReply }: Props) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileAttachment[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isDark = useThemeStore((s) => s.isDark);

  // === Mention Feature State ===
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [mentions, setMentions] = useState<{ id: string; name: string; isEveryone?: boolean }[]>([]);
  const [randomParticipants, setRandomParticipants] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // === Link Preview State ===
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced link detection (500ms)
  useEffect(() => {
    // Cleanup previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const rawUrl = getFirstUrl(message);
    const normalized = rawUrl ? normalizeUrl(rawUrl) : null;

    // Nếu không có URL -> xóa preview
    if (!normalized) {
      setLinkPreview(null);
      setPreviewUrl(null);
      setIsLoadingPreview(false);
      return;
    }

    // Nếu URL đã bị dismiss -> không hiện lại
    if (normalized === dismissedUrl) return;

    // Nếu URL giống URL hiện tại -> giữ nguyên
    if (normalized === previewUrl && linkPreview) return;

    // Debounce 500ms trước khi gọi API
    setIsLoadingPreview(true);
    debounceTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await chatApi.getLinkPreview(normalized);
          if (res.isSuccess && res.data) {
            setLinkPreview(res.data);
            setPreviewUrl(normalized);
          } else {
            setLinkPreview(null);
            setPreviewUrl(null);
          }
        } catch {
          setLinkPreview(null);
          setPreviewUrl(null);
        } finally {
          setIsLoadingPreview(false);
        }
      })();
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [message, dismissedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilesSelect = useCallback((files: FileList | null, inputRef: React.RefObject<HTMLInputElement | null>) => {
    if (!files || files.length === 0) return;

    const newAttachments: FileAttachment[] = Array.from(files).map(file => {
      const type = detectMessageType(file);
      return {
        file,
        previewUrl: (type === 1 || type === 2) ? URL.createObjectURL(file) : undefined,
        id: crypto.randomUUID()
      };
    });

    setSelectedFiles(prev => [...prev, ...newAttachments]);

    // Clear input value so the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }, []);



  // Load 5 random participants when suggestion list is opened
  useEffect(() => {
    if (showSuggestions && conversation && conversation.type === 1) {
      const currentUserId = useAuthStore.getState().user?.id;
      const all = (conversation.participants || [])
        .filter(p => p.id?.toLowerCase() !== currentUserId?.toLowerCase())
        .map(p => ({ id: p.id, name: p.name, avatar: p.urlAvatar }));

      // Shuffle and pick 5
      const shuffled = [...all].sort(() => 0.5 - Math.random()).slice(0, 5);
      setRandomParticipants(shuffled);
    } else if (!showSuggestions) {
      setRandomParticipants([]);
    }
  }, [showSuggestions, conversation]);

  // === Mention Candidates & Filter ===
  const filteredCandidates = useMemo(() => {
    if (!showSuggestions || !conversation || conversation.type !== 1) return [];

    const list: Array<{ id: string; name: string; avatar?: string; isEveryone?: boolean }> = [];

    // Add "everyone" / "mọi người" if matches search query
    if (!suggestionQuery || 'mọi người'.includes(suggestionQuery.toLowerCase())) {
      list.push({ id: 'everyone', name: 'mọi người', isEveryone: true });
    }

    if (suggestionQuery) {
      // Filter the entire group by query and limit to 5
      const currentUserId = useAuthStore.getState().user?.id;
      const query = suggestionQuery.toLowerCase();
      const filtered = (conversation.participants || [])
        .filter(p => p.id?.toLowerCase() !== currentUserId?.toLowerCase() && p.name.toLowerCase().includes(query))
        .map(p => ({ id: p.id, name: p.name, avatar: p.urlAvatar }))
        .slice(0, 5);
      list.push(...filtered);
    } else {
      // Use the pre-selected random 5 participants
      list.push(...randomParticipants);
    }

    return list;
  }, [showSuggestions, suggestionQuery, conversation, randomParticipants]);

  const selectSuggestion = useCallback((candidate: { id: string; name: string; isEveryone?: boolean }) => {
    if (!inputRef.current) return;
    const currentText = message;
    const selectionStart = inputRef.current.selectionStart || 0;
    const textBeforeCursor = currentText.slice(0, selectionStart);
    const textAfterCursor = currentText.slice(selectionStart);

    const lastAtIdx = textBeforeCursor.lastIndexOf('@');
    if (lastAtIdx !== -1) {
      const hasSpaceBefore = lastAtIdx === 0 || textBeforeCursor[lastAtIdx - 1] === ' ' || textBeforeCursor[lastAtIdx - 1] === '\u00A0';
      const prefix = hasSpaceBefore ? '' : ' ';
      const newTextBeforeCursor = textBeforeCursor.slice(0, lastAtIdx) + prefix + `@${candidate.name} `;
      const newText = newTextBeforeCursor + textAfterCursor;
      setMessage(newText);
      onTypingInputChange?.(newText);

      // Update cursor position
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = newTextBeforeCursor.length;
          inputRef.current.setSelectionRange(newPos, newPos);
          inputRef.current.focus();
        }
      }, 0);

      // Save mention item
      setMentions(prev => {
        if (prev.some(m => m.id === candidate.id)) return prev;
        return [...prev, { id: candidate.id, name: candidate.name, isEveryone: candidate.isEveryone }];
      });
    }
    setShowSuggestions(false);
  }, [message, mentions, onTypingInputChange]);

  // Click outside to close suggestions
  useEffect(() => {
    if (!showSuggestions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSuggestions]);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    const filesToSend = selectedFiles.map((f) => f.file);

    // Dọn dẹp state trước khi gửi
    setMessage('');
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (mediaInputRef.current) mediaInputRef.current.value = '';

    if (filesToSend.length > 0) {
      clearLinkPreview();
      setIsSending(true);
      try {
        // Gửi text riêng nếu có
        if (trimmedMessage) {
          // Extract active mentions
          const activeMentions = mentions.filter(m => {
            const lowerMessage = trimmedMessage.toLowerCase();
            return m.isEveryone
              ? lowerMessage.includes('@mọi người')
              : lowerMessage.includes(`@${m.name.toLowerCase()}`);
          });
          const mentionedUserIds = activeMentions.filter(m => !m.isEveryone).map(m => m.id);
          const mentionEveryone = activeMentions.some(m => m.isEveryone);
          await Promise.resolve(onSendMessage(trimmedMessage, mentionedUserIds, mentionEveryone));
        }
        // Gửi files
        await Promise.resolve(onSendMediaFiles(filesToSend, null));
      } catch (error) {
        console.error('Failed to send media: ', error);
      } finally {
        setIsSending(false);
        setMentions([]);
      }
      return;
    }

    // Chỉ gửi text
    if (!trimmedMessage || disabled || isSending) return;
    setIsSending(true);
    try {
      // Extract active mentions
      const activeMentions = mentions.filter(m => {
        const lowerMessage = trimmedMessage.toLowerCase();
        return m.isEveryone
          ? lowerMessage.includes('@mọi người')
          : lowerMessage.includes(`@${m.name.toLowerCase()}`);
      });
      const mentionedUserIds = activeMentions.filter(m => !m.isEveryone).map(m => m.id);
      const mentionEveryone = activeMentions.some(m => m.isEveryone);
      await Promise.resolve(onSendMessage(trimmedMessage, mentionedUserIds, mentionEveryone));
      onTypingInputChange?.('');
      clearLinkPreview();
    } catch (error) {
      console.error('Failed to send message: ', error);
    } finally {
      setIsSending(false);
      setMentions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev + 1) % filteredCandidates.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectSuggestion(filteredCandidates[selectedSuggestionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter') {
      void handleSend();
    }
  };

  const canSend = selectedFiles.length > 0 || message.trim();

  const clearLinkPreview = useCallback(() => {
    setLinkPreview(null);
    setPreviewUrl(null);
    setDismissedUrl(null);
    setIsLoadingPreview(false);
  }, []);

  const dismissLinkPreview = useCallback(() => {
    setDismissedUrl(previewUrl);
    setLinkPreview(null);
    setPreviewUrl(null);
    setIsLoadingPreview(false);
  }, [previewUrl]);

  // === Emoji Picker: click-outside handler ===
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        emojiPickerRef.current && !emojiPickerRef.current.contains(target) &&
        emojiButtonRef.current && !emojiButtonRef.current.contains(target)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  /** Append native emoji character vào message */
  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    setMessage((prev) => {
      const next = prev + emoji.native;
      onTypingInputChange?.(next);
      return next;
    });
    // Focus lại input sau khi chọn emoji
    inputRef.current?.focus();
  }, [onTypingInputChange]);

  const toggleEmojiPicker = useCallback(() => {
    setShowEmojiPicker((prev) => {
      if (!prev) setShowStickerPicker(false); // đóng sticker khi mở emoji
      return !prev;
    });
  }, []);

  // Render highlighted input overlay
  const getHighlightedInput = () => {
    if (!message) return null;
    if (mentions.length === 0) {
      return <span className="text-gray-900 dark:text-gray-100">{message}</span>;
    }

    // Sort names descending to match longer names first
    const names = mentions.map(m => m.isEveryone ? 'mọi người' : m.name).filter(Boolean);
    names.sort((a, b) => b.length - a.length);

    if (names.length === 0) {
      return <span className="text-gray-900 dark:text-gray-100">{message}</span>;
    }

    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`@(${escaped})`, 'g');

    const parts = message.split(regex);
    return parts.map((part, index) => {
      if (names.includes(part)) {
        return (
          <span key={index} className="text-blue-600 dark:text-blue-400">
            @{part}
          </span>
        );
      }
      return <span key={index} className="text-gray-900 dark:text-gray-100">{part}</span>;
    });
  };

  const syncScroll = useCallback(() => {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }, []);

  return (
    <div className="bg-white dark:bg-[#1E1E1E] border-t border-gray-200 dark:border-gray-800">
      {/* Reply preview bar */}
      {replyingMessage && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#2C2C2C] rounded-xl px-3 py-2.5 border border-gray-200 dark:border-gray-700">
            <Reply size={18} className="text-[#8ED8ED] flex-shrink-0 scale-x-[-1]" />
            <div className="flex-1 min-w-0 border-l-2 border-[#8ED8ED] pl-2">
              <p className="text-xs font-semibold text-[#8ED8ED] truncate">
                {replyingMessage.senderName}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {replyingMessage.messageType === 1 ? '[Hình ảnh]'
                  : replyingMessage.messageType === 2 ? '[Video]'
                    : replyingMessage.messageType === 3 ? '[File]'
                      : replyingMessage.messageType === 6 ? '[Đã gửi nhãn dán]'
                        : replyingMessage.content}
              </p>
            </div>
            <button
              onClick={onCancelReply}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full transition-colors flex-shrink-0"
              title="Hủy trả lời"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {/* Link Preview bar */}
      {(linkPreview || isLoadingPreview) && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#2C2C2C] rounded-xl px-3 py-2.5 border border-gray-200 dark:border-gray-700">
            <Link2 size={18} className="text-gray-400 flex-shrink-0" />
            {isLoadingPreview ? (
              <div className="flex-1 min-w-0 animate-pulse">
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-600 rounded mb-1" />
                <div className="h-2.5 w-48 bg-gray-200 dark:bg-gray-600 rounded" />
              </div>
            ) : linkPreview ? (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {linkPreview.siteName || linkPreview.title || new URL(normalizeUrl(previewUrl || '')).hostname}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                  {previewUrl}
                </p>
              </div>
            ) : null}
            <button
              onClick={dismissLinkPreview}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full transition-colors flex-shrink-0"
              title="Tắt preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {/* Preview area - danh sách file đã chọn */}
      {selectedFiles.length > 0 && (
        <div className="px-4">
          <div
            ref={previewContainerRef}
            className="flex items-center gap-3 overflow-x-auto py-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
          >
            {/* Nút thêm file */}
            <button
              onClick={() => mediaInputRef.current?.click()}
              className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0 hover:border-[#8ED8ED] hover:text-[#8ED8ED] transition-colors text-gray-400 self-center"
              title="Thêm file"
            >
              <Plus size={22} />
            </button>

            {selectedFiles.map((item) => {
              const file = item.file;
              const type = detectMessageType(file);
              const previewUrl = item.previewUrl;

              if (type === 3) {
                // Hiển thị dạng file (ngang giống Messenger)
                return (
                  <div key={item.id} className="relative flex-shrink-0 group">
                    {/* Nút xóa */}
                    <button
                      onClick={() => removeFile(item.id)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center transition-colors z-10 opacity-0 group-hover:opacity-100 shadow-sm"
                    >
                      <X size={12} />
                    </button>

                    <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 dark:bg-[#333333] rounded-xl flex-shrink-0 border border-gray-200 dark:border-gray-700 w-48 shadow-sm">
                      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                        <FileText size={20} className="text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Hiển thị dạng ảnh/video
              return (
                <div key={item.id} className="relative flex-shrink-0 group self-center mt-1">
                  {/* Nút xóa */}
                  <button
                    onClick={() => removeFile(item.id)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center transition-colors z-10 opacity-0 group-hover:opacity-100 shadow-sm"
                  >
                    <X size={12} />
                  </button>

                  {type === 1 && previewUrl && (
                    <img
                      src={previewUrl}
                      alt={file.name}
                      className="w-14 h-14 rounded-xl object-cover bg-gray-200 dark:bg-gray-700 shadow-sm"
                    />
                  )}
                  {type === 2 && previewUrl && (
                    <video
                      src={previewUrl}
                      className="w-14 h-14 rounded-xl object-cover bg-gray-200 dark:bg-gray-700 shadow-sm"
                      muted
                    />
                  )}

                  {/* File size tooltip */}
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatFileSize(file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="p-4 relative">
        {/* Mentions Suggestions Dropdown */}
        {showSuggestions && filteredCandidates.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute bottom-full left-4 z-50 mb-2 w-72 rounded-2xl bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-gray-800 shadow-2xl py-1.5 animate-fade-in"
          >
            {filteredCandidates.map((candidate, idx) => {
              const isSelected = idx === selectedSuggestionIndex;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => selectSuggestion(candidate)}
                  onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected
                      ? 'bg-[#8ED8ED]/10 text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1E1E1E]'
                    }`}
                >
                  {candidate.isEveryone ? (
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold">@</span>
                    </div>
                  ) : (
                    <img
                      src={candidate.avatar || '/default-avatar.png'}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-gray-100"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate leading-tight">
                      {candidate.name}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate leading-normal mt-1">
                      {candidate.isEveryone ? 'Nhắc đến mọi người trong nhóm' : 'Thành viên'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Emoji Picker popup */}
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="absolute bottom-full left-0 mb-2 z-50 animate-fade-in"
          >
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              theme={isDark ? 'dark' : 'light'}
              i18n={emojiI18n}
              previewPosition="none"
              skinTonePosition="search"
              set="native"
            />
          </div>
        )}
        {/* Sticker Picker popup */}
        {showStickerPicker && onSendSticker && (
          <StickerPicker
            onSendSticker={onSendSticker}
            onClose={() => setShowStickerPicker(false)}
          />
        )}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2C2C2C] rounded-full p-2 pr-2.5 transition-colors">
          <button
            ref={emojiButtonRef}
            onClick={toggleEmojiPicker}
            className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'bg-[#8ED8ED]/20 text-[#8ED8ED]' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            title="Biểu tượng cảm xúc"
          >
            <Smile size={22} />
          </button>

          {/* Nút Sticker */}
          <button
            onClick={() => {
              setShowStickerPicker(prev => {
                if (!prev) setShowEmojiPicker(false); // đóng emoji khi mở sticker
                return !prev;
              });
            }}
            className={`p-2 rounded-full transition-colors ${showStickerPicker ? 'bg-[#8ED8ED]/20 text-[#8ED8ED]' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            title="Nhãn dán"
          >
            <Sticker size={22} />
          </button>

          {/* Nút chọn ảnh/video */}
          <button
            onClick={() => mediaInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full transition-colors"
            title="Gửi ảnh hoặc video"
          >
            <ImagePlus size={22} />
          </button>

          {/* Nút chọn file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full transition-colors mr-1"
            title="Đính kèm file"
          >
            <Paperclip size={22} />
          </button>

          {/* Hidden file inputs - multiple */}
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelect(e.target.files, mediaInputRef);
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelect(e.target.files, fileInputRef);
            }}
          />

          <div className="flex-1 relative flex items-center min-w-0 self-stretch">
            {/* Highlight Overlay */}
            <div
              ref={overlayRef}
              className="absolute inset-0 flex items-center bg-transparent pointer-events-none overflow-hidden whitespace-nowrap text-[15px] px-0 select-none text-transparent"
              style={{
                lineHeight: 'normal',
              }}
            >
              <div className="w-full text-left whitespace-nowrap overflow-hidden">
                {getHighlightedInput()}
              </div>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => {
                const nextValue = e.target.value;
                setMessage(nextValue);
                onTypingInputChange?.(nextValue);
                setTimeout(syncScroll, 0);

                // Check if we should show mentions suggestions (only in group chats)
                if (conversation && conversation.type === 1) {
                  const selectionStart = e.target.selectionStart || 0;
                  const textBeforeCursor = nextValue.slice(0, selectionStart);
                  const lastAtIdx = textBeforeCursor.lastIndexOf('@');
                  if (lastAtIdx !== -1) {
                    const textAfterAt = textBeforeCursor.slice(lastAtIdx + 1);
                    if (!/\s/.test(textAfterAt)) {
                      setShowSuggestions(true);
                      setSuggestionQuery(textAfterAt);
                      setSelectedSuggestionIndex(0);
                      return;
                    }
                  }
                }
                setShowSuggestions(false);
              }}
              onKeyDown={(e) => {
                handleKeyDown(e);
                setTimeout(syncScroll, 0);
              }}
              onBlur={onStopTyping}
              onScroll={syncScroll}
              placeholder={disabled ? "Đang kết nối..." : "Nhập tin nhắn..."}
              className={`w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[15px] caret-gray-900 dark:caret-gray-100 placeholder-gray-500 px-0 ${message ? 'text-transparent' : 'text-gray-900 dark:text-gray-100'
                }`}
              style={{
                lineHeight: 'normal',
              }}
            />
          </div>

          <button
            onClick={() => {
              void handleSend();
            }}
            disabled={!canSend || disabled || isSending}
            className={`p-2.5 rounded-full transition-all flex items-center justify-center
              ${canSend
                ? 'bg-[#8ED8ED] text-white hover:bg-[#7bc8dd]'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
              }
            `}
          >
            <Send size={20} className={canSend ? "ml-0.5" : ""} />
          </button>
        </div>
      </div>
    </div>
  );
}
