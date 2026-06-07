import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { convertUtcToLocal, getFirstUrl, normalizeUrl } from '../lib/utils';
import type { ConversationMediaItem, ConversationLinkItem, LinkPreviewData } from '../types/chat';

export type OverlayTab = 'media' | 'file' | 'link';

/** Nhóm media items theo tháng/năm (dạng label hiển thị) */
export interface MonthGroup<T> {
  label: string;
  items: T[];
}

/** Tạo label tháng dựa trên thời gian gửi (giờ VN) */
function getMonthLabel(sendTime: string): string {
  const localStr = convertUtcToLocal(sendTime);
  const date = new Date(localStr);
  if (isNaN(date.getTime())) return 'Không rõ';
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `Tháng ${month}` : `Tháng ${month} năm ${year}`;
}

/** Gom nhóm items theo tháng/năm, giữ thứ tự mới nhất trước */
export function groupByMonth<T extends { sendTime: string }>(items: T[]): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const label = getMonthLabel(item.sendTime);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(item);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

const PAGE_SIZE = 30;

/** Hook quản lý fetch + phân trang cho media/file */
export function useMediaFetch(conversationId: string, isFileRaw: boolean) {
  const [items, setItems] = useState<ConversationMediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const isFetching = useRef(false);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    try {
      const res = await chatApi.getConversationMedia(conversationId, isFileRaw, PAGE_SIZE, pageNum);
      if (res.isSuccess && res.data) {
        setItems(prev => pageNum === 1 ? res.data.items : [...prev, ...res.data.items]);
        setHasMore(res.data.hasNextPage);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Error fetching media:', err);
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [conversationId, isFileRaw]);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    void fetchPage(1);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) void fetchPage(page + 1);
  }, [hasMore, isLoading, page, fetchPage]);

  return { items, isLoading, hasMore, loadMore };
}

/** Hook quản lý fetch + phân trang cho links */
export function useLinkFetch(conversationId: string) {
  const [items, setItems] = useState<ConversationLinkItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const isFetching = useRef(false);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    try {
      const res = await chatApi.getConversationLinks(conversationId, PAGE_SIZE, pageNum);
      if (res.isSuccess && res.data) {
        setItems(prev => pageNum === 1 ? res.data.items : [...prev, ...res.data.items]);
        setHasMore(res.data.hasNextPage);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Error fetching links:', err);
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    void fetchPage(1);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) void fetchPage(page + 1);
  }, [hasMore, isLoading, page, fetchPage]);

  return { items, isLoading, hasMore, loadMore };
}

/** Hook lấy link preview cho 1 URL, dùng Zustand cache */
export function useLinkPreview(content: string): { preview: LinkPreviewData | null; isLoading: boolean } {
  const rawUrl = getFirstUrl(content);
  const url = rawUrl ? normalizeUrl(rawUrl) : null;

  const cached = useChatStore(state => url ? state.linkPreviews[url] : undefined);
  const setLinkPreview = useChatStore(state => state.setLinkPreview);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url || cached) return;
    let cancelled = false;
    setIsLoading(true);
    chatApi.getLinkPreview(url).then(res => {
      if (!cancelled && res.isSuccess && res.data) {
        setLinkPreview(url, res.data);
      }
    }).catch(() => { /* ignore */ }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [url, cached, setLinkPreview]);

  return { preview: cached ?? null, isLoading };
}

/** Format file size thân thiện */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2).replace(/\.?0+$/, '')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2).replace(/\.?0+$/, '')} MB`;
}
