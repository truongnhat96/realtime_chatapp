import { useEffect, useRef } from "react";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { Loader2, LogOut } from "lucide-react";

/**
 * Trang callback sau khi Auth Server xử lý logout xong.
 * Nhiệm vụ duy nhất: tự động gọi signinRedirect() để chuyển hướng
 * user đến trang login của Authorization Server.
 *
 * Hiển thị giao diện loading liền mạch để user không thấy vỡ UI.
 */
export default function LogoutCallback() {
  const oidcAuth = useOidcAuth();
  const redirected = useRef(false);

  useEffect(() => {
    // Trường hợp 1: Được gọi từ popup, thông báo cho tab chính rồi tự đóng popup
    if (window.opener) {
      window.opener.postMessage({ type: 'LOGOUT_COMPLETE' }, window.location.origin);
      window.close();
      return;
    }

    // Trường hợp 2: Được gọi từ iframe ẩn hoạt động off-screen, gửi tin nhắn thông báo cho cửa sổ cha
    if (window.parent && window.parent !== window.self) {
      window.parent.postMessage({ type: 'LOGOUT_COMPLETE' }, window.location.origin);
      return;
    }

    // Trường hợp 3: Chờ OIDC context sẵn sàng, chỉ redirect 1 lần duy nhất (nếu chạy trực tiếp ở top-level)
    if (!oidcAuth.isLoading && !redirected.current) {
      redirected.current = true;
      void oidcAuth.signinRedirect();
    }
  }, [oidcAuth]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-linear-to-br from-slate-900 via-slate-950 to-zinc-950 text-white z-50">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse duration-4000"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse duration-6000"></div>

      <div className="relative flex flex-col items-center p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] max-w-sm w-full mx-4 text-center">
        {/* Glow ring */}
        <div className="absolute -inset-px bg-linear-to-r from-cyan-500/30 to-purple-500/30 rounded-3xl blur-md opacity-75"></div>

        <div className="relative flex flex-col items-center space-y-6">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <LogOut className="w-9 h-9 animate-bounce duration-1000" />
            <Loader2 className="absolute inset-0 w-20 h-20 text-cyan-400 animate-spin opacity-60" style={{ animationDuration: '3s' }} />
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight text-transparent bg-linear-to-r from-white via-white to-white/70 bg-clip-text">
              Đang đăng xuất
            </h2>
            <p className="text-sm text-white/60 leading-relaxed max-w-[260px]">
              Vui lòng đợi trong giây lát khi chúng tôi thiết lập lại phiên làm việc của bạn...
            </p>
          </div>

          {/* Progress bar effect */}
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 w-full bg-linear-to-r from-cyan-500 to-purple-500 rounded-full animate-infinite-loading"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
