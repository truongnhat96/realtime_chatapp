import type { Attachment } from '../../types/chat';
import { RowsPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/rows.css';

interface Props {
  attachments: Attachment[];
  onImageClick?: (index: number) => void;
}

/**
 * Gallery cho danh sách ảnh lớn (>10) sử dụng react-photo-album.
 * Layout dynamic tự co giãn theo kích thước ảnh.
 */
export default function MediaGallery({ attachments, onImageClick }: Props) {
  const photos = attachments.map((att, index) => ({
    src: att.url || att.localObjectUrl || '',
    width: 300, // Placeholder width (ảnh sẽ tự co dãn)
    height: 300, // Placeholder height
    alt: att.fileName,
    key: `${att.fileName}-${index}`,
  }));

  return (
    <div className="w-72 sm:w-80 rounded-xl overflow-hidden group/gallery [&_img]:transition-all [&_img]:duration-200 [&_img]:hover:brightness-75">
      <RowsPhotoAlbum
        photos={photos}
        targetRowHeight={120}
        spacing={2}
        onClick={({ index }) => onImageClick?.(index)}
      />
    </div>
  );
}
