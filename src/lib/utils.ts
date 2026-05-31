import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`;
  } catch (error) {
    console.error('Error converting UTC to local time:', error);
    return utcDateTimeStr;
  }
}
