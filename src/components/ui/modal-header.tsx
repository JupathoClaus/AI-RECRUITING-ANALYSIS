"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import * as DialogPrimitive from "@radix-ui/react-dialog"

interface ModalHeaderProps {
  children: React.ReactNode
  className?: string
  showClose?: boolean
}

function ModalHeader({ children, className, showClose = true }: ModalHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 flex-1 pr-4">
        {children}
      </div>
      {showClose && (
        <DialogPrimitive.Close className="shrink-0 rounded-lg p-1.5 opacity-70 ring-offset-background transition-all duration-150 hover:opacity-100 hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-hover data-[state=open]:text-muted">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}
ModalHeader.displayName = "ModalHeader"

export { ModalHeader }
