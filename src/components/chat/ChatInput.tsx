import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Smile, Paperclip, ImagePlus, X, FileText, Plus, Link2, Sticker, Reply } from 'lucide-react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import StickerPicker from './StickerPicker';
import { chatApi } from '../../lib/api';
import { getFirstUrl, normalizeUrl } from '../../lib/utils';
import { useThemeStore } from '../../stores/themeStore';
import type { LinkPreviewData } from '../../types/chat';
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
  onSendMessage: (text: string) => void | Promise<void>;
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

export default function ChatInput({ onSendMessage, onSendMediaFiles, onSendSticker, onTypingInputChange, onStopTyping, disabled, replyingMessage, onCancelReply }: Props) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileAttachment[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isDark = useThemeStore((s) => s.isDark);

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

  const clearAllFiles = useCallback(() => {
    setSelectedFiles(prev => {
      prev.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedMessage = message.trim();

    if (selectedFiles.length > 0) {
      if (disabled || isSending) return;
      const filesToSend = selectedFiles.map(s => s.file);
      // Xóa preview + text ngay lập tức
      setMessage('');
      onTypingInputChange?.('');
      clearAllFiles();
      clearLinkPreview();
      setIsSending(true);
      try {
        // Gửi text riêng nếu có
        if (trimmedMessage) {
          await Promise.resolve(onSendMessage(trimmedMessage));
        }
        // Gửi files
        await Promise.resolve(onSendMediaFiles(filesToSend, null));
      } catch (error) {
        console.error('Failed to send media: ', error);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Chỉ gửi text
    if (!trimmedMessage || disabled || isSending) return;
    setIsSending(true);
    try {
      await Promise.resolve(onSendMessage(trimmedMessage));
      setMessage('');
      onTypingInputChange?.('');
      clearLinkPreview();
    } catch (error) {
      console.error('Failed to send message: ', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
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

          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => {
              const nextValue = e.target.value;
              setMessage(nextValue);
              onTypingInputChange?.(nextValue);
            }}
            onKeyDown={handleKeyDown}
            onBlur={onStopTyping}
            placeholder={disabled ? "Đang kết nối..." : "Nhập tin nhắn..."}
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-[15px] text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />

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
