import { Globe } from 'lucide-react';
import { useLinkPreview } from '../../hooks/useMediaOverlay';
import { getFirstUrl, normalizeUrl, decodeHtmlEntities } from '../../lib/utils';

interface Props {
  content: string;
}

/** Hiển thị 1 hàng link trong tab Liên kết (ảnh preview nhỏ + tiêu đề + tên miền) */
export default function LinkItemRow({ content }: Props) {
  const { preview, isLoading } = useLinkPreview(content);

  const rawUrl = getFirstUrl(content);
  const url = rawUrl ? normalizeUrl(rawUrl) : content;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  const title = decodeHtmlEntities(preview?.title) || hostname;
  const image = preview?.image;
  const siteName = decodeHtmlEntities(preview?.siteName) || hostname;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors"
    >
      {/* Ảnh thu nhỏ */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center">
        {isLoading ? (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
        ) : image ? (
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Globe size={20} className="text-gray-400" />
        )}
      </div>

      {/* Thông tin */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {title}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
          {siteName}
        </p>
      </div>
    </a>
  );
}
