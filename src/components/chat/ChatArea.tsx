import { useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

interface Props {
  sendMessage: (conversationId: string, content: string, toUserId: string) => Promise<void>;
  isConnected: boolean;
}

export default function ChatArea({ sendMessage, isConnected }: Props) {
  const { conversations, activeConversationId, setActiveConversationId, onlineUsers } = useChatStore();

  const conversation = useMemo(() => {
    return conversations.find(c => c.conversationId === activeConversationId);
  }, [conversations, activeConversationId]);

  if (!conversation || !activeConversationId) return null;

  const user = conversation.user;
  const isOnline = onlineUsers[user.id] ?? user.isOnline;

  const handleSendMessage = (text: string) => {
    // Send via signalR
    sendMessage(activeConversationId, text, user.id);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1E1E1E] transition-colors duration-200">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3.5">
          <button 
            className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full"
            onClick={() => setActiveConversationId(null)}
          >
            <ArrowLeft size={22} />
          </button>
          
          <div className="relative flex-shrink-0">
             <img src={user.urlAvatar || '/default-avatar.png'} alt={user.name} className="w-12 h-12 rounded-full object-cover bg-gray-200" />
             {isOnline && (
               <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-[#1E1E1E] rounded-full transition-colors"></div>
             )}
          </div>
          <div>
            <h3 className="font-bold text-base text-gray-900 dark:text-white leading-tight">{user.name}</h3>
            <span className="text-xs text-[#8ED8ED]">
              {!isConnected ? 'Đang kết nối...' : isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden sm:block">
            <Phone size={22} />
          </button>
          <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden sm:block">
            <Video size={22} />
          </button>
          <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <MoreVertical size={22} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <MessageList conversationId={activeConversationId} />

      {/* Input */}
      <ChatInput onSendMessage={handleSendMessage} disabled={!isConnected} />
    </div>
  );
}
