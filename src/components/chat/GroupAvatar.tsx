import { useAuthStore } from '../../stores/authStore';
import type { ParticipantInfo } from '../../types/chat';

interface Props {
  groupImage: string | null | undefined;
  participants: ParticipantInfo[];
  size?: number;
  className?: string;
  /** Tổng số thành viên thực tế (từ groupInfo.memberCount), dùng để hiện "+N" */
  totalMembers?: number;
}

export default function GroupAvatar({ groupImage, participants, size = 56, className = '', totalMembers }: Props) {
  const currentUserId = useAuthStore(state => state.user?.id);

  // Nếu có ảnh nhóm thì hiện ảnh nhóm
  if (groupImage) {
    return (
      <img
        src={groupImage}
        alt="Group"
        className={`rounded-full object-cover bg-gray-200 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Lọc bỏ chính mình, lấy avatar các thành viên khác
  const othersAvatars = participants
    .filter(p => p.id !== currentUserId)
    .map(p => ({ id: p.id, src: p.urlAvatar || '/default-avatar.png', name: p.name }));

  const displayCount = Math.min(othersAvatars.length, 3); // Tối đa ghép 3 avatar
  const displayAvatars = othersAvatars.slice(0, displayCount);

  // Số thành viên thực tế (trừ chính mình), dùng cho "+N"
  const actualOtherCount = totalMembers ? totalMembers - 1 : othersAvatars.length;
  const remaining = actualOtherCount - displayCount; // Số người chưa được hiện avatar

  // Trường hợp đặc biệt: chỉ có 1 người khác (hoặc không có ai)
  if (displayCount <= 1) {
    const src = displayAvatars[0]?.src || '/default-avatar.png';
    return (
      <img
        src={src}
        alt="Group"
        className={`rounded-full object-cover bg-gray-200 flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // 2 người: chia đôi ngang
  if (displayCount === 2 && remaining <= 0) {
    const half = size / 2;
    return (
      <div
        className={`rounded-full overflow-hidden bg-gray-300 dark:bg-gray-700 flex-shrink-0 flex ${className}`}
        style={{ width: size, height: size }}
      >
        {displayAvatars.map((a, i) => (
          <img
            key={a.id || i}
            src={a.src}
            alt={a.name}
            className="h-full object-cover"
            style={{ width: half }}
          />
        ))}
      </div>
    );
  }

  // 3 người (không có "+N"): 1 bên trái chiếm nửa, 2 bên phải xếp dọc
  if (displayCount === 3 && remaining <= 0) {
    const half = size / 2;
    return (
      <div
        className={`rounded-full overflow-hidden bg-gray-300 dark:bg-gray-700 flex-shrink-0 flex ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={displayAvatars[0].src}
          alt={displayAvatars[0].name}
          className="h-full object-cover"
          style={{ width: half }}
        />
        <div className="flex flex-col" style={{ width: half }}>
          {displayAvatars.slice(1).map((a, i) => (
            <img
              key={a.id || i}
              src={a.src}
              alt={a.name}
              className="w-full object-cover"
              style={{ height: half }}
            />
          ))}
        </div>
      </div>
    );
  }

  // 3 avatar + "+N" (>= 4 người khác): grid 2x2, ô cuối hiện "+N"
  const gridAvatars = othersAvatars.slice(0, 3);
  const half = size / 2;

  return (
    <div
      className={`rounded-full overflow-hidden bg-gray-300 dark:bg-gray-700 flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
        {gridAvatars.map((a, i) => (
          <img
            key={a.id || i}
            src={a.src}
            alt={a.name}
            className="object-cover"
            style={{ width: half, height: half }}
          />
        ))}
        <div
          className="flex items-center justify-center bg-gray-200 dark:bg-gray-600"
          style={{ width: half, height: half }}
        >
          <span className="text-gray-600 dark:text-gray-300 font-bold" style={{ fontSize: size * 0.18 }}>
            +{remaining}
          </span>
        </div>
      </div>
    </div>
  );
}
