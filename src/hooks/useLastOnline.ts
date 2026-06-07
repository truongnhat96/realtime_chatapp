import { useState, useEffect, useRef } from 'react';

/**
 * Tính chuỗi hiển thị thời gian hoạt động cuối cùng và khoảng delay tới lần cập nhật tiếp theo.
 * Trả về [label, nextDelayMs].
 *   - nextDelayMs = 0 nghĩa là không cần cập nhật nữa (> 30 ngày).
 */
function computeLastOnlineLabel(lastOnlineStr: string): [string, number] {
  const lastOnlineMs = new Date(lastOnlineStr).getTime();
  if (isNaN(lastOnlineMs)) return ['Ngoại tuyến', 0];

  const diffMs = Date.now() - lastOnlineMs;
  if (diffMs < 0) return ['Vừa hoạt động', 60_000];

  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;

  if (diffMs < MINUTE) {
    return ['Vừa hoạt động', MINUTE - diffMs];
  }

  if (diffMs < HOUR) {
    const minutes = Math.floor(diffMs / MINUTE);
    return [`Hoạt động ${minutes} phút trước`, MINUTE];
  }

  if (diffMs < DAY) {
    const hours = Math.floor(diffMs / HOUR);
    return [`Hoạt động ${hours} giờ trước`, HOUR];
  }

  if (diffMs < WEEK) {
    const days = Math.floor(diffMs / DAY);
    return [`Hoạt động ${days} ngày trước`, DAY];
  }

  if (diffMs < MONTH) {
    const weeks = Math.floor(diffMs / WEEK);
    return [`Hoạt động ${weeks} tuần trước`, WEEK];
  }

  // > 30 ngày → dừng interval
  return ['Ngoại tuyến', 0];
}

/**
 * Hook tính toán và cập nhật realtime chuỗi "Hoạt động ... trước".
 *
 * @param lastOnline - chuỗi thời gian local (đã convert từ UTC) lần hoạt động cuối.
 * @param isOnline   - trạng thái online hiện tại.
 * @returns chuỗi hiển thị trạng thái (VD: "Đang hoạt động", "Hoạt động 5 phút trước", "Ngoại tuyến").
 */
export function useLastOnline(
  lastOnline: string | null | undefined,
  isOnline: boolean
): string {
  const [label, setLabel] = useState<string>(() => {
    if (isOnline) return 'Đang hoạt động';
    if (!lastOnline) return 'Ngoại tuyến';
    return computeLastOnlineLabel(lastOnline)[0];
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cleanup previous timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isOnline) {
      setLabel('Đang hoạt động');
      return;
    }

    if (!lastOnline) {
      setLabel('Ngoại tuyến');
      return;
    }

    // Cập nhật label ngay lập tức
    const [initialLabel, initialDelay] = computeLastOnlineLabel(lastOnline);
    setLabel(initialLabel);

    if (initialDelay === 0) return; // > 30 ngày, không cần timer

    // setTimeout đệ quy để cập nhật tần suất khác nhau
    const tick = () => {
      const [newLabel, nextDelay] = computeLastOnlineLabel(lastOnline);
      setLabel(newLabel);

      if (nextDelay > 0) {
        timerRef.current = setTimeout(tick, nextDelay);
      } else {
        timerRef.current = null;
      }
    };

    timerRef.current = setTimeout(tick, initialDelay);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOnline, lastOnline]);

  return label;
}
