import { useMemo } from 'react';
import type { Attachment } from '../../types/chat';
import { Loader2 } from 'lucide-react';

interface Props {
  attachments: Attachment[];
  isLoading?: boolean;
  progress?: number;
  error?: string;
  onImageClick?: (index: number) => void;
}

/**
 * Layout lưới ảnh tùy theo số lượng (1-10+).
 * | Count | Layout            |
 * | ----- | ----------------- |
 * | 1     | full              |
 * | 2     | 2 cột             |
 * | 3     | hero layout       |
 * | 4     | 2x2               |
 * | 5-9   | compact grid      |
 * | 10+   | compact + overlay |
 */
export default function BubbleLayout({ attachments, isLoading, progress, error, onImageClick }: Props) {
  const count = attachments.length;
  const maxVisible = 9;
  const visibleAttachments = count > maxVisible ? attachments.slice(0, maxVisible) : attachments;
  const overflow = count > maxVisible ? count - maxVisible : 0;

  const gridClass = useMemo(() => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-2 grid-rows-2';
    if (count === 4) return 'grid-cols-2 grid-rows-2';
    // 5-9 & 10+
    return 'grid-cols-3';
  }, [count]);

  const getItemClass = (index: number): string => {
    // Hero layout cho 3 ảnh: ảnh đầu chiếm 2 hàng
    if (count === 3 && index === 0) return 'row-span-2';
    return '';
  };

  const getItemAspect = (index: number): string => {
    if (count === 1) return 'aspect-auto max-h-[400px]';
    if (count === 2) return 'aspect-square';
    if (count === 3 && index === 0) return 'h-full';
    if (count === 3) return 'aspect-square';
    if (count === 4) return 'aspect-square';
    // 5+
    return 'aspect-square';
  };

  return (
    <div className="flex flex-col max-w-xs sm:max-w-sm">
      <div className={`relative grid ${gridClass} gap-1.5 rounded-xl overflow-hidden bg-white/5`}>
        {/* Progress overlay toàn bộ grid */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 rounded-xl">
            <div className="flex flex-col items-center gap-1">
              <Loader2 size={28} className="animate-spin text-white" />
              {typeof progress === 'number' && (
                <span className="text-white text-xs font-medium">{progress}%</span>
              )}
            </div>
          </div>
        )}

        {visibleAttachments.map((att, index) => {
          const src = att.url || att.localObjectUrl;
          const isLastVisible = index === visibleAttachments.length - 1 && overflow > 0;

          return (
            <div
              key={`${att.fileName}-${index}`}
              className={`relative overflow-hidden cursor-pointer group ${getItemClass(index)} ${getItemAspect(index)} ${isLoading ? 'opacity-70' : ''}`}
              onClick={() => onImageClick?.(index)}
            >
              {src ? (
                <img
                  src={src}
                  alt={att.fileName}
                  className="w-full h-full object-cover transition-all duration-200 group-hover:brightness-75"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center transition-all duration-200 group-hover:brightness-75">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              )}

              {/* Overlay +N */}
              {isLastVisible && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-all duration-200 group-hover:brightness-75">
                  <span className="text-white text-2xl font-bold">+{overflow}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <span className="text-xs text-red-500 mt-1">{error}</span>
      )}
    </div>
  );
}
