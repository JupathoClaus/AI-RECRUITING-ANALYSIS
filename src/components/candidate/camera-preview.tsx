"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface CameraPreviewProps {
  className?: string
  label?: string
}

export function CameraPreview({ className, label = "Camera Preview" }: CameraPreviewProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-surface-elevated aspect-video", className)}>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface border border-border">
          <svg className="h-6 w-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <p className="text-xs text-muted">{label}</p>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <span className="text-[10px] font-medium text-success">Live</span>
      </div>
    </div>
  )
}
