"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface DeviceStatusCardProps {
  icon: React.ReactNode
  label: string
  status: "checking" | "ready" | "error" | "warning"
  detail?: string
  className?: string
}

const statusConfig = {
  checking: { color: "bg-warning", ring: "ring-warning/30", text: "Checking...", textColor: "text-warning" },
  ready: { color: "bg-success", ring: "ring-success/30", text: "Ready", textColor: "text-success" },
  error: { color: "bg-error", ring: "ring-error/30", text: "Not Available", textColor: "text-error" },
  warning: { color: "bg-warning", ring: "ring-warning/30", text: "Warning", textColor: "text-warning" },
}

export function DeviceStatusCard({ icon, label, status, detail, className }: DeviceStatusCardProps) {
  const config = statusConfig[status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl bg-surface p-5 transition-all duration-200",
        status === "ready" && "ring-1 ring-success/20",
        status === "error" && "ring-1 ring-error/20",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
          status === "ready" && "bg-success/10",
          status === "error" && "bg-error/10",
          status === "warning" && "bg-warning/10",
          status === "checking" && "bg-surface-elevated"
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{label}</h3>
            <div className="flex items-center gap-1.5">
              <motion.div
                className={cn("h-2 w-2 rounded-full", config.color)}
                animate={status === "checking" ? { opacity: [0.4, 1, 0.4] } : {}}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className={cn("text-xs font-medium", config.textColor)}>{config.text}</span>
            </div>
          </div>
          {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
        </div>
      </div>
    </motion.div>
  )
}
