import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Chat from './pages/Chat';
import AuthCallback from './pages/AuthCallback';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { ToastContainer } from './components/ui/toast-container';

// Protected Route wrapper
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  
  // Chờ Zustand hydrate xong từ localStorage trước khi quyết định redirect
  if (!hasHydrated) return null;
  
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

function App() {
  return (
    <ThemeWrapper>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Route>
          
          {/* OAuth Callback */}
          <Route path="/auth-callback" element={<AuthCallback />} />
          
          <Route path="/" element={
            <ProtectedRoute>
            <Chat />
            </ProtectedRoute>
          } />
          
          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeWrapper>
  );
}

export default App;
