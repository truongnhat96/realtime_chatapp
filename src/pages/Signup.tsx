import { useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { APP_CONFIG } from "../lib/constants";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { User, Lock, Mail } from "lucide-react";

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Local error state for validation
  const [validationError, setValidationError] = useState<string | null>(null);

  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

  const handlePasswordConfirmChange = (val: string) => {
    setConfirmPassword(val);
    if (password && val !== password) {
      setValidationError("Mật khẩu xác nhận không khớp.");
    } else {
      setValidationError(null);
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (confirmPassword && val !== confirmPassword) {
      setValidationError("Mật khẩu xác nhận không khớp.");
    } else {
      setValidationError(null);
    }
  };

  const handleSignUp = async (e: SubmitEvent) => {
    e.preventDefault();
    if (validationError) return;
    if (password !== confirmPassword) {
      setValidationError("Mật khẩu xác nhận không khớp.");
      return;
    }

    const payload = { fullName, userName, email, password };
    const success = await register(payload);
    if (success) {
      navigate("/login");
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = APP_CONFIG.OAUTH_GOOGLE_URL;
  };

  return (
    <div className="w-full flex-col space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <form onSubmit={handleSignUp} className="space-y-4">
        <Input
          type="text"
          placeholder="Họ và Tên"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          icon={<User className="h-5 w-5" />}
          required
        />

        <Input
          type="text"
          placeholder="Tên đăng nhập"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          icon={<User className="h-5 w-5" />}
          required
        />

        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="h-5 w-5" />}
          required
        />

        <Input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          icon={<Lock className="h-5 w-5" />}
          required
        />

        <div className="flex flex-col">
          <Input
            type="password"
            placeholder="Xác nhận mật khẩu"
            value={confirmPassword}
            onChange={(e) => handlePasswordConfirmChange(e.target.value)}
            icon={<Lock className="h-5 w-5" />}
            required
          />
          {validationError && (
            <span className="text-white bg-red-500 p-3 rounded-md text-sm mt-2 ml-4 animate-in fade-in">
              {validationError}
            </span>
          )}
        </div>

        <div className="pt-3 flex justify-center">
          <Button
            type="submit"
            isLoading={isLoading}
            variant="glass"
            className="w-full !rounded-full"
            disabled={!!validationError}
          >
            Đăng ký
          </Button>
        </div>
      </form>

      <div className="flex flex-col items-center space-y-4 pt-4">
        <span className="text-white/80 text-sm">
          Đã có tài khoản?{" "}
          <Link to="/login" className="text-primary-cyan font-semibold hover:underline">
            Đăng nhập ngay
          </Link>
        </span>

        <span className="text-white/60 text-xs text-center w-full">hoặc</span>

        <button
          onClick={handleGoogleLogin}
          type="button"
          className="flex items-center justify-center space-x-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full py-3 px-6 transition-all duration-300 w-full"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285FA" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="text-sm font-medium">Tiếp tục với Google</span>
        </button>

      </div>
    </div>
  );
}
