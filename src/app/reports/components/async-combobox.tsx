"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { PaginatedOption, FetchOptionPage } from "../hooks/use-paginated-options"
import { usePaginatedOptions } from "../hooks/use-paginated-options"

function safeId(id: string): string { return id.replace(/[^a-zA-Z0-9_-]/g, '_') }

interface AsyncComboboxProps {
  fetchPage: FetchOptionPage
  selectedOption: PaginatedOption | null
  onChange: (opt: PaginatedOption | null) => void
  label: string
  placeholder: string
}

export function AsyncCombobox({ fetchPage, selectedOption, onChange, label, placeholder }: AsyncComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [activeOptionId, setActiveOptionId] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const id = React.useId()
  const listboxId = `${id}-listbox`
  const inputId = `${id}-input`

  const hook = usePaginatedOptions(fetchPage, { selectedOption })

  // Derive active option ID from options
  const activeOption = activeOptionId ? hook.options.find((o) => o.id === activeOptionId) ?? null : null

  // Reset active option when results change
  React.useEffect(() => {
    if (!open) return
    if (activeOptionId && hook.options.some((o) => o.id === activeOptionId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedOption && hook.options.some((o) => o.id === selectedOption.id)) { setActiveOptionId(selectedOption.id) }
    else if (hook.options.length > 0) { setActiveOptionId(hook.options[0].id) }
    else { setActiveOptionId(null) }
  }, [hook.options, open, selectedOption, activeOptionId])

  const openMenu = React.useCallback(() => {
    setOpen(true)
    if (selectedOption && hook.options.some((o) => o.id === selectedOption.id)) {
      setActiveOptionId(selectedOption.id)
    } else if (hook.options.length > 0) {
      setActiveOptionId(hook.options[0].id)
    }
  }, [selectedOption, hook.options])

  const closeForEscape = React.useCallback(() => {
    setOpen(false)
    setActiveOptionId(null)
    inputRef.current?.focus()
  }, [])

  const closeForTab = React.useCallback(() => {
    setOpen(false)
    setActiveOptionId(null)
  }, [])

  const closeForOutside = React.useCallback(() => {
    setOpen(false)
    setActiveOptionId(null)
  }, [])

  const commitOption = React.useCallback((opt: PaginatedOption) => {
    onChange(opt)
    setOpen(false)
    setActiveOptionId(null)
    inputRef.current?.focus()
  }, [onChange])

  // Scroll active into view
  React.useEffect(() => {
    if (open && activeOptionId) {
      const el = document.getElementById(`${listboxId}-opt-${safeId(activeOptionId)}`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeOptionId, open, listboxId])

  // Outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!document.getElementById(id)?.contains(target)) closeForOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, closeForOutside, id])

  const moveOption = (direction: 1 | -1) => {
    const idx = hook.options.findIndex((o: PaginatedOption) => o.id === activeOptionId)
    const next = Math.min(Math.max(idx + direction, 0), hook.options.length - 1)
    setActiveOptionId(hook.options[next]?.id ?? null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(); return }
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveOption(1); break
      case 'ArrowUp': e.preventDefault(); moveOption(-1); break
      case 'Home': e.preventDefault(); setActiveOptionId(hook.options[0]?.id ?? null); break
      case 'End': e.preventDefault(); setActiveOptionId(hook.options[hook.options.length - 1]?.id ?? null); break
      case 'Enter': e.preventDefault(); if (activeOption) commitOption(activeOption); break
      case 'Escape': e.preventDefault(); closeForEscape(); break
      case 'Tab': closeForTab(); break
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
        aria-activedescendant={open && activeOption ? `${listboxId}-opt-${safeId(activeOption.id)}` : undefined}
        placeholder={selectedOption?.label || placeholder}
        value={hook.query}
        onChange={(e) => { hook.setQuery(e.target.value); if (!open) openMenu() }}
        onFocus={() => { if (!open) openMenu() }}
        onKeyDown={handleKeyDown}
        className="flex h-9 w-44 items-center rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-xl max-h-60 overflow-y-auto">
          {hook.initialLoading && <div className="p-3 text-xs text-muted text-center" role="status">Loading...</div>}
          {!hook.initialLoading && hook.options.length > 0 && (
            <div id={listboxId} role="listbox" aria-label={label}>
              {hook.options.map((opt) => (
                <div
                  key={opt.id}
                  id={`${listboxId}-opt-${safeId(opt.id)}`}
                  role="option"
                  aria-selected={selectedOption?.id === opt.id}
                  onClick={() => commitOption(opt)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors",
                    activeOption?.id === opt.id && "bg-primary-muted",
                    selectedOption?.id === opt.id && "font-semibold",
                  )}
                >
                  {selectedOption?.id === opt.id ? '✓ ' : ''}{opt.label}
                </div>
              ))}
            </div>
          )}
          {!hook.initialLoading && !hook.error && hook.options.length === 0 && (
            <div className="p-3 text-xs text-muted text-center">No results</div>
          )}
          {!hook.initialLoading && hook.error && (
            <div className="p-3 text-xs text-error text-center">
              <p>{hook.error}</p>
              <button onClick={hook.retry} className="underline mt-1">Retry</button>
            </div>
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
