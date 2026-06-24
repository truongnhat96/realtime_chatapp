import { memo, useCallback, useEffect, useRef } from 'react';
import { REACTION_EMOJI_MAP } from '../../lib/utils';

interface ReactionPickerProps {
  isOpen: boolean;
  onSelect: (reactionType: number) => void;
  onClose: () => void;
  isMine: boolean;
}

/**
 * Popover hiển thị 6 emoji để chọn reaction.
 * Vị trí: phía trên toolbar, bên trái/phải tùy theo isMine.
 */
const ReactionPicker = memo(function ReactionPicker({
  isOpen,
  onSelect,
  onClose,
  isMine,
}: ReactionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleSelect = useCallback((type: number) => {
    onSelect(type);
    onClose();
  }, [onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-full mb-2 flex items-center gap-1 px-2 py-1.5 bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-gray-700 rounded-full shadow-lg z-50 animate-fade-in ${
        isMine ? 'right-0' : 'left-0'
      }`}
    >
      {Object.entries(REACTION_EMOJI_MAP).map(([type, emoji]) => (
        <button
          key={type}
          onClick={() => handleSelect(Number(type))}
          className="w-8 h-8 flex items-center justify-center text-xl rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-125 transition-all duration-150 cursor-pointer"
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
});

export default ReactionPicker;
