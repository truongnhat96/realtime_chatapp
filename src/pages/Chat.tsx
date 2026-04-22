import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import useChatHub from '../hooks/useChatHub';
// We haven't created these yet, assume they exist
import ChatSidebar from '../components/chat/ChatSidebar';
import ChatArea from '../components/chat/ChatArea.tsx';
import ChatLanding from '../components/chat/ChatLanding';

export default function Chat() {
  const { user, hasHydrated } = useAuthStore();
  const { activeConversationId } = useChatStore();

  // Khởi tạo SignalR
  const { isConnected, sendMessage, sendTyping, stopTyping, markAsRead } = useChatHub();

  if (!hasHydrated || !user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#1E1E1E]">
      {/* Sidebar - Cố định độ rộng ở Desktop, ẩn trên Mobile nếu đang có box chat */}
      <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 ${activeConversationId ? 'hidden md:block' : 'block'}`}>
        <ChatSidebar />
      </div>

      {/* Main Area */}
      <div className={`flex-1 flex flex-col ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>
        {activeConversationId ? (
          <ChatArea
            sendMessage={sendMessage}
            sendTyping={sendTyping}
            stopTypingSignal={stopTyping}
            markAsRead={markAsRead}
            isConnected={isConnected}
          />
        ) : (
          <ChatLanding />
        )}
      </div>
    </div>
  );
}
