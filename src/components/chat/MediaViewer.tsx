import { useMemo } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import VideoPlugin from 'yet-another-react-lightbox/plugins/video';
import ZoomPlugin from 'yet-another-react-lightbox/plugins/zoom';
import CounterPlugin from 'yet-another-react-lightbox/plugins/counter';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import type { MessageItem } from '../../types/chat';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Index hiện tại trong danh sách slides */
  startIndex: number;
  /** Tất cả messages trong conversation để lọc media */
  messages: MessageItem[];
}

/**
 * Fullscreen Media Viewer.
 * - Sử dụng yet-another-react-lightbox
 * - Hỗ trợ ảnh và video
 * - Nút X (góc trên phải), Prev/Next
 * - Video player với play/pause, seekbar
 */
export default function MediaViewer({ isOpen, onClose, startIndex, messages }: Props) {
  // Trích xuất tất cả media slides từ messages
  const slides = useMemo(() => {
    const result: import('yet-another-react-lightbox').Slide[] = [];

    for (const msg of messages) {
      if (msg.messageType === 1) {
        // Image message - có thể có nhiều attachments
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const src = att.url || att.localObjectUrl;
            if (src) {
              result.push({
                type: 'image',
                src,
                alt: att.fileName,
              });
            }
          }
        } else if (msg.url || msg.localObjectUrl) {
          result.push({
            type: 'image',
            src: msg.url || msg.localObjectUrl || '',
            alt: msg.fileName,
          });
        }
      } else if (msg.messageType === 2) {
        // Video message
        const src = msg.url || msg.localObjectUrl || (msg.attachments?.[0]?.url) || (msg.attachments?.[0]?.localObjectUrl);
        if (src) {
          result.push({
            type: 'video',
            sources: [{ src, type: 'video/mp4' }],
            width: 1280,
            height: 720,
          });
        }
      }
    }

    return result;
  }, [messages]);

  if (!isOpen || slides.length === 0) return null;

  // Clamp index
  const safeIndex = Math.min(Math.max(0, startIndex), slides.length - 1);

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      index={safeIndex}
      slides={slides}
      plugins={[VideoPlugin, ZoomPlugin, CounterPlugin]}
      counter={{ container: { style: { top: 'unset', bottom: 0 } } }}
      styles={{
        container: { backgroundColor: 'rgba(0, 0, 0, 0.92)' },
      }}
      video={{
        autoPlay: true,
        controls: true,
      }}
      animation={{ fade: 300 }}
      carousel={{ finite: false }}
    />
  );
}
