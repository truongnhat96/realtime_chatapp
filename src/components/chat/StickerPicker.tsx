import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { chatApi } from '../../lib/api';
import { useChatStore } from '../../stores/chatStore';
import type { StickerPackageItem } from '../../types/chat';

interface Props {
  onSendSticker: (url: string) => void;
  onClose: () => void;
}

function StickerPicker({ onSendSticker, onClose }: Props) {
  const { stickerPacks, stickersByPack, setStickerPacks, addStickersForPack } = useChatStore();
  const [activePackName, setActivePackName] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StickerPackageItem[]>([]);
  const [isLoadingPacks, setIsLoadingPacks] = useState(false);
  const [isLoadingStickers, setIsLoadingStickers] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchCacheRef = useRef<Record<string, StickerPackageItem[]>>({});
  const pickerRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Đóng picker khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Lần đầu mở: lấy danh sách gói sticker nếu chưa có trong store
  useEffect(() => {
    if (stickerPacks.length > 0) {
      if (!activePackName) setActivePackName(stickerPacks[0].packageName);
      return;
    }
    const fetchPacks = async () => {
      setIsLoadingPacks(true);
      try {
        const res = await chatApi.getStickerPacks();
        if (res.isSuccess && res.data?.length) {
          setStickerPacks(res.data);
          setActivePackName(res.data[0].packageName);
        }
      } catch (err) {
        console.error('Failed to load sticker packs:', err);
      } finally {
        setIsLoadingPacks(false);
      }
    };
    void fetchPacks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Khi chọn gói: kiểm tra store, nếu chưa có mới gọi API
  useEffect(() => {
    if (!activePackName || isSearchMode) return;
    if (stickersByPack[activePackName]) return;

    const fetchStickers = async () => {
      setIsLoadingStickers(true);
      try {
        const res = await chatApi.getStickersByPack(activePackName);
        if (res.isSuccess && res.data) {
          addStickersForPack(activePackName, res.data.stickerUrls);
        }
      } catch (err) {
        console.error('Failed to load stickers for pack:', err);
      } finally {
        setIsLoadingStickers(false);
      }
    };
    void fetchStickers();
  }, [activePackName, isSearchMode, stickersByPack, addStickersForPack]);

  // Tìm kiếm sticker (debounce)
  useEffect(() => {
    if (!isSearchMode || !debouncedSearch.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    if (searchCacheRef.current[debouncedSearch]) {
      setSearchResults(searchCacheRef.current[debouncedSearch]);
      return;
    }
    const doSearch = async () => {
      setIsSearching(true);
      try {
        const res = await chatApi.searchStickers(debouncedSearch, 30, 1);
        if (res.isSuccess && res.data) {
          searchCacheRef.current[debouncedSearch] = res.data.items;
          setSearchResults(res.data.items);
        }
      } catch (err) {
        console.error('Sticker search failed:', err);
      } finally {
        setIsSearching(false);
      }
    };
    void doSearch();
  }, [debouncedSearch, isSearchMode]);

  const handleSelectPack = useCallback((packName: string) => {
    setIsSearchMode(false);
    setSearchQuery('');
    setActivePackName(packName);
  }, []);

  const handleStickerClick = useCallback((url: string) => {
    onSendSticker(url);
  }, [onSendSticker]);

  const toggleSearch = useCallback(() => {
    setIsSearchMode(prev => !prev);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const currentStickers = activePackName ? stickersByPack[activePackName] || [] : [];

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 mb-2 w-[340px] h-[400px] bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl flex flex-col overflow-hidden z-50 animate-fade-in"
    >
      {/* Header: Search icon + gói sticker tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button
          onClick={toggleSearch}
          className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${isSearchMode ? 'bg-[#8ED8ED]/20 text-[#8ED8ED]' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          title="Tìm kiếm nhãn dán"
        >
          <Search size={18} />
        </button>
        <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {stickerPacks.map((pack) => (
            <button
              key={pack.packageName}
              onClick={() => handleSelectPack(pack.packageName)}
              className={`flex-shrink-0 p-1 rounded-lg transition-all ${
                !isSearchMode && activePackName === pack.packageName
                  ? 'bg-[#8ED8ED]/15 ring-1 ring-[#8ED8ED]/40'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title={pack.packageName}
            >
              <div
                className="w-8 h-8 bg-contain bg-no-repeat bg-center rounded"
                style={{ backgroundImage: `url(${pack.url})` }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Search bar (chỉ hiện khi search mode) */}
      {isSearchMode && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2C2C2C] rounded-lg px-3 py-1.5">
            <Search size={16} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm nhãn dán..."
              className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nội dung: grid stickers */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Loading states */}
        {(isLoadingPacks || isLoadingStickers || isSearching) && (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="animate-spin text-[#8ED8ED]" size={28} />
          </div>
        )}

        {/* Search mode: hiển thị kết quả tìm kiếm */}
        {isSearchMode && !isSearching && debouncedSearch.trim() && (
          <>
            {searchResults.length === 0 ? (
              <p className="text-center text-gray-500 text-sm mt-8">Không tìm thấy nhãn dán nào</p>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {searchResults.map((item, idx) => (
                  <StickerCell key={`${item.packageName}-${idx}`} url={item.url} onClick={handleStickerClick} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Pack mode: hiển thị stickers của gói đang chọn */}
        {!isSearchMode && !isLoadingPacks && !isLoadingStickers && (
          <>
            {currentStickers.length === 0 && !isLoadingStickers ? (
              <p className="text-center text-gray-500 text-sm mt-8">Chọn một gói nhãn dán</p>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {currentStickers.map((url, idx) => (
                  <StickerCell key={`${activePackName}-${idx}`} url={url} onClick={handleStickerClick} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Ô sticker đơn lẻ - sử dụng background-image thay vì <img> */
const StickerCell = memo(function StickerCell({ url, onClick }: { url: string; onClick: (url: string) => void }) {
  return (
    <button
      onClick={() => onClick(url)}
      className="aspect-square rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors p-1 cursor-pointer"
      title="Gửi nhãn dán"
    >
      <div
        className="w-full h-full bg-contain bg-no-repeat bg-center"
        style={{ backgroundImage: `url(${url})` }}
      />
    </button>
  );
});

export default memo(StickerPicker);
