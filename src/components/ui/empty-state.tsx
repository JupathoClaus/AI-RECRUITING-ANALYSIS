import * as React from "react"
import { cn } from "@/lib/utils"
import { DirectboxDefault } from "iconsax-react"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated mb-4">
        {icon || <DirectboxDefault className="h-8 w-8 text-muted" />}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      {action}
    </div>
  )
}
