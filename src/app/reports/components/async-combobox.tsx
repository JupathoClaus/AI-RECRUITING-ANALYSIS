"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { SearchNormal1 } from "iconsax-react"
import { cn } from "@/lib/utils"
import type { PaginatedOptionsState, PaginatedOption, FetchOptionPage } from "../hooks/use-paginated-options"
import { usePaginatedOptions } from "../hooks/use-paginated-options"

interface AsyncComboboxProps {
  fetchPage: FetchOptionPage
  value: string
  onChange: (id: string) => void
  label: string
  placeholder: string
  searchPlaceholder: string
  allLabel: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function AsyncCombobox({ fetchPage, value, onChange, label, placeholder, searchPlaceholder, allLabel }: AsyncComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  const hook = usePaginatedOptions(fetchPage, {
    selectedOption: value ? { id: value, label: "" } : null,
  })

  const allOptions = [
    ...(hook.currentSelectedLabel || value ? [{ id: value || "all", label: hook.currentSelectedLabel || "(selected)" }] : []),
    { id: "all", label: allLabel },
    ...hook.options,
  ]
  // Deduplicate
  const seen = new Set<string>()
  const displayOptions = allOptions.filter((o) => { const k = o.id; if (seen.has(k)) return false; seen.add(k); return true })

  const selectedLabel = displayOptions.find((o) => o.id === value)?.label || placeholder

  const openMenu = React.useCallback(() => {
    setOpen(true)
    setActiveIndex(value ? displayOptions.findIndex((o) => o.id === value) : 0)
  }, [value, displayOptions])

  const closeMenu = React.useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  const selectOption = React.useCallback((id: string) => {
    onChange(id)
    closeMenu()
    inputRef.current?.focus()
  }, [onChange, closeMenu])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        openMenu()
        return
      }
    }
    if (open) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setActiveIndex((prev) => Math.min(prev + 1, displayOptions.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setActiveIndex((prev) => Math.max(prev - 1, 0))
          break
        case "Home":
          e.preventDefault()
          setActiveIndex(0)
          break
        case "End":
          e.preventDefault()
          setActiveIndex(displayOptions.length - 1)
          break
        case "Enter":
          e.preventDefault()
          if (activeIndex >= 0 && activeIndex < displayOptions.length) {
            selectOption(displayOptions[activeIndex].id)
          }
          break
        case "Escape":
          e.preventDefault()
          closeMenu()
          inputRef.current?.focus()
          break
        case "Tab":
          closeMenu()
          break
      }
    }
  }, [open, activeIndex, displayOptions, openMenu, closeMenu, selectOption])

  React.useEffect(() => {
    if (open && activeIndex >= 0) {
      const el = document.getElementById(`${id}-option-${activeIndex}`)
      el?.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex, open, id])

  React.useEffect(() => {
    if (!open) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (!document.getElementById(`${id}-combobox`)?.contains(target)) closeMenu()
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [open, closeMenu, id])

  return (
    <div id={`${id}-combobox`} className="relative">
      <label id={`${id}-label`} className="text-[10px] font-medium text-muted">{label}</label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        placeholder={selectedLabel}
        value={hook.query}
        onChange={(e) => { hook.setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { if (!open) { setOpen(true); setActiveIndex(0) } }}
        onKeyDown={handleKeyDown}
        className="flex h-9 w-44 items-center rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
      {open && (
        <div
          id={`${id}-listbox`}
          ref={listRef}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-xl max-h-60 overflow-y-auto"
        >
          {hook.initialLoading && <div className="p-3 text-xs text-muted text-center">Loading...</div>}
          {hook.error && (
            <div className="p-3 text-xs text-error text-center">
              <p>{hook.error}</p>
              <button onClick={hook.retry} className="underline mt-1">Retry</button>
            </div>
          )}
          {!hook.initialLoading && !hook.error && displayOptions.length === 0 && (
            <div className="p-3 text-xs text-muted text-center">No results</div>
          )}
          {!hook.initialLoading && !hook.error && displayOptions.map((opt, idx) => (
            <div
              key={idx}
              id={`${id}-option-${idx}`}
              role="option"
              aria-selected={opt.id === value}
              onClick={() => selectOption(opt.id)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors",
                activeIndex === idx && "bg-primary-muted",
                opt.id === value && "font-semibold"
              )}
            >
              {opt.id === value ? "✓ " : ""}{opt.label}
            </div>
          ))}
          {hook.hasMore && (
            <button onClick={hook.loadMore} disabled={hook.loadingMore} className="w-full p-2 text-xs text-primary hover:bg-surface-hover transition-colors">
              {hook.loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
