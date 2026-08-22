"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface InterviewShellProps {
  children: React.ReactNode
  step?: number
  stepCount?: number
  stepLabels?: string[]
  maxWidth?: string
  footerNote?: string
}

export function InterviewBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", compact ? "gap-2" : "")}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border/60",
          compact ? "h-8 w-8" : "h-10 w-10 sm:h-11 sm:w-11",
        )}
      >
        <img
          src="/ai-recruiter-logo.png"
          alt="AI Recruiter"
          className={cn("object-contain", compact ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10")}
        />
      </div>
      <div className="leading-tight">
        <p
          className={cn(
            "font-bold tracking-tight text-foreground",
            compact ? "text-sm" : "text-base sm:text-lg",
          )}
        >
          AI <span className="text-primary">Recruiter</span>
        </p>
        {!compact && (
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            AI Interview
          </p>
        )}
      </div>
    </div>
  )
}

export function InterviewShell({
  children,
  step,
  stepCount,
  stepLabels,
  maxWidth = "max-w-lg",
  footerNote,
}: InterviewShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent"
      />
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <InterviewBrand />
        {step && stepCount ? (
          <nav aria-label="Interview progress" className="hidden sm:flex items-center gap-1.5">
            {Array.from({ length: stepCount }, (_, i) => {
              const n = i + 1
              const active = n === step
              const done = n < step
              return (
                <div key={n} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <div
                      aria-hidden
                      className={cn("h-px w-6", done || active ? "bg-primary/50" : "bg-border")}
                    />
                  )}
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                      done && "bg-primary text-white",
                      active && "bg-primary/15 text-primary ring-1 ring-primary/40",
                      !done && !active && "bg-surface text-muted ring-1 ring-border",
                    )}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? "✓" : n}
                  </div>
                  {stepLabels?.[i] && (
                    <span
                      className={cn(
                        "text-xs font-medium",
                        active ? "text-foreground" : "text-muted",
                      )}
                    >
                      {stepLabels[i]}
                    </span>
                  )}
                </div>
              )
            })}
          </nav>
        ) : (
          <span className="text-xs font-medium text-muted hidden sm:inline">
            Powered by AI Recruiter
          </span>
        )}
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 pt-2 sm:px-6">
        <div className={cn("w-full", maxWidth)}>{children}</div>
      </main>

      <footer className="relative z-10 px-6 pb-6 text-center">
        <p className="text-[11px] text-muted">
          {footerNote ?? "AI Recruiter · Interviews are reviewed by the recruitment team."}
        </p>
      </footer>
    </div>
  )
}