import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { Loader2 } from 'lucide-react';

export default function JoinGroupCallback() {
  const { boxChatLink } = useParams<{ boxChatLink: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore(state => state.user?.id);
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  const openConversation = useChatStore(state => state.openConversation);
  const processed = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasHydrated) return;
    if (!currentUserId) {
      navigate('/login', { replace: true });
      return;
    }
    if (processed.current) return;
    processed.current = true;

    const joinGroup = async () => {
      if (!boxChatLink) {
        setError('Link không hợp lệ');
        return;
      }

      const fullLink = `g/${boxChatLink}`;

      try {
        // conversationId sẽ được server tự tìm qua boxChatLink
        const res = await chatApi.joinGroupByLink('', currentUserId, fullLink);
        if (res.isSuccess && res.data) {
          const { conversationId } = res.data;

          if (res.data.joinedMember) {
            // Đã join thành công, mở conversation
            openConversation(conversationId);
          } else {
            // Đã là thành viên rồi, chỉ cần redirect
            openConversation(conversationId);
          }

          navigate('/', { replace: true });
        } else {
          setError('Không thể tham gia nhóm. Link có thể đã hết hạn.');
        }
      } catch (err) {
        console.error('Error joining group:', err);
        setError('Đã xảy ra lỗi khi tham gia nhóm.');
      }
    };

    void joinGroup();
  }, [hasHydrated, currentUserId, boxChatLink, navigate, openConversation]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-[#121212]">
        <div className="flex flex-col items-center space-y-4 max-w-sm mx-4 text-center">
          <p className="text-red-500 font-medium">{error}</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-6 py-2 bg-[#8ED8ED] text-white rounded-xl font-medium hover:bg-[#7bc8dd] transition-colors"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-[#121212]">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#8ED8ED]" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Đang tham gia nhóm...</p>
      </div>
    </div>
  );
}
