"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PaginationMeta } from "@/lib/api/types"

interface PaginationProps {
  meta: PaginationMeta
  onPageChange: (page: number) => void
  disabled?: boolean
  itemLabel?: string
}

export function Pagination({ meta, onPageChange, disabled = false, itemLabel = "applications" }: PaginationProps) {
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1
  const end = Math.min(meta.page * meta.limit, meta.total)
  const canGoBack = meta.page > 1
  const canGoForward = meta.page < meta.totalPages

  return (
    <nav className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination">
      <p className="text-xs text-muted">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {meta.total.toLocaleString()} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={disabled || !canGoBack}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="min-w-16 text-center text-xs font-medium text-muted" aria-live="polite">
          {meta.page} / {Math.max(meta.totalPages, 1)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={disabled || !canGoForward}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
