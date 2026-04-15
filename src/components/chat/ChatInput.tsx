import { useState } from 'react';
import { Send, Smile, Paperclip } from 'lucide-react';

interface Props {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendMessage, disabled }: Props) {
  const [message, setMessage] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-[#1E1E1E] border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2C2C2C] rounded-full p-2 pr-2.5 transition-colors">
        <button className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full transition-colors">
          <Smile size={22} />
        </button>
        <button className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full transition-colors mr-1">
          <Paperclip size={22} />
        </button>
        
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Đang kết nối..." : "Nhập tin nhắn..."}
          className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-[15px] text-gray-900 dark:text-gray-100 placeholder-gray-500"
        />
        
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className={`p-2.5 rounded-full transition-all flex items-center justify-center
            ${message.trim() 
              ? 'bg-[#8ED8ED] text-white hover:bg-[#7bc8dd]' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
            }
          `}
        >
          <Send size={20} className={message.trim() ? "ml-0.5" : ""} />
        </button>
      </div>
    </div>
  );
}
