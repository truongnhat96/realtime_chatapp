import { useState, useMemo, useRef } from 'react';
import { X, UserPlus, LogOut, Link2, Copy, Check, Trash2, ChevronDown, Image, FileText, LinkIcon, ChevronRight, Loader2, ImageIcon, Bell, BellOff } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { chatApi } from '../../lib/api';
import GroupAvatar from './GroupAvatar';
import CreateGroupModal from './CreateGroupModal';
import MediaOverlaySidebar from './MediaOverlaySidebar';
import type { ConversationItem } from '../../types/chat';
import type { OverlayTab } from '../../hooks/useMediaOverlay';

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
  const [expandMembers, setExpandMembers] = useState(false);
  const [expandSettings, setExpandSettings] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isKicking, setIsKicking] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [overlayTab, setOverlayTab] = useState<OverlayTab | null>(null);
  const [expandCustomize, setExpandCustomize] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleMute = async () => {
    if (isTogglingMute) return;
    setIsTogglingMute(true);
    const newMuteState = !conversation.isMuted;
    try {
      const res = await chatApi.toggleMuteConversation(conversation.conversationId, newMuteState);
      if (res.isSuccess) {
        useChatStore.getState().toggleMuteConversation(conversation.conversationId, newMuteState);
      }
    } catch (err) {
      console.error('Failed to toggle mute status:', err);
    } finally {
      setIsTogglingMute(false);
    }
  };

  const handleToggleAllowJoinByLink = async (checked: boolean) => {
    if (isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    try {
      const res = await chatApi.updateAllowJoinByLink(conversation.conversationId, checked);
      if (res.isSuccess) {
        useChatStore.getState().updateGroupSettings(conversation.conversationId, {
          allowJoinByLink: checked,
          groupUrl: res.data.groupUrl || null
        });
        if (res.data.systemMessages?.length) {
          useChatStore.getState().addSystemMessages(conversation.conversationId, res.data.systemMessages, checked ? 'true' : 'false');
        }
      }
    } catch (err) {
      console.error('Failed to update allow join by link status:', err);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleToggleAllowMembersAdd = async (checked: boolean) => {
    if (isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    try {
      const res = await chatApi.updateAllowMembersAdd(conversation.conversationId, checked);
      if (res.isSuccess) {
        useChatStore.getState().updateGroupSettings(conversation.conversationId, {
          allowMembersAdd: checked
        });
        if (res.data.systemMessages?.length) {
          useChatStore.getState().addSystemMessages(conversation.conversationId, res.data.systemMessages, checked ? 'true' : 'false');
        }
      }
    } catch (err) {
      console.error('Failed to update allow members add status:', err);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleDeleteChat = async () => {
    if (currentUserId) {
      try {
        await chatApi.markConversationAsDeletedLocally(conversation.conversationId, currentUserId);
      } catch (error) {
        console.error('Failed to mark conversation as deleted locally:', error);
      }
    }
    removeConversation(conversation.conversationId);
    useChatStore.getState().setActiveConversationId(null);
    onClose();
  };

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

  const showAddMemberBtn = useMemo(() => {
    return (groupInfo?.allowMembersAdd ?? true) || myRole >= 1;
  }, [groupInfo?.allowMembersAdd, myRole]);

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
        removeParticipantFromConversation(conversation.conversationId, userId, res.data.memberCount);

        // Thêm tin nhắn hệ thống cho người kick
        if (res.data.systemMessages?.length) {
          useChatStore.getState().addSystemMessages(conversation.conversationId, res.data.systemMessages);
        } else {
          useChatStore.getState().addSystemMessages(conversation.conversationId, [
            {
              type: 4, // KickMember
              actionUserId: currentUserId,
              targetUserId: userId,
            }
          ]);
        }
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
    <div className="relative flex flex-col h-full bg-white dark:bg-[#1E1E1E] border-l border-gray-200 dark:border-gray-800">
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
          {isGroup && groupInfo && !conversation.isRemovedFromGroup && (
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {groupInfo.memberCount} thành viên
            </span>
          )}
          {!conversation.isRemovedFromGroup && (
            <div className="mt-4 flex flex-col items-center">
              <button
                onClick={handleToggleMute}
                disabled={isTogglingMute}
                className="flex flex-col items-center group cursor-pointer border-none bg-transparent outline-none focus:outline-none"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200
                    ${conversation.isMuted
                      ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-[#2C2C2C] dark:hover:bg-[#3C3C3C] text-gray-700 dark:text-gray-300'
                    }
                  `}
                >
                  {conversation.isMuted ? (
                    <BellOff size={18} className="stroke-[2.25]" />
                  ) : (
                    <Bell size={18} className="stroke-[2.25]" />
                  )}
                </div>
                <span
                  className={`text-[12px] mt-1.5 font-medium tracking-tight text-center leading-tight transition-colors duration-200
                    ${conversation.isMuted
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-gray-700 dark:text-gray-300'
                    }
                  `}
                >
                  {conversation.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
                </span>
              </button>
            </div>
          )}
          {conversation.isRemovedFromGroup && (
            <button
              onClick={handleDeleteChat}
              className="mt-4 flex items-center gap-2 py-2 px-4 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 border border-red-200/50 dark:border-red-900/30 transition-colors text-sm font-medium shadow-sm animate-fade-in"
            >
              <Trash2 size={16} />
              <span>Xóa cuộc trò chuyện</span>
            </button>
          )}
        </div>

        {!conversation.isRemovedFromGroup && (
          <>
            {/* Link tham gia nhóm */}
            {isGroup && groupInfo?.allowJoinByLink && joinLink && (
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

            {/* Tùy chỉnh đoạn chat (chỉ Group, tất cả thành viên) */}
            {isGroup && (
              <div className="mx-4 mb-4">
                <button
                  onClick={() => setExpandCustomize(!expandCustomize)}
                  className="flex items-center justify-between w-full py-2"
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Tùy chỉnh đoạn chat
                  </span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${expandCustomize ? 'rotate-180' : ''}`} />
                </button>

                {expandCustomize && (
                  <div className="py-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 1024 * 1024) {
                          alert('Kích thước ảnh không được vượt quá 1MB.');
                          e.target.value = '';
                          return;
                        }
                        setIsUploadingImage(true);
                        void (async () => {
                          try {
                            const res = await chatApi.updateGroupImage(
                              conversation.conversationId,
                              file,
                              groupInfo?.groupImage
                            );
                            if (res.isSuccess && res.data) {
                              useChatStore.getState().updateGroupSettings(conversation.conversationId, {
                                groupImage: res.data.imageUrl,
                              });
                              if (res.data.systemMessages?.length) {
                                useChatStore.getState().addSystemMessages(
                                  conversation.conversationId,
                                  res.data.systemMessages
                                );
                              }
                            }
                          } catch (err) {
                            console.error('Failed to update group image:', err);
                          } finally {
                            setIsUploadingImage(false);
                            e.target.value = '';
                          }
                        })();
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="flex items-center gap-2.5 w-full py-2 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    >
                      {isUploadingImage ? (
                        <Loader2 size={16} className="animate-spin text-[#8ED8ED]" />
                      ) : (
                        <ImageIcon size={16} className="text-gray-500" />
                      )}
                      <span>{isUploadingImage ? 'Đang tải lên...' : 'Thay đổi ảnh'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tùy chọn nhóm (chỉ Group & dành cho Admin/Owner) */}
            {isGroup && myRole >= 1 && (
              <div className="mx-4 mb-4">
                <button
                  onClick={() => setExpandSettings(!expandSettings)}
                  className="flex items-center justify-between w-full py-2"
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Tùy chọn nhóm
                  </span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${expandSettings ? 'rotate-180' : ''}`} />
                </button>

                {expandSettings && (
                  <div className="space-y-4 py-2 select-none">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Cho phép tham gia qua link nhóm
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupInfo?.allowJoinByLink ?? false}
                          onChange={(e) => void handleToggleAllowJoinByLink(e.target.checked)}
                          disabled={myRole < 1 || isUpdatingSettings}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8ED8ED] peer-disabled:opacity-50"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Cho phép thành viên thêm người
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupInfo?.allowMembersAdd ?? true}
                          onChange={(e) => void handleToggleAllowMembersAdd(e.target.checked)}
                          disabled={myRole < 1 || isUpdatingSettings}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8ED8ED] peer-disabled:opacity-50"></div>
                      </label>
                    </div>
                  </div>
                )}
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
                    Thành viên trong đoạn chat
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
                     {showAddMemberBtn && (
                       <button
                         onClick={() => setShowAddMember(true)}
                         className="flex items-center gap-2.5 py-2 px-1 w-full rounded-lg hover:bg-gray-50 dark:hover:bg-[#2C2C2C] transition-colors text-[#8ED8ED]"
                       >
                         <div className="w-9 h-9 rounded-full border-2 border-dashed border-[#8ED8ED] flex items-center justify-center flex-shrink-0">
                           <UserPlus size={16} />
                         </div>
                         <span className="text-sm font-medium">Thêm thành viên</span>
                       </button>
                     )}
                  </div>
                )}
              </div>
            )}

            {/* File phương tiện */}
            <button
              onClick={() => setOverlayTab('media')}
              className="mx-4 mb-3 w-[calc(100%-2rem)] text-left"
            >
              <div className="flex items-center gap-2 py-2">
                <Image size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">File phương tiện</span>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </button>

            {/* File */}
            <button
              onClick={() => setOverlayTab('file')}
              className="mx-4 mb-3 w-[calc(100%-2rem)] text-left"
            >
              <div className="flex items-center gap-2 py-2">
                <FileText size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">File</span>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </button>

            {/* Liên kết */}
            <button
              onClick={() => setOverlayTab('link')}
              className="mx-4 mb-3 w-[calc(100%-2rem)] text-left"
            >
              <div className="flex items-center gap-2 py-2">
                <LinkIcon size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">Liên kết</span>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </button>

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
          </>
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

      {/* Media / File / Link Overlay */}
      {overlayTab && (
        <MediaOverlaySidebar
          conversationId={conversation.conversationId}
          initialTab={overlayTab}
          onClose={() => setOverlayTab(null)}
        />
      )}
    </div>
  );
}
