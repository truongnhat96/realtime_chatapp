import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AuthCallback() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    console.log("AuthCallback", search);
    const searchParams = new URLSearchParams(search);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    // Lấy code_verifier từ sessionStorage (react-oidc-context lưu khi signinRedirect)
    let codeVerifier = '';

    // Ưu tiên tìm đúng key bằng state (oidc-client-ts dùng oidc.<state> làm key)
    if (state) {
      const stateKey = `oidc.${state}`;
      try {
        const storedSession = JSON.parse(sessionStorage.getItem(stateKey) || 'null');
        if (storedSession && storedSession.code_verifier) {
          codeVerifier = storedSession.code_verifier;
        } else {
          const storedLocal = JSON.parse(localStorage.getItem(stateKey) || 'null');
          if (storedLocal && storedLocal.code_verifier) {
            codeVerifier = storedLocal.code_verifier;
          }
        }
      } catch {
        // Fallback
      }
    }

    // Nếu không tìm thấy, fallback: tìm PKCE code_verifier bất kỳ trong sessionStorage và localStorage
    if (!codeVerifier) {
      const storages = [sessionStorage, localStorage];
      for (const storage of storages) {
        if (codeVerifier) break;
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith('oidc.')) {
            try {
              const stored = JSON.parse(storage.getItem(key) || '{}');
              if (stored.code_verifier) {
                codeVerifier = stored.code_verifier;
                break;
              }
            } catch {
              // Bỏ qua
            }
          }
        }
      }
    }

    const processCallback = async () => {
      if (code && codeVerifier) {
        const success = await handleOAuthCallback(code, codeVerifier);
        if (success) {
          navigate("/", { replace: true });
        } else {
          navigate("/login", { replace: true });
        }
      } else {
        console.error("Missing code or code_verifier for token exchange", {
          hasCode: !!code,
          hasCodeVerifier: !!codeVerifier,
          state,
        });
        navigate("/login", { replace: true });
      }
    };

    processCallback();
  }, [search, navigate, handleOAuthCallback]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-[#121212]">
      <div className="flex flex-col items-center space-y-4">
        {/* Simple Loading Spinner */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary-cyan"></div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Đang hoàn tất đăng nhập...</p>
      </div>
    </div>
  );
}
