"use client"

import * as React from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import {
  Briefcase,
  Calendar,
  Chart,
  Setting2,
  MessageQuestion,
  DocumentText,
  People,
  Routing2,
  Video,
  MagicStar,
  ArrowRight,
} from "iconsax-react"

interface HelpTopic {
  icon: React.ComponentType<{ size?: number; variant?: "Linear" | "Bold"; className?: string }>
  title: string
  description: string
  href: string
  cta: string
}

const TOPICS: HelpTopic[] = [
  {
    icon: Briefcase,
    title: "Working with jobs",
    description: "Create a position, publish it, and reopen a filled or closed job from its workspace.",
    href: "/jobs",
    cta: "Open Jobs",
  },
  {
    icon: DocumentText,
    title: "Reviewing applications",
    description: "Filter, search and sort every application. Run AI screening on a selection and watch the batch progress.",
    href: "/applications",
    cta: "Open Applications",
  },
  {
    icon: People,
    title: "Managing candidates",
    description: "Add a candidate in one step, open their profile, compare up to four side by side, and keep notes and decisions.",
    href: "/candidates",
    cta: "Open Candidates",
  },
  {
    icon: Routing2,
    title: "Using the pipeline",
    description: "Move candidates between stages on a visual board — or edit the stages your team actually uses.",
    href: "/pipeline",
    cta: "Open Pipeline",
  },
  {
    icon: Calendar,
    title: "Scheduling interviews",
    description: "Book, reschedule and record recruiter-led interviews. Human results are kept separate from AI assessments.",
    href: "/interviews",
    cta: "Open Interviews",
  },
  {
    icon: Video,
    title: "AI Interviews",
    description: "Create an AI interview, send the candidate their access link, and review the transcript and recording afterwards.",
    href: "/ai-interviews",
    cta: "Open AI Interviews",
  },
  {
    icon: MagicStar,
    title: "AI Screening explained",
    description: "AI screening reads the resume and scores qualifications 0–100 against the job. It supports, never replaces, human judgement.",
    href: "/ai-screener",
    cta: "Open AI Screener",
  },
  {
    icon: Chart,
    title: "Reports & analytics",
    description: "Recruitment reports you can export, company-wide pipeline analytics, and per-job analytics inside each job workspace.",
    href: "/reports",
    cta: "Open Reports",
  },
  {
    icon: Setting2,
    title: "Account & settings",
    description: "Profile details, company information, notification preferences and AI settings all live in one place.",
    href: "/settings",
    cta: "Open Settings",
  },
]

export default function HelpPage() {
  return (
    <AppLayout
      title="Help & Support"
      description="Guides for the most common tasks — plus where to go when something's unclear"
    >
      <div className="mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-foreground">How can we help?</h2>
        <p className="max-w-2xl text-sm text-muted">
          Every action in TalentAI works on real data, so the fastest way to understand a feature is to try
          it. These guides point at the exact workspace, and the dashboard tells you what is waiting for you today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TOPICS.map((topic) => (
          <Link
            key={topic.href}
            href={topic.href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle">
              <topic.icon className="h-5 w-5 text-foreground" size={20} variant="Linear" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{topic.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{topic.description}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-foreground">
              {topic.cta}
              <ArrowRight size={14} className="text-muted transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <MessageQuestion className="mt-0.5 h-5 w-5 shrink-0 text-muted" size={20} />
          <div className="space-y-2 text-sm text-muted">
            <h3 className="font-semibold text-foreground">Still stuck?</h3>
            <p>
              Check the <Link href="/notifications" className="font-medium text-foreground underline underline-offset-2">Notifications</Link>{" "}
              panel for updates about your hiring activity — it also surfaces system messages that affect your work.
            </p>
            <p>
              Have a second look at the report definitions in{" "}
              <Link href="/reports" className="font-medium text-foreground underline underline-offset-2">Reports</Link>{" "}
              for how metrics are calculated before acting on a number.
            </p>
            <p className="text-xs text-muted">
              Data shown here is live from your workspace. No figures are estimated or mocked.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}