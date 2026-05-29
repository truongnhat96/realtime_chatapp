import type { Attachment } from '../../types/chat';
import BubbleLayout from './BubbleLayout';
import MediaGallery from './MediaGallery';
import { Loader2 } from 'lucide-react';

interface Props {
  attachments: Attachment[];
  isLoading?: boolean;
  progress?: number;
  error?: string;
  onImageClick?: (index: number) => void;
}

/**
 * Wrapper phân nhánh:
 * - <= 10 ảnh → BubbleLayout (tự custom CSS Grid)
 * - > 10 ảnh → MediaGallery (react-photo-album)
 */
export default function MessageAttachments({ attachments, isLoading, progress, error, onImageClick }: Props) {
  if (attachments.length === 1) {
    return (
      <BubbleLayout
        attachments={attachments}
        isLoading={isLoading}
        progress={progress}
        error={error}
        onImageClick={onImageClick}
      />
    );
  }

  return (
    <div className="flex flex-col relative rounded-xl overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-1">
            <Loader2 size={28} className="animate-spin text-white" />
            {typeof progress === 'number' && (
              <span className="text-white text-xs font-medium">{progress}%</span>
            )}
          </div>
        </div>
      )}
      <MediaGallery
        attachments={attachments}
        onImageClick={onImageClick}
      />
      {error && (
        <span className="text-xs text-red-500 mt-1">{error}</span>
      )}
    </div>
  );
}
