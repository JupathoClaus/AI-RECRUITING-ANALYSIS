"use client"

import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, getErrorMessage } from "@/lib/utils"
import {
  Document,
  Chart2,
  People,
  Clock,
  DocumentDownload,
  MagicStar,
  Flag,
  TrendUp,
  Chart,
  Briefcase,
  ArrowLeft,
  ArrowRight2,
} from "iconsax-react"
import * as reportsApi from "@/lib/api/reports.api"
import type { ReportParams, CandidateEvaluationRow, InterviewSummaryRow, TimeToHireRow, SourceEffectivenessRow, JobSummaryRow, ActivityRow, PipelineReport, ReportPaginationMeta } from "@/lib/api/reports.api"

interface ReportView {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  category: string
  hasExport: boolean
}

const reportViews: ReportView[] = [
  {
    id: "candidate-evaluation", title: "Candidate Evaluation Report", description: "Candidate details, application status, source, and interview outcomes by job.",
    icon: <People className="h-5 w-5" />, color: "text-primary", bgColor: "bg-primary-muted", category: "Candidates", hasExport: true,
  },
  {
    id: "interview-summary", title: "Interview Summary Report", description: "Aggregated interview results with type, status, duration, and interviewer.",
    icon: <Chart2 className="h-5 w-5" />, color: "text-success", bgColor: "bg-success-muted", category: "Interviews", hasExport: true,
  },
  {
    id: "pipeline", title: "Pipeline Analytics Report", description: "End-to-end pipeline metrics including stage distributions.",
    icon: <TrendUp className="h-5 w-5" />, color: "text-warning", bgColor: "bg-warning-muted", category: "Analytics", hasExport: true,
  },
  {
    id: "time-to-hire", title: "Time-to-Hire Report", description: "Hiring velocity from application submission to hired date.",
    icon: <Clock className="h-5 w-5" />, color: "text-info", bgColor: "bg-info-muted", category: "Operations", hasExport: true,
  },
  {
    id: "source-effectiveness", title: "Source Effectiveness Report", description: "Applications by source channel with conversion rates.",
    icon: <Flag className="h-5 w-5" />, color: "text-error", bgColor: "bg-error-muted", category: "Sourcing", hasExport: true,
  },
  {
    id: "job-summary", title: "Job Summary Report", description: "Per-job breakdown of applications, interviews, hires, and active candidates.",
    icon: <Briefcase className="h-5 w-5" />, color: "text-primary", bgColor: "bg-primary-muted", category: "Jobs", hasExport: true,
  },
  {
    id: "diversity", title: "Diversity & Inclusion Report", description: "Requires explicitly collected and authorized candidate data.",
    icon: <Chart className="h-5 w-5" />, color: "text-muted", bgColor: "bg-surface-elevated", category: "Compliance", hasExport: false,
  },
  {
    id: "activity", title: "Recruitment Activity Report", description: "Audit trail of application events including submissions and stage changes.",
    icon: <MagicStar className="h-5 w-5" />, color: "text-warning", bgColor: "bg-warning-muted", category: "Audit", hasExport: true,
  },
]

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString()
}

function Pagination({ meta, page, onPageChange }: { meta: ReportPaginationMeta | null; page: number; onPageChange: (p: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted">
      <span>{meta.total} record{meta.total !== 1 ? 's' : ''} · Page {page} of {meta.totalPages}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={page >= meta.totalPages} onClick={() => onPageChange(page + 1)}>
          <ArrowRight2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [activeView, setActiveView] = React.useState<string | null>(null)
  const [data, setData] = React.useState<unknown>(null)
  const [meta, setMeta] = React.useState<ReportPaginationMeta | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [exportLoading, setExportLoading] = React.useState(false)

  // Filters
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")

  const activeReport = reportViews.find((r) => r.id === activeView)

  const buildParams = React.useCallback((p: number): ReportParams => {
    const params: ReportParams = { page: p, limit: 50 }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    return params
  }, [dateFrom, dateTo])

  const loadReport = React.useCallback(async (viewId: string, p: number) => {
    setLoading(true)
    setError(null)
    const params = buildParams(p)
    try {
      let result: unknown
      let paginationMeta: ReportPaginationMeta | null = null
      switch (viewId) {
        case "candidate-evaluation": {
          const r = await reportsApi.getCandidateEvaluation(params); result = r.data; paginationMeta = r.meta; break
        }
        case "interview-summary": {
          const r = await reportsApi.getInterviewSummary(params); result = r.data; paginationMeta = r.meta; break
        }
        case "pipeline": {
          const r = await reportsApi.getPipeline(params); result = r; break
        }
        case "time-to-hire": {
          const r = await reportsApi.getTimeToHire(params); result = r.data; paginationMeta = r.meta; break
        }
        case "source-effectiveness": result = await reportsApi.getSourceEffectiveness(params); break
        case "job-summary": {
          const r = await reportsApi.getJobSummary(params); result = r.data; paginationMeta = r.meta; break
        }
        case "activity": {
          const r = await reportsApi.getActivity(params); result = r.data; paginationMeta = r.meta; break
        }
      }
      setData(result)
      setMeta(paginationMeta)
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load report"))
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  React.useEffect(() => {
    if (activeView && activeView !== "diversity") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadReport(activeView, page)
    }
    if (activeView === "diversity") { setData(null); setMeta(null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, page])

  const handleViewChange = (viewId: string) => {
    setActiveView(viewId)
    setPage(1)
    setMeta(null)
    setData(null)
  }

  const handleApplyFilters = () => {
    setPage(1)
    setMeta(null)
    if (activeView && activeView !== "diversity") loadReport(activeView, 1)
  }

  const handleClearFilters = () => {
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  const handleExport = async () => {
    if (!activeView || !activeReport?.hasExport) return
    setExportLoading(true)
    try {
      const params = buildParams(1)
      await reportsApi.downloadReportCsv(activeView, params)
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Export failed"))
    } finally {
      setExportLoading(false)
    }
  }

  const renderDiversityUnavailable = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated mb-4">
        <Chart className="h-8 w-8 text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">Not Available</h3>
      <p className="text-sm text-muted max-w-lg">
        Diversity and inclusion reporting requires demographic data that is explicitly collected from candidates with their consent.
        This information is not currently collected or stored in the system.
      </p>
    </div>
  )

  const isPaginated = activeView === "candidate-evaluation" || activeView === "interview-summary" || activeView === "time-to-hire" || activeView === "activity" || activeView === "job-summary"

  return (
    <AppLayout title="Reports" description="Generate and export recruitment reports from live system data.">
      <div className="space-y-6">
        {/* Report Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {reportViews.map((view) => (
            <Card
              key={view.id}
              className={cn("group hover:border-primary/30 transition-all duration-200 cursor-pointer", activeView === view.id && "border-primary/50 ring-1 ring-primary/20")}
              onClick={() => handleViewChange(view.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", view.bgColor, view.color)}>{view.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{view.title}</p>
                    <p className="text-xs text-muted truncate">{view.category}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Report */}
        {activeReport && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", activeReport.bgColor, activeReport.color)}>{activeReport.icon}</div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{activeReport.title}</CardTitle>
                    <CardDescription>{activeReport.description}</CardDescription>
                  </div>
                </div>
                {activeReport.hasExport && (
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={exportLoading || loading || !data}>
                    <DocumentDownload className="h-4 w-4 mr-2" />
                    {exportLoading ? "Exporting..." : "Export CSV"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Date From</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Date To</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40 text-xs" />
                </div>
                <Button variant="outline" size="sm" className="h-9" onClick={handleApplyFilters}>Apply Filters</Button>
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={handleClearFilters}>Clear</Button>
              </div>

              {/* Content */}
              {activeView === "diversity" ? (
                renderDiversityUnavailable()
              ) : loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-error mb-3">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => activeView && loadReport(activeView, page)}>Retry</Button>
                </div>
              ) : data ? (
                <>
                  <ReportTable viewId={activeView!} data={data} />
                  {isPaginated && <Pagination meta={meta} page={page} onPageChange={setPage} />}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Document className="h-12 w-12 text-muted/30 mb-3" />
                  <p className="text-sm text-muted">Select a report above to view data</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!activeView && (
          <Card>
            <CardContent className="py-12 text-center">
              <Document className="h-12 w-12 mx-auto text-muted/30 mb-4" />
              <h4 className="font-medium text-foreground">Select a Report</h4>
              <p className="text-sm text-muted mt-1">Choose a report type above to view live data from your recruitment pipeline.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}

function ReportTable({ viewId, data }: { viewId: string; data: unknown }) {
  if (viewId === "pipeline") {
    const pipeline = data as PipelineReport
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-foreground">{pipeline.totalApplications}</p><p className="text-xs text-muted">Total</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-success">{pipeline.activeCount}</p><p className="text-xs text-muted">Active</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-info">{pipeline.hiredCount}</p><p className="text-xs text-muted">Hired</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-error">{pipeline.rejectedCount}</p><p className="text-xs text-muted">Rejected</p></CardContent></Card>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
          <TableBody>{pipeline.stages.map((s) => (<TableRow key={s.stage}><TableCell className="font-medium">{s.stage}</TableCell><TableCell className="text-right">{s.count}</TableCell></TableRow>))}</TableBody>
        </Table>
      </div>
    )
  }

  if (viewId === "source-effectiveness") {
    const rows = data as SourceEffectivenessRow[]
    if (!rows.length) return <div className="py-8 text-center text-sm text-muted">No source data available</div>
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Applications</TableHead><TableHead className="text-right">Interviewed</TableHead><TableHead className="text-right">Hired</TableHead><TableHead className="text-right">Rejected</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (<TableRow key={r.source}><TableCell className="font-medium">{r.source}</TableCell><TableCell className="text-right">{r.applicationCount}</TableCell><TableCell className="text-right">{r.interviewedCount}</TableCell><TableCell className="text-right">{r.hiredCount}</TableCell><TableCell className="text-right">{r.rejectedCount}</TableCell></TableRow>))}</TableBody>
      </Table>
    )
  }

  if (viewId === "job-summary") {
    const rows = data as JobSummaryRow[]
    if (!rows.length) return <div className="py-8 text-center text-sm text-muted">No job data available</div>
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Dept</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Apps</TableHead><TableHead className="text-right">Interviews</TableHead><TableHead className="text-right">Active</TableHead><TableHead className="text-right">Hired</TableHead><TableHead className="text-right">Rejected</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (<TableRow key={r.jobId}><TableCell className="font-medium">{r.title}</TableCell><TableCell className="text-xs">{r.department || "—"}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell><TableCell className="text-right">{r.applicationCount}</TableCell><TableCell className="text-right">{r.interviewCount}</TableCell><TableCell className="text-right">{r.activeApplicationCount}</TableCell><TableCell className="text-right">{r.hiredCount}</TableCell><TableCell className="text-right">{r.rejectedCount}</TableCell></TableRow>))}</TableBody>
      </Table>
    )
  }

  if (viewId === "candidate-evaluation") {
    const rows = data as CandidateEvaluationRow[]
    if (!rows.length) return <div className="py-8 text-center text-sm text-muted">No candidate data</div>
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Email</TableHead><TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead><TableHead>Submitted</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (<TableRow key={r.applicationId}><TableCell className="font-medium">{r.candidateName}</TableCell><TableCell className="text-xs text-muted">{r.email}</TableCell><TableCell>{r.jobTitle}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{r.applicationStatus}</Badge></TableCell><TableCell className="text-xs">{r.source}</TableCell><TableCell className="text-xs">{formatDate(r.submittedAt)}</TableCell></TableRow>))}</TableBody>
      </Table>
    )
  }

  if (viewId === "interview-summary") {
    const rows = data as InterviewSummaryRow[]
    if (!rows.length) return <div className="py-8 text-center text-sm text-muted">No interview data</div>
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Job</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Scheduled</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (<TableRow key={r.interviewId}><TableCell className="font-medium">{r.candidateName}</TableCell><TableCell>{r.jobTitle}</TableCell><TableCell className="text-xs">{r.interviewType}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell><TableCell className="text-xs">{formatDate(r.scheduledAt)}</TableCell></TableRow>))}</TableBody>
      </Table>
    )
  }

  if (viewId === "time-to-hire") {
    const rows = data as TimeToHireRow[]
    if (!rows.length) return <div className="py-8 text-center text-sm text-muted">No hired candidate data</div>
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Job</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Days to Hire</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (<TableRow key={r.applicationId}><TableCell className="font-medium">{r.candidateName}</TableCell><TableCell>{r.jobTitle}</TableCell><TableCell className="text-xs">{formatDate(r.submittedAt)}</TableCell><TableCell className="text-right font-semibold">{r.daysToHire !== null ? `${r.daysToHire}d` : "—"}</TableCell></TableRow>))}</TableBody>
      </Table>
    )
  }

  if (viewId === "activity") {
    const rows = data as ActivityRow[]
    if (!rows.length) return <div className="py-8 text-center text-sm text-muted">No activity data</div>
    return (
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Event</TableHead><TableHead>Entity</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r, i) => (<TableRow key={i}><TableCell className="text-xs whitespace-nowrap">{formatDate(r.occurredAt)}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{r.eventType}</Badge></TableCell><TableCell className="text-xs">{r.entityType}</TableCell></TableRow>))}</TableBody>
      </Table>
    )
  }

  return null
}
