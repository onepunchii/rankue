import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { LucideCheckCircle2, LucideAlertCircle, LucideInfo } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex gap-4">
              <div className="mt-0.5 shrink-0">
                {variant === "destructive" && <LucideAlertCircle className="w-5 h-5 text-red-500" />}
                {variant === "success" && <LucideCheckCircle2 className="w-5 h-5 text-[#006241]" />}
                {(!variant || variant === "default") && <LucideInfo className="w-5 h-5 text-[#006241]" />}
              </div>
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
