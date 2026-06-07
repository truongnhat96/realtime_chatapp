import { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { chatApi } from '../../lib/api';
import { getFirstUrl, normalizeUrl, decodeHtmlEntities } from '../../lib/utils';
import type { LinkPreviewData } from '../../types/chat';

interface Props {
  messageContent: string;
  isMine: boolean;
  insideBubble?: boolean;
}

export default function LinkPreviewCard({ messageContent, isMine, insideBubble = false }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const rawUrl = getFirstUrl(messageContent);
  const normalizedUrl = rawUrl ? normalizeUrl(rawUrl) : null;

  const cachedPreview = useChatStore(
    (state) => (normalizedUrl ? state.linkPreviews[normalizedUrl] : undefined)
  );
  const setLinkPreview = useChatStore((state) => state.setLinkPreview);

  const fetchPreview = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await chatApi.getLinkPreview(url);
      if (res.isSuccess && res.data) {
        setLinkPreview(url, res.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [setLinkPreview]);

  useEffect(() => {
    if (!normalizedUrl || cachedPreview || error) return;
    void fetchPreview(normalizedUrl);
  }, [normalizedUrl, cachedPreview, error, fetchPreview]);

  if (!normalizedUrl) return null;

  const preview: LinkPreviewData | undefined = cachedPreview;

  if (isLoading) {
    return <PreviewSkeleton isMine={isMine} insideBubble={insideBubble} />;
  }

  if (error || !preview) return null;

  const title = decodeHtmlEntities(preview.title);
  const description = decodeHtmlEntities(preview.description);
  const siteName = decodeHtmlEntities(preview.siteName);

  return (
    <a
      href={normalizedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={
        insideBubble
          ? "block w-full border-t border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-[#1E1E1E] hover:opacity-90 transition-opacity"
          : "block mt-1.5 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2A2A2A] hover:opacity-90 transition-opacity max-w-xs"
      }
    >
      {preview.image && (
        <div className="w-full aspect-[1.91/1] bg-gray-100 dark:bg-gray-800">
          <img
            src={preview.image}
            alt={title || ''}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="px-3 py-2.5">
        {siteName && (
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-0.5">
            {siteName}
          </p>
        )}
        {title && (
          <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug line-clamp-2">
            {title}
          </p>
        )}
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3 mt-0.5">
            {description}
          </p>
        )}
      </div>
    </a>
  );
}

/** Skeleton loading cho Link Preview */
function PreviewSkeleton({ isMine, insideBubble = false }: { isMine: boolean; insideBubble?: boolean }) {
  return (
    <div
      className={
        insideBubble
          ? "w-full border-t border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-[#1E1E1E] animate-pulse"
          : `mt-1.5 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-xs animate-pulse ${
              isMine ? 'bg-[#7bc8dd]/30' : 'bg-gray-100 dark:bg-[#2A2A2A]'
            }`
      }
    >
      <div className="w-full aspect-[1.91/1] bg-gray-200 dark:bg-gray-700" />
      <div className="px-3 py-2.5 space-y-2">
        <div className="h-2.5 w-16 bg-gray-200 dark:bg-gray-600 rounded" />
        <div className="h-3.5 w-3/4 bg-gray-200 dark:bg-gray-600 rounded" />
        <div className="h-2.5 w-full bg-gray-200 dark:bg-gray-600 rounded" />
      </div>
    </div>
  );
}

