"use client"

import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
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
} from "iconsax-react"
import * as reportsApi from "@/lib/api/reports.api"
import type { ReportParams, CandidateEvaluationRow, InterviewSummaryRow, TimeToHireRow, SourceEffectivenessRow, JobSummaryRow, ActivityRow, PipelineReport } from "@/lib/api/reports.api"

interface ReportView {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  category: string
}

const reportViews: ReportView[] = [
  {
    id: "candidate-evaluation",
    title: "Candidate Evaluation Report",
    description: "Candidate details, application status, source, and interview outcomes by job.",
    icon: <People className="h-5 w-5" />,
    color: "text-primary",
    bgColor: "bg-primary-muted",
    category: "Candidates",
  },
  {
    id: "interview-summary",
    title: "Interview Summary Report",
    description: "Aggregated interview results with type, status, duration, and interviewer feedback.",
    icon: <Chart2 className="h-5 w-5" />,
    color: "text-success",
    bgColor: "bg-success-muted",
    category: "Interviews",
  },
  {
    id: "pipeline",
    title: "Pipeline Analytics Report",
    description: "End-to-end pipeline metrics including conversion rates and stage distributions.",
    icon: <TrendUp className="h-5 w-5" />,
    color: "text-warning",
    bgColor: "bg-warning-muted",
    category: "Analytics",
  },
  {
    id: "time-to-hire",
    title: "Time-to-Hire Report",
    description: "Analysis of hiring velocity from application submission to hired date.",
    icon: <Clock className="h-5 w-5" />,
    color: "text-info",
    bgColor: "bg-info-muted",
    category: "Operations",
  },
  {
    id: "source-effectiveness",
    title: "Source Effectiveness Report",
    description: "Applications by source channel with interview and hire conversion rates.",
    icon: <Flag className="h-5 w-5" />,
    color: "text-error",
    bgColor: "bg-error-muted",
    category: "Sourcing",
  },
  {
    id: "job-summary",
    title: "Job Summary Report",
    description: "Per-job breakdown of applications, interviews, hires, and active candidates.",
    icon: <Briefcase className="h-5 w-5" />,
    color: "text-primary",
    bgColor: "bg-primary-muted",
    category: "Jobs",
  },
  {
    id: "diversity",
    title: "Diversity & Inclusion Report",
    description: "Demographic reporting requires explicitly collected and authorized candidate data.",
    icon: <Chart className="h-5 w-5" />,
    color: "text-muted",
    bgColor: "bg-surface-elevated",
    category: "Compliance",
  },
  {
    id: "activity",
    title: "Recruitment Activity Report",
    description: "Audit trail of application events including submissions, stage changes, and interviews.",
    icon: <MagicStar className="h-5 w-5" />,
    color: "text-warning",
    bgColor: "bg-warning-muted",
    category: "Audit",
  },
]

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString()
}

export default function ReportsPage() {
  const [activeView, setActiveView] = React.useState<string | null>(null)
  const [data, setData] = React.useState<unknown>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [params] = React.useState<ReportParams>({ page: 1, limit: 100 })

  const activeReport = reportViews.find((r) => r.id === activeView)

  React.useEffect(() => {
    let cancelled = false
    if (activeView && activeView !== "diversity") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      setError(null)
      const fn = async () => {
        try {
          let result: unknown
          switch (activeView) {
            case "candidate-evaluation": result = await reportsApi.getCandidateEvaluation(params); break
            case "interview-summary": result = await reportsApi.getInterviewSummary(params); break
            case "pipeline": result = await reportsApi.getPipeline(params); break
            case "time-to-hire": result = await reportsApi.getTimeToHire(params); break
            case "source-effectiveness": result = await reportsApi.getSourceEffectiveness(params); break
            case "job-summary": result = await reportsApi.getJobSummary(params); break
            case "activity": result = await reportsApi.getActivity(params); break
          }
          if (!cancelled) setData(result)
        } catch (err: unknown) {
          if (!cancelled) setError(getErrorMessage(err, "Failed to load report"))
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      fn()
    }
    if (activeView === "diversity") {
      setData(null)
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [activeView, params])

  const handleViewChange = (viewId: string) => {
    setActiveView(viewId)
    setData(null)
  }

  const handleExport = () => {
    if (!activeView || activeView === "diversity") return
    const url = reportsApi.getExportUrl(activeView, params)
    window.open(url!, "_blank")
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
        If your organization collects this data through an external process, it cannot be reported here without a data integration.
      </p>
    </div>
  )

  return (
    <AppLayout
      title="Reports"
      description="Generate and export recruitment reports from live system data."
    >
      <div className="space-y-6">
        {/* Report Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {reportViews.map((view) => (
            <Card
              key={view.id}
              className={cn(
                "group hover:border-primary/30 transition-all duration-200 cursor-pointer",
                activeView === view.id && "border-primary/50 ring-1 ring-primary/20"
              )}
              onClick={() => handleViewChange(view.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", view.bgColor, view.color)}>
                    {view.icon}
                  </div>
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
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", activeReport.bgColor, activeReport.color)}>
                    {activeReport.icon}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{activeReport.title}</CardTitle>
                    <CardDescription>{activeReport.description}</CardDescription>
                  </div>
                </div>
                {activeView !== "diversity" && (
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || !data}>
                    <DocumentDownload className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activeView === "diversity" ? (
                renderDiversityUnavailable()
              ) : loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-error mb-3">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
                </div>
              ) : data ? (
                <ReportTable viewId={activeView!} data={data} />
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
              <p className="text-sm text-muted mt-1 max-w-md mx-auto">
                Choose a report type above to view live data from your recruitment pipeline.
                All reports are generated from real system data.
              </p>
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
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pipeline.stages.map((s) => (
              <TableRow key={s.stage}>
                <TableCell className="font-medium">{s.stage}</TableCell>
                <TableCell className="text-right">{s.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (viewId === "source-effectiveness") {
    const rows = data as SourceEffectivenessRow[]
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted">No source data available</div>
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Applications</TableHead>
            <TableHead className="text-right">Interviewed</TableHead>
            <TableHead className="text-right">Hired</TableHead>
            <TableHead className="text-right">Rejected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.source}>
              <TableCell className="font-medium">{r.source}</TableCell>
              <TableCell className="text-right">{r.applicationCount}</TableCell>
              <TableCell className="text-right">{r.interviewedCount}</TableCell>
              <TableCell className="text-right">{r.hiredCount}</TableCell>
              <TableCell className="text-right">{r.rejectedCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (viewId === "job-summary") {
    const rows = data as JobSummaryRow[]
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted">No job data available</div>
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Applications</TableHead>
            <TableHead className="text-right">Interviews</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="text-right">Hired</TableHead>
            <TableHead className="text-right">Rejected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.jobId}>
              <TableCell className="font-medium">{r.title}</TableCell>
              <TableCell>{r.department || "—"}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell>
              <TableCell className="text-right">{r.applicationCount}</TableCell>
              <TableCell className="text-right">{r.interviewCount}</TableCell>
              <TableCell className="text-right">{r.activeApplicationCount}</TableCell>
              <TableCell className="text-right">{r.hiredCount}</TableCell>
              <TableCell className="text-right">{r.rejectedCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (viewId === "candidate-evaluation") {
    const { data: rows } = data as { data: CandidateEvaluationRow[] }
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted">No candidate data available</div>
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Interview</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.applicantionId}>
              <TableCell className="font-medium">{r.candidateName}</TableCell>
              <TableCell className="text-xs text-muted">{r.email}</TableCell>
              <TableCell>{r.jobTitle}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{r.applicationStatus}</Badge></TableCell>
              <TableCell className="text-xs">{r.source}</TableCell>
              <TableCell className="text-xs">{formatDate(r.submittedAt)}</TableCell>
              <TableCell className="text-xs">{r.interviewStatus || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (viewId === "interview-summary") {
    const { data: rows } = data as { data: InterviewSummaryRow[] }
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted">No interview data available</div>
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Interviewer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.interviewId}>
              <TableCell className="font-medium">{r.candidateName}</TableCell>
              <TableCell>{r.jobTitle}</TableCell>
              <TableCell className="text-xs">{r.interviewType}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell>
              <TableCell className="text-xs">{r.result || "—"}</TableCell>
              <TableCell className="text-xs">{formatDate(r.scheduledAt)}</TableCell>
              <TableCell className="text-right text-xs">{r.durationMinutes ? `${r.durationMinutes}m` : "—"}</TableCell>
              <TableCell className="text-xs">{r.interviewerName || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (viewId === "time-to-hire") {
    const { data: rows } = data as { data: TimeToHireRow[] }
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted">No hired candidate data available</div>
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Hired</TableHead>
            <TableHead className="text-right">Days to Hire</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.applicationId}>
              <TableCell className="font-medium">{r.candidateName}</TableCell>
              <TableCell>{r.jobTitle}</TableCell>
              <TableCell className="text-xs">{r.department || "—"}</TableCell>
              <TableCell className="text-xs">{formatDate(r.submittedAt)}</TableCell>
              <TableCell className="text-xs">{formatDate(r.hiredAt)}</TableCell>
              <TableCell className="text-right font-semibold">{r.daysToHire !== null ? `${r.daysToHire}d` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (viewId === "activity") {
    const { data: rows } = data as { data: ActivityRow[] }
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted">No activity data available</div>
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Actor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(r.occurredAt)}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{r.eventType}</Badge></TableCell>
                <TableCell className="text-xs">{r.entityType}</TableCell>
                <TableCell className="text-xs max-w-xs truncate">{r.description}</TableCell>
                <TableCell className="text-xs">{r.actorName || r.actorType || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return null
}
