import { MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function ChatLanding() {
  const { user } = useAuthStore();
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#121212] transition-colors p-8 text-center">
      <div className="w-24 h-24 bg-[#8ED8ED]/20 text-[#8ED8ED] rounded-full flex items-center justify-center mb-6">
        <MessageCircle size={48} />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Chào mừng trở lại, {user?.name || user?.userName}!
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md">
        Khám phá và kết nối với bạn bè. Chọn một cuộc trò chuyện từ danh sách hoặc tìm kiếm người dùng mới để bắt đầu nhắn tin.
      </p>
    </div>
  );
}
