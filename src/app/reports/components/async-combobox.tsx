"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { PaginatedOption, FetchOptionPage } from "../hooks/use-paginated-options"
import { usePaginatedOptions } from "../hooks/use-paginated-options"

interface AsyncComboboxProps {
  fetchPage: FetchOptionPage
  value: string
  onChange: (id: string) => void
  label: string
  placeholder: string
}

export function AsyncCombobox({ fetchPage, value, onChange, label, placeholder }: AsyncComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const id = React.useId()
  const listboxId = `${id}-listbox`
  const inputId = `${id}-input`

  const selectedOpt: PaginatedOption | null = value ? { id: value, label: "" } : null
  const hook = usePaginatedOptions(fetchPage, { selectedOption: selectedOpt })

  const selectedLabel = hook.selectedLabel || value

  const openMenu = React.useCallback(() => {
    setOpen(true)
    if (value && hook.options.length > 0) {
      const idx = hook.options.findIndex((o) => o.id === value)
      setActiveIndex(idx >= 0 ? idx : 0)
    } else {
      setActiveIndex(0)
    }
  }, [value, hook.options])

  const closeMenu = React.useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }, [])

  const selectOption = React.useCallback((id: string) => {
    onChange(id)
    closeMenu()
    inputRef.current?.focus()
  }, [onChange, closeMenu])

  // Scroll active into view
  React.useEffect(() => {
    if (open && activeIndex >= 0) {
      const el = document.getElementById(`${id}-option-${activeIndex}`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, open, id])

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!document.getElementById(id)?.contains(target)) closeMenu()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, closeMenu, id])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        openMenu()
        return
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, hook.options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(hook.options.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < hook.options.length) {
          selectOption(hook.options[activeIndex].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        closeMenu()
        break
      case 'Tab':
        closeMenu()
        break
    }
  }

  return (
    <div id={id} className="relative">
      <label htmlFor={inputId} className="text-[10px] font-medium text-muted">{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        placeholder={selectedLabel || placeholder}
        value={hook.query}
        onChange={(e) => { hook.setQuery(e.target.value); if (!open) { setOpen(true); setActiveIndex(0) } }}
        onFocus={() => { if (!open) { setOpen(true); setActiveIndex(0) } }}
        onKeyDown={handleKeyDown}
        className="flex h-9 w-44 items-center rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-xl max-h-60 overflow-y-auto">
          {hook.initialLoading && <div className="p-3 text-xs text-muted text-center" role="status">Loading...</div>}
          {!hook.initialLoading && hook.options.length > 0 && (
            <div id={listboxId} role="listbox" aria-label={label}>
              {hook.options.map((opt, idx) => (
                <div
                  key={opt.id}
                  id={`${id}-option-${idx}`}
                  role="option"
                  aria-selected={opt.id === value}
                  onClick={() => selectOption(opt.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors",
                    activeIndex === idx && "bg-primary-muted",
                    opt.id === value && "font-semibold",
                  )}
                >
                  {opt.id === value ? '✓ ' : ''}{opt.label}
                </div>
              ))}
            </div>
          )}
          {!hook.initialLoading && hook.error && (
            <div className="p-3 text-xs text-error text-center">
              <p>{hook.error}</p>
              <button onClick={hook.retry} className="underline mt-1">Retry</button>
            </div>
          )}
          {!hook.initialLoading && !hook.error && hook.options.length === 0 && (
            <div className="p-3 text-xs text-muted text-center">No results</div>
          )}
          {!hook.initialLoading && hook.hasMore && (
            <button onClick={hook.loadMore} disabled={hook.loadingMore} className="w-full p-2 text-xs text-primary hover:bg-surface-hover">
              {hook.loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
