"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'ON_HOLD', 'ARCHIVED'] as const

interface StatusMultiSelectProps {
  selected: string[]
  onChange: (v: string[]) => void
}

export function StatusMultiSelect({ selected, onChange }: StatusMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const toggle = (status: string) => {
    onChange(selected.includes(status) ? selected.filter((s) => s !== status) : [...selected, status])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusIndex((prev) => Math.min(prev + 1, STATUSES.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setFocusIndex(0)
        break
      case 'End':
        e.preventDefault()
        setFocusIndex(STATUSES.length - 1)
        break
      case ' ':
      case 'Enter':
        e.preventDefault()
        if (open) toggle(STATUSES[focusIndex])
        else setOpen(true)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="status-popup"
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className="flex h-9 w-40 items-center justify-between rounded-lg border border-border bg-background px-3 text-xs outline-none hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary"
      >
        <span className="truncate">{selected.length > 0 ? `${selected.length} selected` : 'Application status'}</span>
      </button>
      {open && (
        <div
          id="status-popup"
          role="dialog"
          aria-label="Application status"
          onKeyDown={handleKeyDown}
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-xl p-2 max-h-60 overflow-y-auto"
        >
          {STATUSES.map((status, idx) => {
            const isSelected = selected.includes(status)
            return (
              <label
                key={status}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-hover transition-colors",
                  focusIndex === idx && "bg-primary-muted"
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(status)}
                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span>{status}</span>
              </label>
            )
          })}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mt-2 w-full rounded bg-surface-elevated px-2 py-1 text-[10px] text-muted hover:text-foreground transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  )
}
