import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, FileText, Download, Loader2 } from 'lucide-react';
import type { Attachment } from '../../types/chat';
import MessageAttachments from './MessageAttachments';

interface Props {
  messageType: number; // 1=Image, 2=Video, 3=File
  url?: string;
  localObjectUrl?: string;
  fileName?: string;
  fileSize?: number;
  attachments?: Attachment[];
  isLoading?: boolean;
  progress?: number;
  error?: string;
  isMine: boolean;
  onImageClick?: (index: number) => void;
  formattedTime?: string;
}

/** Format file size cho hiển thị */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function MediaMessageBubble({
  messageType, url, localObjectUrl, fileName, fileSize,
  attachments, isLoading, error, isMine, onImageClick,
  formattedTime
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const mediaSrc = url || localObjectUrl || attachments?.[0]?.url;
  const displayFileName = fileName || attachments?.[0]?.fileName;
  const displayFileSize = fileSize ?? attachments?.[0]?.fileSize;

  const toggleVideoPlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Tự động tạm dừng video khi trượt khỏi tầm nhìn (IntersectionObserver)
  useEffect(() => {
    if (messageType !== 2 || !videoRef.current) return;
    const videoEl = videoRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          if (videoEl && !videoEl.paused) {
            videoEl.pause();
            setIsPlaying(false);
          }
        }
      },
      { threshold: 0 }
    );

    observer.observe(videoEl);
    return () => {
      observer.disconnect();
    };
  }, [messageType]);

  // Lắng nghe sự kiện để tạm dừng video khi mở MediaViewer fullscreen
  useEffect(() => {
    const handlePause = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener('pause-inline-videos', handlePause);
    return () => {
      window.removeEventListener('pause-inline-videos', handlePause);
    };
  }, []);

  // Progress overlay cho tất cả media types
  const renderProgressOverlay = () => {
    if (!isLoading) return null;
    return (
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl z-10">
        <Loader2 size={28} className="animate-spin text-white" />
      </div>
    );
  };

  // === Render Image (multi-file aware) ===
  if (messageType === 1) {
    // Nếu có attachments array → dùng MessageAttachments (grid layout)
    if (attachments && attachments.length > 0) {
      return (
        <div className="flex flex-col">
          <MessageAttachments
            attachments={attachments}
            isLoading={isLoading}
            progress={undefined}
            error={error}
            onImageClick={onImageClick}
          />
          {formattedTime && (
            <div className="text-[10px] text-gray-400 select-none mt-1 text-left pl-1">
              {formattedTime}
            </div>
          )}
        </div>
      );
    }

    // Fallback: single image (backward compat)
    return (
      <div className="flex flex-col">
        <div
          className="relative inline-block rounded-xl overflow-hidden max-w-xs cursor-pointer"
          onClick={() => onImageClick?.(0)}
        >
          {renderProgressOverlay()}
          {mediaSrc ? (
            <img
              src={mediaSrc}
              alt={displayFileName || 'Hình ảnh'}
              className={`max-w-xs rounded-xl block transition-all duration-200 hover:brightness-85 ${isLoading ? 'opacity-60' : ''}`}
              style={{ maxHeight: 400 }}
              loading="lazy"
            />
          ) : (
            <div className="w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          )}
        </div>
        {formattedTime && (
          <div className="text-[10px] text-gray-400 select-none mt-1 text-left pl-1">
            {formattedTime}
          </div>
        )}
        {error && (
          <span className="text-xs text-red-500 mt-1">{error}</span>
        )}
      </div>
    );
  }

  // === Render Video ===
  if (messageType === 2) {
    return (
      <div className="flex flex-col">
        <div
          className="relative inline-block rounded-xl overflow-hidden max-w-xs cursor-pointer"
          onClick={() => onImageClick?.(0)}
        >
          {renderProgressOverlay()}
          {mediaSrc ? (
            <>
              <video
                ref={videoRef}
                src={mediaSrc}
                className={`max-w-xs rounded-xl block ${isLoading ? 'opacity-60' : ''}`}
                style={{ maxHeight: 400 }}
                playsInline
                onEnded={() => setIsPlaying(false)}
              />
              {/* Play/Pause overlay */}
              {!isLoading && (
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
                >
                  <div
                    className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm cursor-pointer hover:scale-105 transition-transform"
                    onClick={(e) => { e.stopPropagation(); toggleVideoPlay(); }}
                  >
                    {isPlaying ? (
                      <Pause size={28} className="text-white" />
                    ) : (
                      <Play size={28} className="text-white ml-1" />
                    )}
                  </div>
                </div>
              )}
              {/* Duration badge */}
              {videoRef.current && !isNaN(videoRef.current.duration) && !isLoading && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded">
                  {formatDuration(videoRef.current.duration)}
                </div>
              )}
            </>
          ) : (
            <div className="w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          )}
        </div>
        {formattedTime && (
          <div className="text-[10px] text-gray-400 select-none mt-1 text-left pl-1">
            {formattedTime}
          </div>
        )}
        {error && (
          <span className="text-xs text-red-500 mt-1">{error}</span>
        )}
      </div>
    );
  }

  // === Render File ===
  return (
    <div className="flex flex-col">
      <div className={`relative flex items-center gap-3 p-3 rounded-xl min-w-[200px] max-w-xs ${isMine
          ? 'bg-[#7bc8dd]'
          : 'bg-gray-100 dark:bg-[#3a3a3a]'
        }`}>
        {isLoading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-xl z-10">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-[#6ab8cc]' : 'bg-gray-200 dark:bg-gray-600'
          }`}>
          <FileText size={20} className={isMine ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium break-all ${isMine ? 'text-gray-900' : 'text-gray-800 dark:text-gray-200'
            }`}>
            {displayFileName || 'File'}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {typeof displayFileSize === 'number' && (
              <span className={`text-[11px] ${isMine ? 'text-gray-700' : 'text-gray-500 dark:text-gray-400'}`}>
                {formatFileSize(displayFileSize)}
              </span>
            )}
            {formattedTime && (
              <span className={`text-[11px] select-none ${isMine ? 'text-gray-700/80' : 'text-gray-500/80 dark:text-gray-400/80'}`}>
                {typeof displayFileSize === 'number' ? `• ${formattedTime}` : formattedTime}
              </span>
            )}
          </div>
        </div>
        {!isLoading && mediaSrc && (
          <a
            href={mediaSrc}
            download={displayFileName}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${isMine
                ? 'hover:bg-[#6ab8cc] text-gray-800'
                : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400'
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={16} />
          </a>
        )}
      </div>
      {error && (
        <span className="text-xs text-red-500 mt-1">{error}</span>
      )}
    </div>
  );
}

/** Format seconds thành mm:ss */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
