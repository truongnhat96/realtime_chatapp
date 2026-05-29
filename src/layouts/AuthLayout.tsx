import { Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
