import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Play, FileText, Loader2, Globe } from 'lucide-react';
import { type OverlayTab, useMediaFetch, useLinkFetch, groupByMonth, formatFileSize } from '../../hooks/useMediaOverlay';
import type { ConversationMediaItem } from '../../types/chat';
import LinkItemRow from './LinkItemRow';
import MediaViewer from './MediaViewer';

interface Props {
  conversationId: string;
  initialTab: OverlayTab;
  onClose: () => void;
}

const TAB_LIST: { key: OverlayTab; label: string }[] = [
  { key: 'media', label: 'File phương tiện' },
  { key: 'file', label: 'File' },
  { key: 'link', label: 'Liên kết' },
];

export default function MediaOverlaySidebar({ conversationId, initialTab, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<OverlayTab>(initialTab);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white dark:bg-[#1E1E1E]">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </button>
        <h3 className="font-bold text-base text-gray-900 dark:text-white">File phương tiện, file và liên kết</h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 px-4 flex-shrink-0">
        {TAB_LIST.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-2.5 px-3 text-sm font-medium transition-colors relative ${activeTab === tab.key
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'media' && <MediaTab conversationId={conversationId} />}
        {activeTab === 'file' && <FileTab conversationId={conversationId} />}
        {activeTab === 'link' && <LinkTab conversationId={conversationId} />}
      </div>
    </div>
  );
}

/** Chuyển ConversationMediaItem[] thành MessageItem[] giả để tương thích MediaViewer */
function toFakeMessages(items: ConversationMediaItem[]) {
  return items.map(item => {
    const isVid = /\.(mp4|mov|webm|avi|mkv)$/i.test(item.fileName);
    return {
      id: item.id,
      content: '',
      sendTime: item.sendTime,
      fromUserId: '',
      messageType: isVid ? 2 : 1,
      url: item.url,
      fileName: item.fileName,
      fileSize: item.size,
    };
  });
}

/** Tab File phương tiện (ảnh/video) — lưới 3 cột gom theo tháng + MediaViewer */
function MediaTab({ conversationId }: { conversationId: string }) {
  const { items, isLoading, hasMore, loadMore } = useMediaFetch(conversationId, false);
  const groups = groupByMonth(items);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const fakeMessages = useMemo(() => toFakeMessages(items), [items]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!hasMore || isLoading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMore();
  }, [hasMore, isLoading, loadMore]);

  const isVideo = (fileName: string) => /\.(mp4|mov|webm|avi|mkv)$/i.test(fileName);

  /** Tìm flat index của item trong toàn bộ danh sách items */
  const openViewer = useCallback((itemId: string) => {
    const idx = items.findIndex(i => i.id === itemId);
    if (idx >= 0) setViewerIndex(idx);
  }, [items]);

  if (!isLoading && items.length === 0) return <EmptyState text="Chưa có file phương tiện" />;

  return (
    <>
      <div onScroll={handleScroll} className="overflow-y-auto h-full p-3 space-y-4">
        {groups.map(group => (
          <div key={group.label}>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">{group.label}</h4>
            <div className="grid grid-cols-3 gap-1">
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => openViewer(item.id)}
                  className="relative aspect-square rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
                >
                  {isVideo(item.fileName) ? (
                    <>
                      <video
                        src={item.url}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play size={24} className="text-white fill-white" />
                      </div>
                    </>
                  ) : (
                    <img src={item.url} alt={item.fileName} className="w-full h-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {isLoading && <LoadingSpinner />}
      </div>

      {/* Fullscreen Media Viewer */}
      <MediaViewer
        isOpen={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
        startIndex={viewerIndex ?? 0}
        messages={fakeMessages}
      />
    </>
  );
}

/** Tab File (tài liệu) — danh sách tên + kích thước */
function FileTab({ conversationId }: { conversationId: string }) {
  const { items, isLoading, hasMore, loadMore } = useMediaFetch(conversationId, true);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!hasMore || isLoading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMore();
  }, [hasMore, isLoading, loadMore]);

  if (!isLoading && items.length === 0) return <EmptyState text="Chưa có file" />;

  return (
    <div onScroll={handleScroll} className="overflow-y-auto h-full divide-y divide-gray-100 dark:divide-gray-800">
      {items.map(item => (
        <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors">
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <FileText size={22} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.fileName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(item.size)}</p>
          </div>
        </a>
      ))}
      {isLoading && <LoadingSpinner />}
    </div>
  );
}

/** Tab Liên kết — danh sách link kèm preview */
function LinkTab({ conversationId }: { conversationId: string }) {
  const { items, isLoading, hasMore, loadMore } = useLinkFetch(conversationId);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!hasMore || isLoading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMore();
  }, [hasMore, isLoading, loadMore]);

  if (!isLoading && items.length === 0) return <EmptyState text="Chưa có liên kết" />;

  return (
    <div onScroll={handleScroll} className="overflow-y-auto h-full divide-y divide-gray-100 dark:divide-gray-800">
      {items.map(item => <LinkItemRow key={item.id} content={item.content} />)}
      {isLoading && <LoadingSpinner />}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16">
      <Globe size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-sm text-gray-400 dark:text-gray-500">{text}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-4">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  );
}
