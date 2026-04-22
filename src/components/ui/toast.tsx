import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useToastStore, type ToastMessage, type ChatToastData } from "../../stores/toastStore";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chatStore";

function useChatSound() {
  const [audioContext] = useState<AudioContext | null>(() => {
    if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      return new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return null;
  });

  const playSound = useCallback(() => {
    if (!audioContext) return;
    
    // Resume context if suspended (common in browsers)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => undefined);
    }

    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch {
      console.warn("Could not play notification sound");
    }
  }, [audioContext]);

  return { playSound };
}

function ChatToastContent({ chatData, onClose }: { chatData: ChatToastData; onClose: () => void }) {
  const { playSound } = useChatSound();
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);

  // Chỉ phát âm thanh 1 lần duy nhất khi mount
  useEffect(() => {
    playSound();
  }, []); // Empty dependency array ensures it only plays on mount

  const handleClick = () => {
    setActiveConversationId(chatData.conversationId);
    onClose();
  };

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return timeStr;
    }
  };

  return (
    <div
      className="relative flex w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-black/5 pointer-events-auto cursor-pointer hover:bg-gray-50 transition-all duration-200"
      onClick={handleClick}
    >
      <div className="w-1.5 flex-shrink-0 bg-[#8ED8ED]" />

      <div className="flex w-full items-center p-4 gap-4">
        <div className="relative flex-shrink-0">
          <img
            src={chatData.userAvatar || "/default-avatar.png"}
            alt={chatData.userName}
            className="w-14 h-14 rounded-full object-cover bg-gray-200 border border-gray-100"
          />
          {chatData.isOnline && (
            <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-0.5">
            <p className="text-[15px] font-bold text-gray-900 truncate pr-2">{chatData.userName}</p>
            <p className="text-xs text-gray-400 flex-shrink-0 font-medium">{formatTime(chatData.time)}</p>
          </div>
          <p className="text-[14px] text-gray-600 truncate leading-relaxed">{chatData.message}</p>
        </div>

        <button
          type="button"
          className="flex-shrink-0 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function Toast({ toast }: { toast: ToastMessage }) {
  const removeToast = useToastStore((state) => state.removeToast);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsClosing(true);
    }, toast.type === "chat" ? 4700 : 3700);
    return () => clearTimeout(timer);
  }, [toast.type]);

  if (toast.type === "chat" && toast.chatData) {
    return (
      <div className={cn(isClosing ? "animate-slide-out-right" : "animate-slide-in-right")}>
        <ChatToastContent chatData={toast.chatData} onClose={handleClose} />
      </div>
    );
  }

  const isSuccess = toast.type === "success";

  return (
    <div
      className={cn(
        "relative flex w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-black/5 pointer-events-auto",
        isClosing ? "animate-slide-out-right" : "animate-slide-in-right"
      )}
    >
      <div className={cn("w-1.5 flex-shrink-0", isSuccess ? "bg-green-500" : "bg-red-500")} />

      <div className="flex w-full items-start p-4">
        <div className="flex-shrink-0 pt-0.5">
          {isSuccess ? (
            <CheckCircle2 className="h-6 w-6 text-green-500" fill="currentColor" stroke="white" />
          ) : (
            <AlertCircle className="h-6 w-6 text-red-500" fill="currentColor" stroke="white" />
          )}
        </div>

        <div className="ml-3 w-0 flex-1">
          <p className="text-base font-bold text-gray-900">
            {toast.title || (isSuccess ? "Thành công!" : "Thất bại!")}
          </p>
          <p className="mt-1 text-sm text-gray-500">{toast.message}</p>
        </div>

        <div className="ml-4 flex flex-shrink-0">
          <button
            type="button"
            className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-900 focus:outline-none"
            onClick={handleClose}
          >
            <span className="sr-only">Close</span>
            <X className="h-5 w-5" aria-hidden="true" strokeWidth={3} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "absolute bottom-0 left-0 h-1 animate-shrink origin-left",
          isSuccess ? "bg-green-500" : "bg-red-500"
        )}
      />
    </div>
  );
}
