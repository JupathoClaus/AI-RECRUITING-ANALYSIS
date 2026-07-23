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
  Document,
  Chart2,
  People,
  Clock,
  DocumentDownload,
  Eye,
  Share,
  Add,
  Calendar,
  MagicStar,
  Flag,
  TrendUp,
  Chart,
  Filter,
  RefreshCircle,
  TickCircle,
  ArrowRight,
  Briefcase,
} from "iconsax-react"

interface ReportTemplate {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  category: string
}

const reportTemplates: ReportTemplate[] = [
  {
    id: "tpl1",
    title: "Candidate Evaluation Report",
    description: "Comprehensive assessment of individual candidates including AI scores, interview feedback, and hiring recommendations.",
    icon: <People className="h-5 w-5" />,
    color: "text-primary",
    bgColor: "bg-primary-muted",
    category: "Candidates",
  },
  {
    id: "tpl2",
    title: "Interview Summary Report",
    description: "Aggregated interview results with scoring breakdowns, interviewer feedback, and comparison analysis.",
    icon: <Chart2 className="h-5 w-5" />,
    color: "text-success",
    bgColor: "bg-success-muted",
    category: "Interviews",
  },
  {
    id: "tpl3",
    title: "Pipeline Analytics Report",
    description: "End-to-end pipeline metrics including conversion rates, stage durations, and bottleneck identification.",
    icon: <TrendUp className="h-5 w-5" />,
    color: "text-warning",
    bgColor: "bg-warning-muted",
    category: "Analytics",
  },
  {
    id: "tpl4",
    title: "Diversity & Inclusion Report",
    description: "Demographic breakdown of applicant pool, interview candidates, and hired candidates with DEI metrics.",
    icon: <Chart className="h-5 w-5" />,
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
    icon: <Flag className="h-5 w-5" />,
    color: "text-error",
    bgColor: "bg-error-muted",
    category: "Sourcing",
  },
]

interface RecentReport {
  id: string
  title: string
  type: string
  date: Date
  status: "Ready" | "Generating"
  generatedBy: string
}

const statusConfig: Record<"Ready" | "Generating", { variant: "success" | "warning"; icon: React.ReactNode }> = {
  Ready: { variant: "success", icon: <TickCircle className="h-3 w-3" /> },
  Generating: { variant: "warning", icon: <RefreshCircle className="h-3 w-3 animate-spin" /> },
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
        <Button size="sm" disabled>
          <Add className="h-4 w-4" />
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
                  <p className="text-sm text-muted font-semibold uppercase tracking-wide">Templates Available</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{reportTemplates.length}</p>
                </div>
                <Document className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-success">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted font-semibold uppercase tracking-wide">Active Jobs</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{activeJobs}</p>
                </div>
                <TickCircle className="h-5 w-5 text-success" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-warning">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted font-semibold uppercase tracking-wide">Total Candidates</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{totalCandidates}</p>
                </div>
                <RefreshCircle className="h-5 w-5 text-warning animate-spin" />
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
                      <MagicStar className="h-3 w-3" />
                      Generate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Reports - Empty State */}
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
            <div className="text-center py-12">
              <Document className="h-12 w-12 mx-auto text-muted/30 mb-4" />
              <h4 className="font-medium text-foreground">No reports generated yet</h4>
              <p className="text-sm text-muted mt-1">
                Select a template above to generate your first report
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => handleGenerate(reportTemplates[0])}
              >
                <MagicStar className="h-4 w-4 mr-2" />
                Try a Template
              </Button>
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

                <div className="rounded-lg bg-background p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <MagicStar className="h-4 w-4 text-primary" />
                    <span className="font-medium">Report Preview</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Briefcase className="text-muted-foreground" size={14} />
                        <p className="text-lg font-bold text-foreground">{activeJobs}</p>
                      </div>
                      <p className="text-xs text-muted">Active Jobs</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <People className="text-muted-foreground" size={14} />
                        <p className="text-lg font-bold text-foreground">{totalCandidates}</p>
                      </div>
                      <p className="text-xs text-muted">Candidates</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Calendar className="text-muted-foreground" size={14} />
                        <p className="text-lg font-bold text-foreground">{completedInterviews}</p>
                      </div>
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
                <Button onClick={() => setGenerateDialogOpen(false)} disabled>
                  <MagicStar className="h-4 w-4" />
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