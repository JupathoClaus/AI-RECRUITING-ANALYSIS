"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { cn, timeAgo } from "@/lib/utils"
import {
  FileText,
  BarChart3,
  Users,
  Clock,
  Download,
  Eye,
  Share2,
  Plus,
  Calendar,
  Sparkles,
  Target,
  TrendingUp,
  PieChart,
  Filter,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react"

interface ReportTemplate {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  category: string
}

interface RecentReport {
  id: string
  title: string
  type: string
  date: Date
  status: "Ready" | "Generating"
  generatedBy: string
}

const reportTemplates: ReportTemplate[] = [
  {
    id: "tpl1",
    title: "Candidate Evaluation Report",
    description: "Comprehensive assessment of individual candidates including AI scores, interview feedback, and hiring recommendations.",
    icon: <Users className="h-5 w-5" />,
    color: "text-primary",
    bgColor: "bg-primary-muted",
    category: "Candidates",
  },
  {
    id: "tpl2",
    title: "Interview Summary Report",
    description: "Aggregated interview results with scoring breakdowns, interviewer feedback, and comparison analysis.",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "text-success",
    bgColor: "bg-success-muted",
    category: "Interviews",
  },
  {
    id: "tpl3",
    title: "Pipeline Analytics Report",
    description: "End-to-end pipeline metrics including conversion rates, stage durations, and bottleneck identification.",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "text-warning",
    bgColor: "bg-warning-muted",
    category: "Analytics",
  },
  {
    id: "tpl4",
    title: "Diversity & Inclusion Report",
    description: "Demographic breakdown of applicant pool, interview candidates, and hired candidates with DEI metrics.",
    icon: <PieChart className="h-5 w-5" />,
    color: "text-primary",
    bgColor: "bg-primary-muted",
    category: "Compliance",
  },
  {
    id: "tpl5",
    title: "Time-to-Hire Report",
    description: "Analysis of hiring velocity by department, role, and source with historical trend comparisons.",
    icon: <Clock className="h-5 w-5" />,
    color: "text-info",
    bgColor: "bg-info-muted",
    category: "Operations",
  },
  {
    id: "tpl6",
    title: "Source Effectiveness Report",
    description: "ROI analysis of recruitment channels with cost-per-hire, quality metrics, and channel recommendations.",
    icon: <Target className="h-5 w-5" />,
    color: "text-error",
    bgColor: "bg-error-muted",
    category: "Sourcing",
  },
]

const recentReports: RecentReport[] = [
  { id: "r1", title: "Q2 2026 Engineering Hiring Summary", type: "Pipeline Analytics Report", date: new Date("2026-07-10"), status: "Ready", generatedBy: "Sarah Kim" },
  { id: "r2", title: "Candidate Evaluation - Emily Chen", type: "Candidate Evaluation Report", date: new Date("2026-07-09"), status: "Ready", generatedBy: "AI System" },
  { id: "r3", title: "Monthly DEI Report - June 2026", type: "Diversity & Inclusion Report", date: new Date("2026-07-02"), status: "Ready", generatedBy: "HR Team" },
  { id: "r4", title: "Source Effectiveness Analysis", type: "Source Effectiveness Report", date: new Date("2026-07-01"), status: "Generating", generatedBy: "AI System" },
  { id: "r5", title: "Q1 2026 Interview Performance", type: "Interview Summary Report", date: new Date("2026-06-28"), status: "Ready", generatedBy: "David Park" },
  { id: "r6", title: "Time-to-Hire Benchmark Report", type: "Time-to-Hire Report", date: new Date("2026-06-25"), status: "Ready", generatedBy: "AI System" },
  { id: "r7", title: "Frontend Team Candidate Pool", type: "Candidate Evaluation Report", date: new Date("2026-06-20"), status: "Ready", generatedBy: "Sarah Kim" },
  { id: "r8", title: "Recruitment Funnel Deep Dive", type: "Pipeline Analytics Report", date: new Date("2026-06-18"), status: "Generating", generatedBy: "AI System" },
]

const statusConfig: Record<"Ready" | "Generating", { variant: "success" | "warning"; icon: React.ReactNode }> = {
  Ready: { variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  Generating: { variant: "warning", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
}

export default function ReportsPage() {
  const { jobs, candidates, interviews } = useStore()
  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false)
  const [selectedTemplate, setSelectedTemplate] = React.useState<ReportTemplate | null>(null)
  const [reportParams, setReportParams] = React.useState({
    department: "all",
    dateRange: "this-month",
    format: "pdf",
  })

  const handleGenerate = (template: ReportTemplate) => {
    setSelectedTemplate(template)
    setGenerateDialogOpen(true)
  }

  const activeJobs = jobs.filter((j) => j.status === "Active").length
  const totalCandidates = candidates.length
  const completedInterviews = interviews.filter((i) => i.status === "Completed").length

  return (
    <AppLayout
      title="Reports"
      description="Generate and manage AI-powered recruitment reports."
      actions={
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Generate Report
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-in">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted font-semibold uppercase tracking-wide">Total Reports</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{recentReports.length}</p>
                </div>
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-success">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted font-semibold uppercase tracking-wide">Ready</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{recentReports.filter((r) => r.status === "Ready").length}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-warning">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted font-semibold uppercase tracking-wide">Generating</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{recentReports.filter((r) => r.status === "Generating").length}</p>
                </div>
                <Loader2 className="h-5 w-5 text-warning animate-spin" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report Templates */}
        <div className="animate-fade-in">
          <h3 className="text-sm font-medium text-muted mb-4">Report Templates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {reportTemplates.map((template) => (
              <Card
                key={template.id}
                className="group hover:border-primary/30 transition-all duration-200 cursor-pointer"
                onClick={() => handleGenerate(template)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", template.bgColor, template.color)}>
                        {template.icon}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm truncate">{template.title}</CardTitle>
                        <CardDescription className="text-xs">{template.category}</CardDescription>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-xs text-muted leading-relaxed line-clamp-2">{template.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGenerate(template)
                      }}
                    >
                      <Sparkles className="h-3 w-3" />
                      Generate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Reports Table */}
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Reports</CardTitle>
                <CardDescription>Your recently generated reports</CardDescription>
              </div>
              <Calendar className="h-4 w-4 text-muted" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Report</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-muted" />
                        </div>
                        <p className="font-medium text-foreground truncate max-w-[240px]">{report.title}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted">{report.type}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted">{timeAgo(report.date)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[report.status].variant} className="gap-1">
                        {statusConfig[report.status].icon}
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted">{report.generatedBy}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={report.status === "Generating"}>
                          <Eye className="h-4 w-4 text-muted" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={report.status === "Generating"}>
                          <Download className="h-4 w-4 text-muted" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={report.status === "Generating"}>
                          <Share2 className="h-4 w-4 text-muted" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Report Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-xl">
          {selectedTemplate && (
            <>
              <ModalHeader>
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", selectedTemplate.bgColor, selectedTemplate.color)}>
                    {selectedTemplate.icon}
                  </div>
                  <div>
                    <DialogTitle>{selectedTemplate.title}</DialogTitle>
                    <DialogDescription className="mt-1">{selectedTemplate.description}</DialogDescription>
                  </div>
                </div>
              </ModalHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Department</label>
                  <Select
                    value={reportParams.department}
                    onValueChange={(v) => setReportParams((p) => ({ ...p, department: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {Array.from(new Set(jobs.map((j) => j.department))).map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Date Range</label>
                  <Select
                    value={reportParams.dateRange}
                    onValueChange={(v) => setReportParams((p) => ({ ...p, dateRange: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this-week">This Week</SelectItem>
                      <SelectItem value="this-month">This Month</SelectItem>
                      <SelectItem value="this-quarter">This Quarter</SelectItem>
                      <SelectItem value="this-year">This Year</SelectItem>
                      <SelectItem value="all-time">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Output Format</label>
                  <Select
                    value={reportParams.format}
                    onValueChange={(v) => setReportParams((p) => ({ ...p, format: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="csv">CSV Spreadsheet</SelectItem>
                      <SelectItem value="json">JSON Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="bg-surface-hover" />

                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium">Report Preview</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-foreground">{activeJobs}</p>
                      <p className="text-xs text-muted">Active Jobs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{totalCandidates}</p>
                      <p className="text-xs text-muted">Candidates</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{completedInterviews}</p>
                      <p className="text-xs text-muted">Interviews</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted text-center">
                    Report will include data from {reportParams.dateRange.replace("-", " ")} across {reportParams.department === "all" ? "all departments" : reportParams.department}.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setGenerateDialogOpen(false)}>
                  <Sparkles className="h-4 w-4" />
                  Generate Report
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
