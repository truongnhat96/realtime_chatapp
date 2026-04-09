import * as React from "react"
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "../../lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", icon, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === "password"
    const inputType = isPassword ? (showPassword ? "text" : "password") : type

    return (
      <div className="relative flex w-full items-center">
        {icon && (
          <div className="absolute left-4 text-gray-500">
            {icon}
          </div>
        )}
        <input
          type={inputType}
          className={cn(
            "flex h-14 w-full rounded-full bg-gray-input px-6 py-3 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-cyan disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
            icon && "pl-12",
            isPassword && "pr-12",
            className
          )}
          ref={ref}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-cyan rounded-full p-1"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
