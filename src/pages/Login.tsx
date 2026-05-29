import { useAuth as useOidcAuth } from "react-oidc-context";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Button } from "../components/ui/button";
import logo from "../assets/icon-app.png";
import demoImg from "../assets/images/demo.png";

export default function Login() {
  const oidcAuth = useOidcAuth();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  // Nếu đã xác thực → chuyển thẳng đến Chat
  if (hasHydrated && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleStart = () => {
    void oidcAuth.signinRedirect();
  };

  return (
    <div
      className="min-h-screen w-full bg-white text-[#1c1e21] flex flex-col relative overflow-x-hidden"
      style={{ fontFamily: '"Facebook Sans", Helvetica, "Helvetica Neue", Arial, sans-serif' }}
    >
      {/* Top Header Logo */}
      <header className="w-full max-w-[1440px] mx-auto px-6 sm:px-12 py-6 flex items-center z-10">
        <img src={logo} alt="Chat App Logo" className="h-10 w-10 object-contain" />
      </header>

      {/* Main content grid */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 sm:px-12 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 xl:gap-24 pb-16 lg:pb-24 z-10">
        {/* Left Column: Text and CTA */}
        <div className="w-full lg:w-[45%] flex flex-col justify-center text-left space-y-6 lg:space-y-8 animate-fade-in-up">
          <h1 className="text-4xl sm:text-5xl lg:text-[5rem] font-semibold tracking-tight text-[#006AFF] leading-tight lg:leading-[1.05] max-w-2xl">
            Nơi dành cho những cuộc trò chuyện có ý nghĩa
          </h1>
          <p className="text-base sm:text-lg text-[#606770] leading-relaxed max-w-lg font-normal">
            Với Dream Chat, bạn có thể kết nối với bạn bè và gia đình, xây dựng cộng đồng, cũng như tìm hiểu sâu hơn về sở thích của mình.
          </p>
          <div className="pt-2"
            style={{ fontFamily: 'Helvetica Neue,Segoe UI,Helvetica,Arial,Lucida Grande,sans-serif' }}>
            <Button
              type="button"
              onClick={handleStart}
              className="w-fit bg-[#006AFF] hover:bg-[#005cde] text-white normal-case tracking-normal rounded-full px-8 py-3.5 text-base font-semibold transition-all duration-200 border-0 shadow-lg shadow-blue-500/10 active:scale-95 cursor-pointer"
              isLoading={oidcAuth.isLoading}
            >
              Bắt đầu
            </Button>
          </div>
        </div>

        {/* Right Column: Hero Image */}
        <div className="w-full lg:w-[55%] flex items-center justify-center lg:justify-start">
          <div className="relative w-full max-w-[700px] lg:max-w-none xl:max-w-[850px] flex items-center justify-center lg:justify-start">
            <img
              src={demoImg}
              alt="Demo Chat Interface"
              className="w-full h-auto object-contain max-h-[85vh] lg:max-h-[90vh] drop-shadow-[0_20px_50px_rgba(0,0,0,0.06)] transition-all duration-500 hover:scale-[1.01]"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
