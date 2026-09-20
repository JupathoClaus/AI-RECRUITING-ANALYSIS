"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { BarChart3, BriefcaseBusiness, CalendarDays, ChevronLeft, FileText, MapPin, Network, Sparkles } from "lucide-react"
import { ApplicationListView } from "@/components/recruitment/application-list-view"
import { PipelineBoard } from "@/components/recruitment/pipeline-board"
import { JobStatusBadge } from "@/components/recruitment/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { getJobById, getJobPipeline, getJobAnalytics, type PipelineStageDto, type JobAnalyticsResponse } from "@/lib/api/jobs.api"
import { fetchApplications } from "@/lib/api/applications.api"
import { fetchInterviews } from "@/lib/api/interviews.api"
import type { JobListDto } from "@/lib/api/types"

type WorkspaceSection = "overview" | "applications" | "pipeline" | "screening" | "interviews" | "analytics"

const tabs: { id: WorkspaceSection; label: string; icon: typeof BriefcaseBusiness }[] = [
  { id: "overview", label: "Overview", icon: BriefcaseBusiness },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "pipeline", label: "Pipeline", icon: Network },
  { id: "screening", label: "Screening", icon: Sparkles },
  { id: "interviews", label: "Interviews", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
]

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function Metric({ label: metricLabel, value, description }: { label: string; value: string | number; description: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">{metricLabel}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted">{description}</p></CardContent></Card>
}

export function JobWorkspace({ section = "overview" }: { section?: WorkspaceSection }) {
  const params = useParams<{ jobId: string }>()
  const pathname = usePathname()
  const jobId = params.jobId
  const [job, setJob] = React.useState<JobListDto | null>(null)
  const [stages, setStages] = React.useState<PipelineStageDto[]>([])
  const [applicationCount, setApplicationCount] = React.useState<number | null>(null)
  const [interviewCount, setInterviewCount] = React.useState<number | null>(null)
  const [analytics, setAnalytics] = React.useState<JobAnalyticsResponse | null>(null)
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    Promise.all([
      getJobById(jobId),
      getJobPipeline(jobId).catch(() => null),
      fetchApplications({ jobId: [jobId], page: 1, limit: 1 }).catch(() => null),
      fetchInterviews({ jobId, page: 1, limit: 1 }).catch(() => null),
    ]).then(([jobResponse, pipeline, applications, interviews]) => {
      if (!active) return
      setJob(jobResponse)
      setStages(pipeline?.stages ?? [])
      setApplicationCount(applications?.meta.total ?? null)
      setInterviewCount(interviews?.meta.total ?? null)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "This job workspace could not be loaded.")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId])

  React.useEffect(() => {
    if (section !== "analytics") return
    let active = true
    getJobAnalytics(jobId)
      .then((data) => {
        if (!active) return
        setAnalytics(data)
        setAnalyticsError(null)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setAnalyticsError(reason instanceof Error ? reason.message : "Job analytics could not be loaded.")
      })
    return () => { active = false }
  }, [jobId, section])

  if (loading) return <div className="space-y-6"><Skeleton className="h-36 w-full" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}</div></div>
  if (error || !job) return <EmptyState title="Job workspace unavailable" description={error || "This job was not found."} action={<Link href="/jobs" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-hover">Back to jobs</Link>} />

  const sectionHref = (tab: WorkspaceSection) => tab === "overview" ? `/jobs/${job.id}` : `/jobs/${job.id}/${tab}`
  const salary = job.salaryMin != null || job.salaryMax != null
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: job.salaryCurrency || "USD", maximumFractionDigits: 0 }).format(job.salaryMin ?? job.salaryMax ?? 0) + (job.salaryMax != null && job.salaryMax !== job.salaryMin ? ` – ${new Intl.NumberFormat(undefined, { style: "currency", currency: job.salaryCurrency || "USD", maximumFractionDigits: 0 }).format(job.salaryMax)}` : "")
    : null

  return <div className="space-y-6">
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Jobs</Link>
      <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div><div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight text-foreground">{job.title}</h2><JobStatusBadge status={job.status} /></div><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted"><span>{job.department?.name || "Department unavailable"}</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location?.name || label(job.workplaceType)}</span><span>{label(job.employmentType)}</span>{salary && <span>{salary}</span>}</p></div>
        <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm"><p className="font-medium text-foreground">{applicationCount ?? "—"} applications</p><p className="mt-1 text-xs text-muted">{job.numberOfOpenings} opening{job.numberOfOpenings === 1 ? "" : "s"} · {job.jobCode}</p></div>
      </div>
      <nav className="mt-6 -mb-5 flex gap-1 overflow-x-auto" aria-label="Job workspace sections">{tabs.map((tab) => { const Icon = tab.icon; const active = pathname === sectionHref(tab.id); return <Link key={tab.id} href={sectionHref(tab.id)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${active ? "border-foreground text-foreground" : "border-transparent text-muted hover:border-border hover:text-foreground"}`} aria-current={active ? "page" : undefined}><Icon className="h-4 w-4" />{tab.label}</Link> })}</nav>
    </div>

    {section === "overview" && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Applications" value={applicationCount ?? "—"} description={applicationCount === null ? "Unavailable" : "Submitted for this job"} /><Metric label="Pipeline stages" value={stages.length || "—"} description={stages.length ? "Configured for this job" : "No configuration available"} /><Metric label="Interviews" value={interviewCount ?? "—"} description={interviewCount === null ? "Unavailable" : "Scheduled or recorded"} /><Metric label="Screening questions" value={job._count?.screeningQuestions ?? 0} description="Configured job requirements" /></div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Job summary</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted"><p>{job.description || "No job description is available."}</p><p><span className="font-medium text-foreground">Experience:</span> {label(job.experienceLevel)}</p><p><span className="font-medium text-foreground">Workflow:</span> Application decisions remain recruiter-controlled.</p></CardContent></Card><Card><CardHeader><CardTitle>Pipeline snapshot</CardTitle></CardHeader><CardContent>{stages.length ? <ol className="space-y-3">{stages.slice(0, 5).map((stage, index) => <li className="flex items-center gap-3 text-sm" key={stage.id}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-xs font-medium text-foreground">{index + 1}</span><span>{stage.name}</span></li>)}</ol> : <p className="text-sm text-muted">No pipeline configuration is available for this job.</p>}</CardContent></Card></div></div>}
    {section === "applications" && <ApplicationListView jobId={jobId} showJobColumn={false} />}
    {section === "pipeline" && <PipelineBoard jobId={jobId} stages={stages} />}
    {section === "screening" && <div className="space-y-3"><div><h3 className="text-lg font-semibold">Application screening</h3><p className="text-sm text-muted">Select applications to queue real AI screening. Results are decision support, not hiring decisions.</p></div><ApplicationListView jobId={jobId} showJobColumn={false} /></div>}
    {section === "interviews" && <Card><CardHeader><CardTitle>Interviews for this job</CardTitle></CardHeader><CardContent><p className="text-sm text-muted">{interviewCount === null ? "Interview totals are unavailable." : `${interviewCount} interview${interviewCount === 1 ? "" : "s"} are available for this job.`}</p><Link href={`/interviews?jobId=${jobId}`} className="mt-4 inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-hover">Open interviews</Link></CardContent></Card>}
    {section === "analytics" && (analyticsError ? (
      <Card>
        <CardHeader><CardTitle>Job analytics unavailable</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p className="text-error">{analyticsError}</p>
          <p>No metrics are estimated when the aggregate cannot be loaded.</p>
        </CardContent>
      </Card>
    ) : !analytics || analytics.jobId !== jobId ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-28" />)}</div>
    ) : (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Applications" value={analytics.applications.total.toLocaleString()} description={`${analytics.applications.active.toLocaleString()} active in pipeline`} />
          <Metric label="Screening completed" value={analytics.screening.completed.toLocaleString()} description={`${analytics.screening.pending.toLocaleString()} pending · ${analytics.screening.failed.toLocaleString()} failed`} />
          <Metric label="Average screening score" value={analytics.screening.averageScore ?? "—"} description={analytics.screening.scored > 0 ? `${analytics.screening.scored.toLocaleString()} scored results` : "No completed scored screenings"} />
          <Metric label="Interviews" value={analytics.interviews.total.toLocaleString()} description={`${analytics.interviews.upcoming.toLocaleString()} upcoming`} />
          <Metric label="AI interviews" value={analytics.aiInterviews.total.toLocaleString()} description="Scheduled or completed" />
          <Metric label="Time to hire" value={analytics.timeToHireDays == null ? "—" : `${analytics.timeToHireDays.toLocaleString()} days`} description={analytics.timeToHireDays == null ? "No valid hires recorded" : "Average applied → hired"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Pipeline distribution</CardTitle></CardHeader>
            <CardContent>
              {analytics.applications.byStage.length === 0 ? (
                <p className="text-sm text-muted">No pipeline stages are configured for this job.</p>
              ) : (
                <ul className="space-y-3">
                  {analytics.applications.byStage.map((stage) => (
                    <li key={stage.stageId} className="flex items-center justify-between text-sm">
                      <span className="text-muted">{stage.name}</span>
                      <span className="font-medium text-foreground">{stage.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Screening recommendations</CardTitle></CardHeader>
            <CardContent>
              {analytics.screening.total === 0 ? (
                <p className="text-sm text-muted">No AI screening results exist for this job yet.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Shortlist</p><p className="mt-1 text-xl font-semibold text-foreground">{analytics.screening.byRecommendation.SHORTLIST.toLocaleString()}</p></div>
                    <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Human review</p><p className="mt-1 text-xl font-semibold text-foreground">{analytics.screening.byRecommendation.HUMAN_REVIEW.toLocaleString()}</p></div>
                    <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Not shortlist</p><p className="mt-1 text-xl font-semibold text-foreground">{analytics.screening.byRecommendation.NOT_SHORTLIST.toLocaleString()}</p></div>
                  </div>
                  <p className="text-xs text-muted">Completed screenings only. AI results are decision support, not hiring decisions.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Interview outcomes</CardTitle></CardHeader>
          <CardContent>
            {analytics.interviews.total === 0 ? (
              <p className="text-sm text-muted">No interviews are recorded for this job.</p>
            ) : (
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {Object.entries(analytics.interviews.byResult).map(([result, count]) => (
                  <div key={result}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">{label(result)}</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{count.toLocaleString()}</p>
                  </div>
                ))}
                {Object.keys(analytics.interviews.byResult).length === 0 && (
                  <p className="text-sm text-muted">Interview outcomes are not recorded yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    ))}
  </div>
}
