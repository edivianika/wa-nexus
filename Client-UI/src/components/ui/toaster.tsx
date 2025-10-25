import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { X } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
              <ToastClose>
                <span className="sr-only">Close</span>
                <span className="inline-flex items-center justify-center bg-muted border border-border rounded-full p-1 ml-2 hover:bg-destructive hover:text-destructive-foreground transition-colors" style={{ minWidth: 32, minHeight: 32 }}>
                  <X className="h-5 w-5" />
                </span>
              </ToastClose>
            </div>
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
