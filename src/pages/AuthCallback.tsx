import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AuthCallback() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // Parse hash parameters, e.g., #access_token=eyJ...&Id=123
    const hashParams = new URLSearchParams(hash.substring(1));
    const token = hashParams.get("access_token");
    const id = hashParams.get("Id") || hashParams.get("id");
    const sessionId = hashParams.get("sessionId") || '';

    const processOAuth = async () => {
      console.log(token, id, sessionId);
      if (token && id) {
        const success = await handleOAuthCallback(token, id, sessionId);
        console.log(success);
        if (success) {
          navigate("/", { replace: true });
        } else {
          // If fetching user profile failed or token is invalid
          navigate("/login", { replace: true });
        }
      } else {
        // Missing token or ID => redirect to login
        navigate("/login", { replace: true });
      }
    };

    processOAuth();
  }, [hash, navigate, handleOAuthCallback]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center space-y-4">
        {/* Simple Loading Spinner */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary-cyan"></div>
        <p className="text-gray-500 font-medium">Đang đăng nhập...</p>
      </div>
    </div>
  );
}
