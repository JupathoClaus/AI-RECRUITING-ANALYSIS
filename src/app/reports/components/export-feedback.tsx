"use client"

import { cn } from "@/lib/utils"

export interface ExportFeedbackData {
  text: string
  type: 'success' | 'warning' | 'error'
}

interface ExportFeedbackProps {
  message: ExportFeedbackData | null
  onDismiss: () => void
}

export function ExportFeedback({ message, onDismiss }: ExportFeedbackProps) {
  if (!message) return null
  return (
    <div
      role={message.type === 'success' ? 'status' : 'alert'}
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-2 text-xs",
        message.type === 'success' && "bg-success/5 text-success",
        message.type === 'warning' && "bg-warning/5 text-warning",
        message.type === 'error' && "bg-error/5 text-error"
      )}
    >
      <span>{message.text}</span>
      <button onClick={onDismiss} className="ml-2 shrink-0 hover:opacity-70" aria-label="Dismiss">✕</button>
    </div>
  )
}
