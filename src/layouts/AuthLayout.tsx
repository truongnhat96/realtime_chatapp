import { Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center bg-gray-900">
      {/* Background Image for PC (Desktop) */}
      <img
        src="./src/assets/images/bg1.png"
        alt="Chat Background PC"
        className="absolute inset-0 h-full w-full object-cover hidden md:block"
      />
      {/* Background Image for Mobile */}
      <img
        src="./src/assets/images/bg-mobile.png"
        alt="Chat Background Mobile"
        className="absolute inset-0 h-full w-full object-cover block md:hidden"
      />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/40"></div>

      {/* Main Content Container based on Figma Design */}
      <div className="relative z-10 w-full max-w-6xl px-4 flex flex-col items-center justify-center min-h-screen">
        <div className="w-full max-w-md">
          {/* Logo Section */}
          <div className="mb-12 flex items-center justify-center">
            <img src="./src/assets/icon-app.png" alt="Logo" className="w-20 h-20" />
          </div>

          <div className="relative w-full">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
