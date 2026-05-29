import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from 'react-oidc-context';
import { UserManager } from 'oidc-client-ts';
import { Loader2, LogOut } from 'lucide-react';
import AuthLayout from './layouts/AuthLayout';
import Login from './pages/Login';
import Chat from './pages/Chat';
import AuthCallback from './pages/AuthCallback';
import JoinGroupCallback from './pages/JoinGroupCallback';
import LogoutCallback from './pages/LogoutCallback';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { ToastContainer } from './components/ui/toast-container';
import { APP_CONFIG } from './lib/constants';

// OIDC Config cho react-oidc-context
const oidcConfig = {
  authority: APP_CONFIG.SSO_BASE_URL,
  client_id: APP_CONFIG.SSO_CLIENT_ID,
  redirect_uri: APP_CONFIG.SSO_REDIRECT_URI,
  response_type: 'code',
  scope: APP_CONFIG.SSO_SCOPE,
  // QUAN TRỌNG: phải tắt vì refresh token nằm ở HttpOnly Cookie do BFF quản lý
  automaticSilentRenew: false,
};

const userManager = new UserManager(oidcConfig);

// Protected Route wrapper
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);

  useEffect(() => {
    if (isSessionExpired) {
      // Clear the session expired flag and redirect to the SSO authorize server login
      useAuthStore.getState().setSessionExpired(false);
      void userManager.signinRedirect();
    }
  }, [isSessionExpired]);

  // Chờ Zustand hydrate xong từ localStorage trước khi quyết định redirect
  if (!hasHydrated) return null;

  // Nếu session đã hết hạn, chặn render và chờ useEffect thực hiện redirect
  if (isSessionExpired) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}


function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const isDark = useThemeStore((state) => state.isDark);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return <>{children}</>;
}

function LogoutLoading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-linear-to-br from-slate-900 via-slate-950 to-zinc-950 text-white z-50 transition-all duration-500">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse duration-4000"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse duration-6000"></div>

      <div className="relative flex flex-col items-center p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] max-w-sm w-full mx-4 text-center animate-in fade-in zoom-in-95 duration-500">
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

function App() {
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);

  return (
    <ThemeWrapper>
      {isLoggingOut ? (
        <LogoutLoading />
      ) : (
        <BrowserRouter>
          <ToastContainer />
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={
                <AuthProvider {...oidcConfig}>
                  <Login />
                </AuthProvider>
              } />
            </Route>

            {/* OAuth Callback */}
            <Route path="/auth-callback" element={<AuthCallback />} />

            {/* Logout Callback — Auth Server redirect về đây sau khi logout xong */}
            <Route path="/logout-callback" element={
              <AuthProvider {...oidcConfig}>
                <LogoutCallback />
              </AuthProvider>
            } />


            {/* Join Group via Link */}
            <Route path="/join/g/:boxChatLink" element={
              <ProtectedRoute>
                <JoinGroupCallback />
              </ProtectedRoute>
            } />

            <Route path="/" element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            } />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      )}
    </ThemeWrapper>
  );
}

export default App;
