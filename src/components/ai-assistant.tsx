"use client"

import * as React from "react"
import Link from "next/link"
import { BrainCircuit, CalendarDays, ChartNoAxesCombined, X } from "lucide-react"
import { cn } from "@/lib/utils"

const guides = [
  { href: "/applications", title: "Review applications", description: "Filter, sort, open an application workspace, and queue real bulk screening.", icon: BrainCircuit },
  { href: "/interviews", title: "Schedule interviews", description: "Create and manage recruiter-led interviews using the existing protected workflow.", icon: CalendarDays },
  { href: "/reports", title: "View reports", description: "Use the available reporting controls and exports for your organization.", icon: ChartNoAxesCombined },
]

/**
 * Intentional non-chat placeholder. There is no assistant endpoint in the
 * product today, so this component provides discoverability without creating
 * fabricated responses or implying access to live recruitment data.
 */
export function FloatingAIAssistant() {
  const [open, setOpen] = React.useState(false)
  return <>
    {!open && <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-50 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card transition-transform hover:scale-[1.02]" aria-label="Open TalentAI feature guide"><BrainCircuit className="h-4 w-4" /> Feature guide</button>}
    {open && <section className="fixed bottom-6 right-6 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 shadow-lg" aria-label="TalentAI feature guide"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">TalentAI feature guide</p><p className="mt-1 text-xs text-muted">Preview only — no conversational AI, actions, or live data are available here.</p></div><button onClick={() => setOpen(false)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground" aria-label="Close feature guide"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{guides.map((guide) => { const Icon = guide.icon; return <Link key={guide.href} href={guide.href} onClick={() => setOpen(false)} className={cn("flex gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface-hover")}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><span><span className="block text-sm font-medium text-foreground">{guide.title}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{guide.description}</span></span></Link> })}</div></section>}
  </>
}
