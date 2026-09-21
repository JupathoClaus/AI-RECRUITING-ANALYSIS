"use client"

import * as React from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Briefcase,
  DocumentText,
  People,
  Routing2,
  ArrowRight,
  Danger,
} from "iconsax-react"
import { fetchApplications } from "@/lib/api/applications.api"
import { fetchCandidates, fetchCandidatesScoreSummary } from "@/lib/api/candidates.api"
import { displayStatusToApplicationStatuses } from "@/lib/api/candidates.api"
import { useStore } from "@/store/useStore"

interface HubStat {
  loaded?: boolean
  value: string
  sub: string
}

interface HubState {
  openJobs: HubStat
  applications: HubStat
  candidates: HubStat
}

const initialState: HubState = {
  openJobs: { loaded: false, value: "—", sub: "Open positions" },
  applications: { loaded: false, value: "—", sub: "Applications" },
  candidates: { loaded: false, value: "—", sub: "Candidates" },
}

function HubCard({
  icon: Icon,
  title,
  description,
  href,
  stat,
  error,
}: {
  icon: React.ComponentType<{ size?: number; variant?: "Linear" | "Bold"; className?: string }>
  title: string
  description: string
  href: string
  stat: HubStat
  error?: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle">
          <Icon className="h-5 w-5 text-foreground" size={20} variant="Linear" />
        </div>
        <ArrowRight
          size={16}
          className="mt-1 text-muted transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </div>

      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>

      <div className="min-w-0 border-t border-border-subtle pt-3">
        {stat.loaded ? (
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold tabular-nums leading-none text-foreground">{stat.value}</p>
            <p className="truncate text-xs text-muted">{stat.sub}</p>
          </div>
        ) : error ? (
          <p className="text-xs text-muted">Unavailable right now</p>
        ) : (
          <Skeleton className="h-6 w-2/3" />
        )}
      </div>
    </Link>
  )
}

export default function HiringHubPage() {
  const { jobs, fetchJobs } = useStore()
  const [stats, setStats] = React.useState<HubState>(initialState)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let active = true
    setStats(initialState)
    setError(false)

    void fetchJobs()
    void Promise.allSettled([
      fetchApplications({ page: 1, limit: 1 }),
      fetchApplications({ page: 1, limit: 1, status: displayStatusToApplicationStatuses("Applied") }),
      fetchCandidates({ page: 1, limit: 1 }),
      fetchCandidatesScoreSummary(),
    ]).then((results) => {
      if (!active) return

      const next: HubState = {
        openJobs: { loaded: false, value: "—", sub: "Open positions" },
        applications: { loaded: false, value: "—", sub: "Applications" },
        candidates: { loaded: false, value: "—", sub: "Candidates" },
      }

      const appTotal = results[0].status === "fulfilled" ? results[0].value.meta.total : null
      const appNew = results[1].status === "fulfilled" ? results[1].value.meta.total : null
      const cand = results[2].status === "fulfilled" ? results[2].value.meta.total : null
      const summary = results[3].status === "fulfilled" ? results[3].value : null

      const anyOk = appTotal !== null || appNew !== null || cand !== null || summary !== null

      next.applications = appTotal !== null
        ? { loaded: true, value: appTotal.toLocaleString(), sub: appNew && appNew > 0 ? `${appNew.toLocaleString()} awaiting review` : "Total applications" }
        : { loaded: false, value: "—", sub: "Applications" }

      next.candidates = cand !== null
        ? {
            loaded: true,
            value: cand.toLocaleString(),
            sub: summary && summary.scoredCandidates > 0 ? `${summary.scoredCandidates.toLocaleString()} AI-screened` : "Total candidates",
          }
        : { loaded: false, value: "—", sub: "Candidates" }

      next.openJobs = { loaded: false, value: "—", sub: "Open positions" }

      setStats(next)
      setError(!anyOk)
    })

    return () => {
      active = false
    }
  }, [fetchJobs])

  const openJobsCount = Array.isArray(jobs) ? jobs.length : 0
  const openJobsLoaded = Array.isArray(jobs) && jobs.length >= 0 && !error

  return (
    <AppLayout
      title="Hiring"
      description="Jobs, applications, candidates and your recruitment pipeline"
      actions={
        <Link
          href="/jobs"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Briefcase className="h-4 w-4" size={16} />
          New Job
        </Link>
      }
    >
      <div className="mb-6 space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Hiring at a glance</h2>
        <p className="text-sm text-muted">
          Everything you manage during a recruitment drive, in one place. Pick a workspace to dive in.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HubCard
          icon={Briefcase}
          title="Jobs"
          description="Create, publish and maintain your open positions."
          href="/jobs"
          stat={
            openJobsLoaded
              ? { loaded: true, value: openJobsCount.toLocaleString(), sub: "Open positions" }
              : stats.openJobs
          }
          error={error}
        />
        <HubCard
          icon={DocumentText}
          title="Applications"
          description="Review applications, run AI screening and shortlist."
          href="/applications"
          stat={stats.applications}
          error={error}
        />
        <HubCard
          icon={People}
          title="Candidates"
          description="Manage candidate profiles, compare and move forward."
          href="/candidates"
          stat={stats.candidates}
          error={error}
        />
        <HubCard
          icon={Routing2}
          title="Pipeline"
          description="Move candidates through stages on a visual board."
          href="/pipeline"
          stat={{ loaded: openJobsLoaded, value: openJobsLoaded ? "Board" : "—", sub: "Drag across stages" }}
          error={!openJobsLoaded && error}
        />
      </div>

      {error && (
        <div
          className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
          role="status"
        >
          <Danger className="mt-0.5 h-4 w-4 shrink-0 text-warning" size={16} />
          <p className="text-sm text-muted">
            Some live counts couldn&apos;t be loaded. Open the linked workspace to see its full contents.
          </p>
        </div>
      )}

      <div className="mt-10 space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Need a reminder?</h2>
        <p className="text-sm text-muted">
          The <span className="font-medium text-foreground">Dashboard</span> highlights what needs your
          attention today — resumes to screen, interviews to run, offers to extend.
        </p>
      </div>
    </AppLayout>
  )
}