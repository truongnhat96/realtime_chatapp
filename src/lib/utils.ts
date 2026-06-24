import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Mapping reaction type enum → Unicode emoji */
export const REACTION_EMOJI_MAP: Record<number, string> = {
  0: '👍', // Like
  1: '❤️', // Love
  2: '😂', // Haha
  3: '😮', // Wow
  4: '😢', // Sad
  5: '😡', // Angry
};

export function getReactionEmoji(reactionType: number): string {
  return REACTION_EMOJI_MAP[reactionType] ?? '👍';
}

/**
 * Chuyển đổi chuỗi thời gian UTC từ server (hoặc ISO string) về múi giờ Việt Nam (UTC+7)
 * Dưới dạng chuỗi ISO địa phương "YYYY-MM-DDTHH:mm:ss.sss" để khi tạo đối tượng Date mới,
 * JS sẽ hiểu và hiển thị đúng giờ Việt Nam.
 */
export function convertUtcToLocal(utcDateTimeStr: string | null | undefined): string {
  if (!utcDateTimeStr) return '';

  let normalizedStr = utcDateTimeStr.trim();
  if (normalizedStr.startsWith('0001-01-01') || !normalizedStr) {
    return utcDateTimeStr || '';
  }

  // Đảm bảo JS parser hiểu đây là thời gian UTC bằng cách thêm 'Z'
  // nếu chuỗi chưa có ký tự chỉ định múi giờ (Z, +xx:xx, -xx:xx)
  if (
    !normalizedStr.endsWith('Z') &&
    !/[+-]\d{2}:\d{2}$/.test(normalizedStr) &&
    !/[+-]\d{4}$/.test(normalizedStr)
  ) {
    normalizedStr += 'Z';
  }

  try {
    const date = new Date(normalizedStr);
    if (isNaN(date.getTime())) {
      return utcDateTimeStr;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    if (hour === '24') hour = '00';
    const minute = getPart('minute');
    const second = getPart('second');

    // Lấy phần milliseconds từ chuỗi gốc nếu có
    const msMatch = normalizedStr.match(/\.(\d+)/);
    const ms = msMatch ? msMatch[1].slice(0, 3).padEnd(3, '0') : '000';

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}+07:00`;
  } catch (error) {
    console.error('Error converting UTC to local time:', error);
    return utcDateTimeStr;
  }
}

/** Regex kiểm tra chuỗi có phải URL hợp lệ (http/https hoặc domain trực tiếp) */
const URL_PATTERN = /^(https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}[^\s]*|[a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\.[a-z]{2,})?(?:\/[^\s]*)?)$/i;

/**
 * Trích xuất URL đầu tiên từ văn bản người dùng nhập.
 * Split theo khoảng trắng rồi kiểm tra từng từ.
 */
export function getFirstUrl(text: string): string | null {
  if (!text) return null;
  const words = text.trim().split(/\s+/);
  for (const word of words) {
    if (URL_PATTERN.test(word)) {
      return word;
    }
  }
  return null;
}

/**
 * Chuẩn hóa URL: thêm https:// nếu chưa có scheme.
 */
export function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export interface TextToken {
  text: string;
  isUrl: boolean;
  href: string;
}

/**
 * Tách văn bản thành các từ và khoảng trắng để giữ nguyên format, kiểm tra và đánh dấu URL.
 */
export function tokenizeText(text: string): TextToken[] {
  if (!text) return [];
  const parts = text.split(/(\s+)/);
  return parts.map((part) => {
    if (!part || /^\s+$/.test(part)) {
      return { text: part, isUrl: false, href: '' };
    }
    const isUrl = URL_PATTERN.test(part);
    return {
      text: part,
      isUrl,
      href: isUrl ? normalizeUrl(part) : ''
    };
  });
}

/**
 * Giải mã các ký tự HTML entities (ví dụ: &amp; &#x1f480; ...) về dạng ký tự thường.
 */
export function decodeHtmlEntities(str: string | null | undefined): string {
  if (!str) return '';
  if (typeof document === 'undefined') return str;
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Format tin nhắn hệ thống dựa trên loại hành động (enum) và ID người thực hiện/bị ảnh hưởng.
 * Tự động chuyển đổi người dùng hiện tại thành "Bạn" / "bạn" và áp dụng các mẫu tiếng Việt chuẩn.
 */
export function formatSystemMessage(
  type: number,
  actionUserId: string,
  targetUserId: string | null | undefined,
  currentUserId: string | undefined,
  resolveName: (id: string, isCapital?: boolean) => string,
  groupName?: string,
  content?: string
): string {
  const isEmptyGuid = (id: string | null | undefined) => {
    return !id || id === '00000000-0000-0000-0000-000000000000';
  };

  if (isEmptyGuid(actionUserId)) {
    return '';
  }

  const actionName = actionUserId.toLowerCase() === currentUserId?.toLowerCase()
    ? 'Bạn'
    : resolveName(actionUserId, true);

  const targetName = targetUserId && targetUserId.toLowerCase() === currentUserId?.toLowerCase()
    ? 'bạn'
    : targetUserId ? resolveName(targetUserId, false) : '';

  const displayGroupName = groupName ? `nhóm "${groupName}"` : 'nhóm';

  console.log('status', content)
  switch (type) {
    case 0: // CreateGroup
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? `Bạn đã tạo ${displayGroupName}.`
        : `${actionName} đã tạo ${displayGroupName}.`;

    case 1: // ParticipantJoin
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? 'Bạn đã tham gia nhóm qua liên kết.'
        : `${actionName} đã tham gia nhóm qua liên kết.`;

    case 2: // ParticipantLeave
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? 'Bạn đã rời khỏi nhóm.'
        : `${actionName} đã rời khỏi nhóm.`;

    case 3: // ChangeRoleAfterOwnerLeave
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? 'Bạn đã trở thành trưởng nhóm mới.'
        : `${actionName} đã trở thành trưởng nhóm mới.`;

    case 4: // KickMember
      if (actionUserId.toLowerCase() === currentUserId?.toLowerCase()) {
        return `Bạn đã xóa ${targetName} khỏi nhóm.`;
      }
      if (targetUserId?.toLowerCase() === currentUserId?.toLowerCase()) {
        return `${actionName} đã xóa bạn khỏi nhóm.`;
      }
      return `${actionName} đã xóa ${targetName} khỏi nhóm.`;

    case 5: // AddMember
      if (actionUserId.toLowerCase() === currentUserId?.toLowerCase()) {
        return `Bạn đã thêm ${targetName} vào nhóm.`;
      }
      if (targetUserId?.toLowerCase() === currentUserId?.toLowerCase()) {
        return `${actionName} đã thêm bạn vào nhóm.`;
      }
      return `${actionName} đã thêm ${targetName} vào nhóm.`;

    case 6: // AllowJoinByLink
      const isLinkOn = content === 'True' || content === 'true';
      if (isLinkOn) {
        return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
          ? 'Bạn đã bật liên kết mời tham gia nhóm. Bất kỳ ai có liên kết này đều có thể tham gia.'
          : `${actionName} đã bật liên kết mời tham gia nhóm. Bất kỳ ai có liên kết này đều có thể tham gia.`;
      } else if (content === 'False' || content === 'false') {
        return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
          ? 'Bạn đã tắt liên kết mời tham gia nhóm.'
          : `${actionName} đã tắt liên kết mời tham gia nhóm.`;
      }
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? 'Bạn đã thay đổi cài đặt liên kết mời tham gia nhóm.'
        : `${actionName} đã thay đổi cài đặt liên kết mời tham gia nhóm.`;

    case 7: // AllowAddMember
      const isAddOn = content === 'True' || content === 'true';
      if (isAddOn) {
        return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
          ? 'Bạn đã bật cho phép thêm thành viên vào nhóm.'
          : `${actionName} đã bật cho phép thêm thành viên vào nhóm.`;
      } else if (content === 'False' || content === 'false') {
        return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
          ? 'Bạn đã tắt cho phép thêm thành viên vào nhóm. Chỉ trưởng nhóm hoặc phó nhóm mới được thêm thành viên.'
          : `${actionName} đã tắt cho phép thêm thành viên vào nhóm. Chỉ trưởng nhóm hoặc phó nhóm mới được thêm thành viên.`;
      }
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? 'Bạn đã thay đổi quyền thêm thành viên vào nhóm.'
        : `${actionName} đã thay đổi quyền thêm thành viên vào nhóm.`;

    case 8: // UpdateGroupImage
      return actionUserId.toLowerCase() === currentUserId?.toLowerCase()
        ? 'Bạn đã cập nhật ảnh nhóm.'
        : `${actionName} đã cập nhật ảnh nhóm.`;

    default:
      return '';
  }
}
