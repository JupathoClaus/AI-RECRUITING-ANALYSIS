"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ProgressIndicatorProps {
  current: number
  total: number
  className?: string
}

export function ProgressIndicator({ current, total, className }: ProgressIndicatorProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          Question {current} of {total}
        </span>
        <span className="text-xs font-medium text-primary">{Math.round(percentage)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}
