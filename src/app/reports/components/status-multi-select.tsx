"use client"

import * as React from "react"

const STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'ON_HOLD', 'ARCHIVED'] as const

interface StatusMultiSelectProps {
  selected: string[]
  onChange: (v: string[]) => void
}

export function StatusMultiSelect({ selected, onChange }: StatusMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  const popupId = `${id}-status-popup`

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (popupRef.current && !popupRef.current.contains(target) && triggerRef.current && !triggerRef.current.contains(target)) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Handle Escape from anywhere in popup
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={popupId}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-40 items-center justify-between rounded-lg border border-border bg-background px-3 text-xs outline-none hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary"
      >
        <span>{selected.length > 0 ? `${selected.length} selected` : 'Application status'}</span>
      </button>
      {open && (
        <div
          ref={popupRef}
          id={popupId}
          role="group"
          aria-label="Application status"
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-xl p-2 max-h-60 overflow-y-auto"
        >
          {STATUSES.map((status) => (
            <label key={status} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={selected.includes(status)}
                onChange={() => onChange(selected.includes(status) ? selected.filter((s) => s !== status) : [...selected, status])}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              <span>{status}</span>
            </label>
          ))}
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
