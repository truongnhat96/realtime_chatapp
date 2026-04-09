import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useToastStore, type ToastMessage } from "../../stores/toastStore";
import { cn } from "../../lib/utils";

export function Toast({ toast }: { toast: ToastMessage }) {
  const removeToast = useToastStore((state) => state.removeToast);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    // Wait for the slide-out animation to finish (0.3s) before strictly removing from store
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  };

  useEffect(() => {
    // When the component mounts, set a timer to trigger the slide-out animation
    // slightly before the store automatically unmounts it (which takes 4s).
    const timer = setTimeout(() => {
      setIsClosing(true);
    }, 3700);
    return () => clearTimeout(timer);
  }, []);

  const isSuccess = toast.type === "success";

  return (
    <div
      className={cn(
        "relative flex w-full max-w-sm overflow-hidden rounded-md bg-white shadow-xl ring-1 ring-black/5 pointer-events-auto",
        isClosing ? "animate-slide-out-right" : "animate-slide-in-right"
      )}
    >
      {/* Left indicator strip */}
      <div className={cn("w-1 flex-shrink-0", isSuccess ? "bg-green-500" : "bg-red-500")} />

      <div className="flex w-full items-start p-4">
        {/* Icon */}
        <div className="flex-shrink-0 pt-0.5">
          {isSuccess ? (
            <CheckCircle2 className="h-6 w-6 text-green-500" fill="currentColor" stroke="white" />
          ) : (
            <AlertCircle className="h-6 w-6 text-red-500" fill="currentColor" stroke="white" />
          )}
        </div>

        {/* Content */}
        <div className="ml-3 w-0 flex-1">
          <p className="text-base font-bold text-gray-900">
            {toast.title || (isSuccess ? "Thành công!" : "Thất bại!")}
          </p>
          <p className="mt-1 text-sm text-gray-500">{toast.message}</p>
        </div>

        {/* Close Button */}
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

      {/* Progress Bar */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 h-1 animate-shrink origin-left",
          isSuccess ? "bg-green-500" : "bg-red-500"
        )}
      />
    </div>
  );
}
