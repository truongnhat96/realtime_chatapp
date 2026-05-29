import { useState, useMemo } from 'react';
import { X, UserPlus, LogOut, Link2, Copy, Check, Trash2, ChevronDown, Image, FileText, LinkIcon } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import GroupAvatar from './GroupAvatar';
import CreateGroupModal from './CreateGroupModal';
import type { ConversationItem } from '../../types/chat';

interface Props {
  conversation: ConversationItem;
  onClose: () => void;
  onLeaveConversation?: (conversationId: string) => Promise<void>;
}

export default function ChatDetailSidebar({ conversation, onClose, onLeaveConversation }: Props) {
  const currentUserId = useAuthStore(state => state.user?.id);
  const { removeConversation, removeParticipantFromConversation } = useChatStore();

  const [showAddMember, setShowAddMember] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandMembers, setExpandMembers] = useState(true);
  const [isKicking, setIsKicking] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const isGroup = conversation.type === 1;
  const groupInfo = conversation.groupInfo;

  const myRole = useMemo(() => {
    if (!isGroup || !currentUserId) return -1;
    return conversation.participants.find(p => p.id === currentUserId)?.role ?? 0;
  }, [isGroup, currentUserId, conversation.participants]);

  const canKick = myRole >= 1; // Admin(1) hoặc Owner(2)

  const joinLink = useMemo(() => {
    if (!groupInfo?.groupUrl) return '';
    return `${window.location.origin}/join/${groupInfo.groupUrl}`;
  }, [groupInfo?.groupUrl]);

  const handleCopyLink = async () => {
    if (!joinLink) return;
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKickMember = async (userId: string) => {
    if (!currentUserId || isKicking) return;
    setIsKicking(userId);
    try {
      const res = await chatApi.kickOutParticipant(conversation.conversationId, userId, currentUserId);
      if (res.isSuccess) {
        // Lấy tên người bị kick trước khi remove khỏi participants
        const kickedMember = conversation.participants.find(p => p.id === userId);
        const kickedName = kickedMember?.name || 'thành viên';

        removeParticipantFromConversation(conversation.conversationId, userId, res.data.memberCount);

        // Thêm tin nhắn hệ thống tạm thời cho người kick
        const systemMsg = res.messages?.length
          ? res.messages
          : [`Bạn đã xóa ${kickedName} khỏi nhóm`];
        useChatStore.getState().addSystemMessages(conversation.conversationId, systemMsg);
      }
    } catch (err) {
      console.error('Error kicking member:', err);
    } finally {
      setIsKicking(null);
    }
  };

  const handleLeave = async () => {
    if (!currentUserId || isLeaving) return;
    setIsLeaving(true);
    try {
      const res = await chatApi.leaveGroup(conversation.conversationId, currentUserId);
      if (res.isSuccess) {
        removeConversation(conversation.conversationId);
        if (onLeaveConversation) {
          await onLeaveConversation(conversation.conversationId);
        }
        onClose();
      }
    } catch (err) {
      console.error('Error leaving group:', err);
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  const handleMemberAdded = () => {
    setShowAddMember(false);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1E1E1E] border-l border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-bold text-base text-gray-900 dark:text-white">Chi tiết</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar & Name */}
        <div className="flex flex-col items-center py-6 px-4">
          {isGroup ? (
            <GroupAvatar
              groupImage={groupInfo?.groupImage}
              participants={conversation.participants}
              size={80}
              totalMembers={groupInfo?.memberCount}
            />
          ) : (
            <img
              src={conversation.user?.urlAvatar || '/default-avatar.png'}
              alt={conversation.user?.name || ''}
              className="w-20 h-20 rounded-full object-cover bg-gray-200"
            />
          )}
          <h4 className="mt-3 font-bold text-lg text-gray-900 dark:text-white text-center">
            {isGroup ? groupInfo?.name : conversation.user?.name}
          </h4>
          {isGroup && groupInfo && (
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {groupInfo.memberCount} thành viên
            </span>
          )}
        </div>

        {/* Link tham gia nhóm */}
        {isGroup && joinLink && (
          <div className="mx-4 mb-4 p-3 bg-gray-50 dark:bg-[#2C2C2C] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Link2 size={14} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Link tham gia</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-[#8ED8ED] truncate">{joinLink}</span>
              <button
                onClick={() => void handleCopyLink()}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                title="Sao chép"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-500" />}
              </button>
            </div>
          </div>
        )}

        {/* Thành viên (chỉ Group) */}
        {isGroup && (
          <div className="mx-4 mb-4">
            <button
              onClick={() => setExpandMembers(!expandMembers)}
              className="flex items-center justify-between w-full py-2"
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Thành viên ({conversation.participants.length})
              </span>
              <ChevronDown size={16} className={`text-gray-500 transition-transform ${expandMembers ? 'rotate-180' : ''}`} />
            </button>

            {expandMembers && (
              <div className="space-y-1">
                {conversation.participants.map(member => {
                  const isSelf = member.id === currentUserId;
                  const showKickBtn = canKick && !isSelf && member.role === 0;
                  return (
                    <div key={member.id} className="flex items-center gap-2.5 py-2 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors">
                      <img
                        src={member.urlAvatar || '/default-avatar.png'}
                        alt={member.name}
                        className="w-9 h-9 rounded-full object-cover bg-gray-200 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 dark:text-white truncate block">
                          {member.name}{isSelf ? ' (Bạn)' : ''}
                        </span>
                        {member.role === 2 && (
                          <span className="text-[10px] text-[#8ED8ED] font-semibold">Trưởng nhóm</span>
                        )}
                        {member.role === 1 && (
                          <span className="text-[10px] text-orange-400 font-semibold">Quản trị viên</span>
                        )}
                      </div>
                      {showKickBtn && (
                        <button
                          onClick={() => void handleKickMember(member.id)}
                          disabled={isKicking === member.id}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex-shrink-0"
                          title="Xóa khỏi nhóm"
                        >
                          <Trash2 size={14} className={`${isKicking === member.id ? 'text-gray-300' : 'text-red-400 hover:text-red-500'}`} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Nút thêm thành viên */}
                <button
                  onClick={() => setShowAddMember(true)}
                  className="flex items-center gap-2.5 py-2 px-1 w-full rounded-lg hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors text-[#8ED8ED]"
                >
                  <div className="w-9 h-9 rounded-full border-2 border-dashed border-[#8ED8ED] flex items-center justify-center flex-shrink-0">
                    <UserPlus size={16} />
                  </div>
                  <span className="text-sm font-medium">Thêm thành viên</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* File phương tiện */}
        <div className="mx-4 mb-3">
          <div className="flex items-center gap-2 py-2">
            <Image size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">File phương tiện</span>
          </div>
          <p className="text-xs text-gray-400 pl-6">Chưa có file phương tiện</p>
        </div>

        {/* File */}
        <div className="mx-4 mb-3">
          <div className="flex items-center gap-2 py-2">
            <FileText size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">File</span>
          </div>
          <p className="text-xs text-gray-400 pl-6">Chưa có file</p>
        </div>

        {/* Liên kết */}
        <div className="mx-4 mb-3">
          <div className="flex items-center gap-2 py-2">
            <LinkIcon size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Liên kết</span>
          </div>
          <p className="text-xs text-gray-400 pl-6">Chưa có liên kết</p>
        </div>

        {/* Rời nhóm */}
        {isGroup && (
          <div className="mx-4 mt-4 mb-6">
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex items-center gap-2 w-full py-2.5 px-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Rời nhóm</span>
            </button>
          </div>
        )}
      </div>

      {/* Leave Confirm Dialog */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLeaveConfirm(false)}>
          <div
            className="bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h4 className="font-bold text-base text-gray-900 dark:text-white mb-2">Rời khỏi nhóm?</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Bạn sẽ không nhận được tin nhắn từ nhóm này nữa.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => void handleLeave()}
                disabled={isLeaving}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isLeaving ? 'Đang rời...' : 'Rời nhóm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <CreateGroupModal
          onClose={() => setShowAddMember(false)}
          onGroupCreated={handleMemberAdded}
          addToConversationId={conversation.conversationId}
          existingMemberIds={conversation.participants.map(p => p.id)}
        />
      )}
    </div>
  );
}
