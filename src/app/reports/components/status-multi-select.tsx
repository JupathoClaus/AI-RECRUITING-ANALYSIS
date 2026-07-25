"use client"

import * as React from "react"

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', SCREENING: 'Screening',
  SHORTLISTED: 'Shortlisted', ASSESSMENT: 'Assessment', INTERVIEW: 'Interview',
  OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn',
  DISQUALIFIED: 'Disqualified', ON_HOLD: 'On hold', ARCHIVED: 'Archived',
}
const STATUSES = Object.keys(STATUS_LABELS)

interface StatusMultiSelectProps {
  selected: string[]
  onChange: (v: string[]) => void
}

export function StatusMultiSelect({ selected, onChange }: StatusMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const id = React.useId()

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (popupRef.current && !popupRef.current.contains(t) && triggerRef.current && !triggerRef.current.contains(t)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Escape handler
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus() }
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
        aria-controls={`${id}-popup`}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-40 items-center justify-between rounded-lg border border-border bg-background px-3 text-xs outline-none hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary"
      >
        <span>{selected.length > 0 ? `${selected.length} selected` : 'Application status'}</span>
      </button>
      {open && (
        <div
          ref={popupRef}
          id={`${id}-popup`}
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
              <span>{STATUS_LABELS[status] || status}</span>
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
