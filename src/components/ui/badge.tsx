import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight transition-colors duration-150",
  {
    variants: {
      variant: {
        // Primary teal
        default:   "border-transparent bg-primary-muted text-primary",
        // Neutral secondary
        secondary: "border-transparent bg-surface-elevated text-muted",
        // Success teal-green
        success:   "border-transparent bg-success-muted text-success",
        // Warning amber
        warning:   "border-transparent bg-warning-muted text-warning",
        // Error red
        error:     "border-transparent bg-error-muted text-error",
        // Info blue
        info:      "border-transparent bg-info-muted text-info",
        // Outline neutral
        outline:   "border-border bg-transparent text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
