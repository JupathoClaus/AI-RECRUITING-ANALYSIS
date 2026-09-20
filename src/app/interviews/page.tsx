"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import type { Interview } from "@/types"
import type { FrontendInterviewType, BackendInterviewResult } from "@/lib/api/interviews.api"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Pagination } from "@/components/recruitment/pagination"
import { EmptyState } from "@/components/ui/empty-state"
import { cn, getInitials, timeAgo } from "@/lib/utils"
import {
  SearchNormal,
  Add,
  Calendar,
  Clock,
  Video,
  Call,
  People,
  MagicStar,
  Chart2,
  TickCircle,
  Timer,
  CloseSquare,
  Document,
  TrendUp,
  Buildings,
  Message,
} from "iconsax-react"

type InterviewType = Interview["type"]
type InterviewStatus = Interview["status"]

const statusConfig: Record<InterviewStatus, { label: string; variant: "default" | "success" | "warning" | "error" | "secondary" | "info" }> = {
  Scheduled: { label: "Scheduled", variant: "default" },
  Completed: { label: "Completed", variant: "success" },
  Cancelled: { label: "Cancelled", variant: "error" },
}

const typeConfig: Record<InterviewType, { label: string; variant: "default" | "info" | "outline" | "secondary"; icon: React.ReactNode }> = {
  Video: { label: "Video", variant: "default", icon: <Video className="h-3 w-3" /> },
  Phone: { label: "Phone", variant: "info", icon: <Call className="h-3 w-3" /> },
  "On-site": { label: "On-site", variant: "secondary", icon: <Buildings className="h-3 w-3" /> },
  AI: { label: "AI", variant: "outline", icon: <MagicStar className="h-3 w-3" /> },
  Technical: { label: "Technical", variant: "default", icon: <Chart2 className="h-3 w-3" /> },
}

const interviewTypes: InterviewType[] = ["Video", "Phone", "On-site", "AI", "Technical"]

function getScoreColor(score: number): string {
  if (score >= 85) return "text-success"
  if (score >= 70) return "text-warning"
  return "text-error"
}

function getScoreProgressColor(score: number): string {
  if (score >= 85) return "bg-success"
  if (score >= 70) return "bg-warning"
  return "bg-error"
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent"
  if (score >= 80) return "Strong"
  if (score >= 70) return "Good"
  if (score >= 60) return "Fair"
  return "Needs Improvement"
}

function formatInterviewDate(date: Date): string {
  const d = new Date(date)
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function formatInterviewTime(date: Date): string {
  const d = new Date(date)
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

function isUpcoming(interview: Interview): boolean {
  return interview.status === "Scheduled" && new Date(interview.scheduledAt) >= new Date()
}

function isCompleted(interview: Interview): boolean {
  return interview.status === "Completed"
}

export default function InterviewsPage() {
  const { interviews, interviewsMeta, candidates, jobs, interviewsLoading, interviewsError, fetchInterviews: loadInterviews, scheduleInterview, cancelInterviewById, completeInterviewById, rescheduleInterviewById, recordResultById } = useStore()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [activeTab, setActiveTab] = React.useState("upcoming")
  const [page, setPage] = React.useState(1)
  React.useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1) }, 300); return () => window.clearTimeout(timer) }, [searchQuery])
  React.useEffect(() => {
    void loadInterviews({ page, limit: 20, search: debouncedSearch, type: typeFilter === "all" ? undefined : typeFilter as InterviewType })
  }, [debouncedSearch, loadInterviews, page, typeFilter])
  const [scheduleDialogOpen, setScheduleDialogOpen] = React.useState(false)
  const [detailsInterview, setDetailsInterview] = React.useState<Interview | null>(null)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = React.useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = React.useState(false)
  const [completeForm, setCompleteForm] = React.useState({ resultNotes: "", result: "PASS" as BackendInterviewResult })
  const [rescheduleForm, setRescheduleForm] = React.useState({ date: "", time: "", reason: "" })

  const [newInterview, setNewInterview] = React.useState({
    candidateId: "",
    jobId: "",
    type: "Video" as InterviewType,
    date: "",
    time: "",
    duration: "60",
  })

  const upcomingCount = React.useMemo(
    () => interviews.filter(isUpcoming).length,
    [interviews]
  )

  const completedCount = React.useMemo(
    () => interviews.filter(isCompleted).length,
    [interviews]
  )

  const averageScore = React.useMemo(() => {
    const scored = interviews.filter((i) => i.status === "Completed" && i.score != null)
    if (scored.length === 0) return 0
    return Math.round(scored.reduce((sum, i) => sum + (i.score ?? 0), 0) / scored.length)
  }, [interviews])

  const filteredInterviews = React.useMemo(() => {
    return interviews.filter((interview) => {
      const matchesSearch = true
      const matchesType = typeFilter === "all" || interview.type === typeFilter
      return matchesSearch && matchesType
    })
  }, [interviews, searchQuery, typeFilter])

  const upcomingInterviews = React.useMemo(
    () => filteredInterviews.filter(isUpcoming),
    [filteredInterviews]
  )

  const completedInterviews = React.useMemo(
    () => filteredInterviews.filter(isCompleted),
    [filteredInterviews]
  )

  const tabInterviews = React.useMemo(() => {
    if (activeTab === "upcoming") return upcomingInterviews
    if (activeTab === "completed") return completedInterviews
    return filteredInterviews
  }, [activeTab, upcomingInterviews, completedInterviews, filteredInterviews])

  const handleScheduleInterview = async () => {
    if (!newInterview.candidateId || !newInterview.jobId || !newInterview.date || !newInterview.time) return

    const candidate = candidates.find((c) => c.id === newInterview.candidateId)
    const job = jobs.find((j) => j.id === newInterview.jobId)
    if (!candidate || !job) return

    const applicationId = candidate.applicationSummary?.current?.id
    if (!applicationId) return

    const dateTime = `${newInterview.date}T${newInterview.time}:00`
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

    await scheduleInterview({
      applicationId,
      jobId: newInterview.jobId,
      type: newInterview.type as FrontendInterviewType,
      title: `Interview: ${candidate.displayName} - ${job.title}`,
      scheduledAt: dateTime,
      durationMinutes: Number(newInterview.duration) || 60,
      timezone,
    })

    setScheduleDialogOpen(false)
    setNewInterview({ candidateId: "", jobId: "", type: "Video", date: "", time: "", duration: "60" })
  }

  return (
    <AppLayout
      title="Interviews"
      description={`${interviews.length} total · ${upcomingCount} upcoming · ${completedCount} completed`}
      actions={
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Add className="h-4 w-4" />
              Schedule Interview
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <ModalHeader>
              <DialogTitle>Schedule Interview</DialogTitle>
              <DialogDescription>Set up a new interview with a candidate.</DialogDescription>
            </ModalHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Candidate *</label>
                <Select value={newInterview.candidateId} onValueChange={(v) => setNewInterview((p) => ({ ...p, candidateId: v }))}>
                  <SelectTrigger aria-label="Candidate">
                    <SelectValue placeholder="Select a candidate" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.displayName} — {c.applicationSummary?.current?.jobTitle || c.currentJobTitle || ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Position *</label>
                <Select value={newInterview.jobId} onValueChange={(v) => setNewInterview((p) => ({ ...p, jobId: v }))}>
                  <SelectTrigger aria-label="Position">
                    <SelectValue placeholder="Select a position" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.filter((j) => j.status === "Active").map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Interview Type</label>
                  <Select value={newInterview.type} onValueChange={(v) => setNewInterview((p) => ({ ...p, type: v as InterviewType }))}>
                    <SelectTrigger aria-label="Interview Type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {interviewTypes.map((t) => (
                        <SelectItem key={t} value={t}>{typeConfig[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Duration (min)</label>
                  <Select value={newInterview.duration} onValueChange={(v) => setNewInterview((p) => ({ ...p, duration: v }))}>
                    <SelectTrigger aria-label="Duration (min)">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                      <SelectItem value="90">90 min</SelectItem>
                      <SelectItem value="120">120 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Date *</label>
                  <Input
                    type="date"
                    value={newInterview.date}
                    onChange={(e) => setNewInterview((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Time *</label>
                  <Input
                    type="time"
                    value={newInterview.time}
                    onChange={(e) => setNewInterview((p) => ({ ...p, time: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleScheduleInterview}
                disabled={!newInterview.candidateId || !newInterview.jobId || !newInterview.date || !newInterview.time}
              >
                <Calendar className="h-4 w-4" />
                Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Error Banner */}
      {interviewsError && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          {interviewsError}
        </div>
      )}

      {/* Loading State */}
      {interviewsLoading && interviews.length === 0 && (
        <div className="flex items-center justify-center py-12 animate-fade-in">
          <p className="text-sm text-muted">Loading interviews...</p>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 animate-fade-in">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Scheduled</p>
                <p className="text-2xl font-bold text-foreground mt-1">{upcomingCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Completed</p>
                <p className="text-2xl font-bold text-foreground mt-1">{completedCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TickCircle className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Average Score</p>
                <p className={cn("text-2xl font-bold mt-1", averageScore > 0 ? getScoreColor(averageScore) : "text-foreground")}>
                  {averageScore > 0 ? `${averageScore}%` : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <TrendUp className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <SearchNormal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Search by candidate name or job title..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]" aria-label="Type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {interviewTypes.map((t) => (
                  <SelectItem key={t} value={t}>{typeConfig[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="upcoming" className="gap-1.5">
              <Timer className="h-4 w-4" />
              Upcoming
              {upcomingCount > 0 && (
                <Badge variant="default" className="ml-1 h-5 px-1.5 text-xs">
                  {upcomingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              <TickCircle className="h-4 w-4" />
              Completed
              {completedCount > 0 && (
                <Badge variant="success" className="ml-1 h-5 px-1.5 text-xs">
                  {completedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">
              <People className="mr-1.5" size={14} />
              All
            </TabsTrigger>
          </TabsList>
          <span className="text-sm text-muted">
            {tabInterviews.length} interview{tabInterviews.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Interview Cards */}
        <TabsContent value="upcoming">
          {upcomingInterviews.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-8 w-8 text-muted" />}
              title="No upcoming interviews"
              description={
                searchQuery || typeFilter !== "all"
                  ? "Try adjusting your filters to see more results."
                  : "Schedule your first interview to get started."
              }
              action={
                searchQuery || typeFilter !== "all" ? (
                  <Button variant="outline" onClick={() => { setSearchQuery(""); setTypeFilter("all") }}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={() => setScheduleDialogOpen(true)}>
                    <Add className="h-4 w-4" />
                    Schedule Interview
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              {upcomingInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  onClick={() => setDetailsInterview(interview)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedInterviews.length === 0 ? (
            <EmptyState
              icon={<TickCircle className="h-8 w-8 text-muted" />}
              title="No completed interviews"
              description={
                searchQuery || typeFilter !== "all"
                  ? "Try adjusting your filters to see more results."
                  : "Completed interviews will appear here."
              }
              action={
                searchQuery || typeFilter !== "all" ? (
                  <Button variant="outline" onClick={() => { setSearchQuery(""); setTypeFilter("all") }}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {completedInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  onClick={() => setDetailsInterview(interview)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {filteredInterviews.length === 0 ? (
            <EmptyState
              icon={<People className="h-8 w-8 text-muted" />}
              title="No interviews found"
              description={
                searchQuery || typeFilter !== "all"
                  ? "Try adjusting your filters to see more results."
                  : "Get started by scheduling an interview."
              }
              action={
                searchQuery || typeFilter !== "all" ? (
                  <Button variant="outline" onClick={() => { setSearchQuery(""); setTypeFilter("all") }}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={() => setScheduleDialogOpen(true)}>
                    <Add className="h-4 w-4" />
                    Schedule Interview
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  onClick={() => setDetailsInterview(interview)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      {interviewsMeta && <Pagination meta={interviewsMeta} onPageChange={setPage} disabled={interviewsLoading} itemLabel="interviews" />}

      {/* Interview Detail Dialog */}
      <Dialog open={!!detailsInterview} onOpenChange={(open) => !open && setDetailsInterview(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {detailsInterview && (
            <>
              <ModalHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 shrink-0" fallback={getInitials(detailsInterview.candidateName)}>
                      <AvatarImage src="" alt={detailsInterview.candidateName} />
                    </Avatar>
                    <div>
                      <DialogTitle className="text-lg">{detailsInterview.candidateName}</DialogTitle>
                      <DialogDescription className="flex items-center gap-2 mt-1">
                        <span>{detailsInterview.jobTitle}</span>
                        <span className="text-muted">·</span>
                        <Badge variant={typeConfig[detailsInterview.type].variant} className="text-xs">
                          {typeConfig[detailsInterview.type].label}
                        </Badge>
                      </DialogDescription>
                    </div>
                  </div>
                  <Badge variant={statusConfig[detailsInterview.status].variant} className="shrink-0">
                    {statusConfig[detailsInterview.status].label}
                  </Badge>
                </div>
              </ModalHeader>

              <div className="space-y-5">
                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Calendar className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Date</p>
                    </div>
                    <p className="text-sm font-medium text-foreground" suppressHydrationWarning>
                      {formatInterviewDate(detailsInterview.scheduledAt)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Clock className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Time</p>
                    </div>
                    <p className="text-sm font-medium text-foreground" suppressHydrationWarning>
                      {formatInterviewTime(detailsInterview.scheduledAt)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Timer className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Duration</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {detailsInterview.duration} min
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      {typeConfig[detailsInterview.type].icon}
                      <p className="text-xs text-muted">Type</p>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <span className="text-sm font-medium text-foreground">
                        {typeConfig[detailsInterview.type].label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Buildings className="h-4 w-4 text-muted" />
                    <h4 className="text-sm font-medium text-foreground">Position</h4>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">{detailsInterview.jobTitle}</p>
                </div>

                {/* Score Section (if completed) */}
                {detailsInterview.status === "Completed" && detailsInterview.score != null && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Chart2 className="h-4 w-4 text-muted" />
                        <h4 className="text-sm font-medium text-foreground">Interview Score</h4>
                      </div>
                      <div className="ml-6 space-y-3">
                        <div className="flex items-center gap-3">
                          <Progress
                            value={detailsInterview.score}
                            className="h-3 flex-1"
                            indicatorClassName={getScoreProgressColor(detailsInterview.score)}
                          />
                          <span className={cn("text-lg font-bold w-12 text-right", getScoreColor(detailsInterview.score))}>
                            {detailsInterview.score}%
                          </span>
                        </div>
                        <p className={cn("text-sm font-medium", getScoreColor(detailsInterview.score))}>
                          {getScoreLabel(detailsInterview.score)}
                        </p>

                        {/* Score Breakdown */}
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className="rounded-lg bg-background p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Document className="text-muted-foreground" size={14} />
                              <p className="text-xs text-muted">Technical Skills</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.min(detailsInterview.score + 5, 100)}
                                className="h-1.5 flex-1"
                                indicatorClassName="bg-primary"
                              />
                              <span className="text-xs font-medium text-foreground">
                                {Math.min(detailsInterview.score + 5, 100)}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-lg bg-background p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Message className="text-muted-foreground" size={14} />
                              <p className="text-xs text-muted">Communication</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.min(detailsInterview.score + 3, 100)}
                                className="h-1.5 flex-1"
                                indicatorClassName="bg-primary"
                              />
                              <span className="text-xs font-medium text-foreground">
                                {Math.min(detailsInterview.score + 3, 100)}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-lg bg-background p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <MagicStar className="text-muted-foreground" size={14} />
                              <p className="text-xs text-muted">Problem Solving</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.max(detailsInterview.score - 2, 0)}
                                className="h-1.5 flex-1"
                                indicatorClassName="bg-primary"
                              />
                              <span className="text-xs font-medium text-foreground">
                                {Math.max(detailsInterview.score - 2, 0)}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-lg bg-background p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <People className="text-muted-foreground" size={14} />
                              <p className="text-xs text-muted">Culture Fit</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.min(detailsInterview.score + 7, 100)}
                                className="h-1.5 flex-1"
                                indicatorClassName="bg-primary"
                              />
                              <span className="text-xs font-medium text-foreground">
                                {Math.min(detailsInterview.score + 7, 100)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* AI Summary (shown for completed interviews) */}
                {detailsInterview.status === "Completed" && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MagicStar className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-medium text-foreground">AI Summary</h4>
                      </div>
                      <div className="ml-6 rounded-lg bg-primary-subtle border border-primary/20 p-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {detailsInterview.candidateName} demonstrated {detailsInterview.score != null && detailsInterview.score >= 80 ? "strong" : "adequate"} performance
                          in the {typeConfig[detailsInterview.type].label.toLowerCase()} interview for the {detailsInterview.jobTitle} position.
                          {detailsInterview.score != null && detailsInterview.score >= 85
                            ? " The candidate showed exceptional technical depth and clear communication throughout the session."
                            : detailsInterview.score != null && detailsInterview.score >= 70
                            ? " The candidate met expectations across most evaluation criteria with room for growth."
                            : " The candidate may benefit from additional preparation in key areas before proceeding."}
                          {" "}Interview duration was {detailsInterview.duration} minutes.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Scheduled Info (for upcoming) */}
                {detailsInterview.status === "Scheduled" && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span suppressHydrationWarning>Scheduled {timeAgo(detailsInterview.scheduledAt)}</span>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter>
                {detailsInterview.status === "Scheduled" && (
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        await cancelInterviewById(detailsInterview.id)
                        setDetailsInterview(null)
                      }}
                    >
                      <CloseSquare className="h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setRescheduleForm({ date: "", time: "", reason: "" }); setRescheduleDialogOpen(true) }}
                    >
                      <Calendar className="h-4 w-4" />
                      Reschedule
                    </Button>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      onClick={() => { setCompleteForm({ resultNotes: "", result: "PASS" }); setCompleteDialogOpen(true) }}
                    >
                      <TickCircle className="h-4 w-4" />
                      Mark Complete
                    </Button>
                  </div>
                )}
                {detailsInterview.status === "Completed" && (
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailsInterview(null)}
                    >
                      Close
                    </Button>
                  </div>
                )}
                {detailsInterview.status === "Cancelled" && (
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailsInterview(null)}
                    >
                      Close
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule Interview Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <ModalHeader>
            <DialogTitle>Reschedule Interview</DialogTitle>
            <DialogDescription>Select a new date and time for this interview.</DialogDescription>
          </ModalHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Date *</label>
                <Input type="date" value={rescheduleForm.date} onChange={(e) => setRescheduleForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Time *</label>
                <Input type="time" value={rescheduleForm.time} onChange={(e) => setRescheduleForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reason (optional)</label>
              <Input value={rescheduleForm.reason} onChange={(e) => setRescheduleForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Interviewer availability" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)}>Cancel</Button>
            <Button disabled={!rescheduleForm.date || !rescheduleForm.time} onClick={async () => {
              if (!detailsInterview) return
              const dateTime = `${rescheduleForm.date}T${rescheduleForm.time}:00`
              const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
              await rescheduleInterviewById(detailsInterview.id, { scheduledAt: dateTime, timezone, reason: rescheduleForm.reason || undefined })
              setRescheduleDialogOpen(false)
              setDetailsInterview(null)
            }}>
              <Calendar className="h-4 w-4" />
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Interview Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <ModalHeader>
            <DialogTitle>Complete Interview</DialogTitle>
            <DialogDescription>Record the interview result and add notes.</DialogDescription>
          </ModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Result *</label>
              <Select value={completeForm.result} onValueChange={(v) => setCompleteForm((f) => ({ ...f, result: v as BackendInterviewResult }))}>
                <SelectTrigger aria-label="Result">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PASS">Pass</SelectItem>
                  <SelectItem value="HOLD">Hold</SelectItem>
                  <SelectItem value="FAIL">Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <textarea
                placeholder="Add interview feedback, observations, or notes..."
                value={completeForm.resultNotes}
                onChange={(e) => setCompleteForm((f) => ({ ...f, resultNotes: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!detailsInterview) return
              await completeInterviewById(detailsInterview.id)
              await recordResultById(detailsInterview.id, { result: completeForm.result, resultNotes: completeForm.resultNotes || undefined })
              setCompleteDialogOpen(false)
              setDetailsInterview(null)
            }}>
              <TickCircle className="h-4 w-4" />
              Save & Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}

function InterviewCard({
  interview,
  onClick,
}: {
  interview: Interview
  onClick: () => void
}) {
  const completed = interview.status === "Completed"

  return (
    <Card
      className="group hover:border-primary/30 transition-all duration-200 cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Left: Avatar, Name, Job, Type */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 shrink-0" fallback={getInitials(interview.candidateName)}>
              <AvatarImage src="" alt={interview.candidateName} />
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">{interview.candidateName}</p>
              <p className="text-sm text-muted truncate">{interview.jobTitle}</p>
              <Badge variant={typeConfig[interview.type].variant} className="text-xs mt-1">
                {typeConfig[interview.type].icon}
                <span className="ml-1">{typeConfig[interview.type].label}</span>
              </Badge>
            </div>
          </div>

          {/* Center: Date, Time, Duration */}
          <div className="flex items-center flex-wrap gap-3 sm:gap-6 text-sm text-muted-foreground shrink-0">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span suppressHydrationWarning>{formatInterviewDate(interview.scheduledAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span suppressHydrationWarning>{formatInterviewTime(interview.scheduledAt)}</span>
            </div>
            <div className="text-xs text-muted">
              {interview.duration}min
            </div>
          </div>

          {/* Right: truthful outcome and status. A score only renders when a real assessment supplies one. */}
          <div className="flex items-center gap-3 shrink-0">
            {completed && interview.score != null && (
              <div className="text-right">
                <p className={cn("text-lg font-bold", getScoreColor(interview.score))}>
                  {interview.score}%
                </p>
                <p className="text-xs text-muted">Score</p>
              </div>
            )}
            <Badge variant={statusConfig[interview.status].variant}>
              {statusConfig[interview.status].label}
            </Badge>
            {completed && interview.result && interview.result !== "NOT_RECORDED" && (
              <Badge variant={interview.result === "PASS" ? "success" : interview.result === "FAIL" ? "error" : "warning"}>
                Outcome: {interview.result === "HOLD" ? "Hold" : interview.result === "PASS" ? "Pass" : interview.result === "FAIL" ? "Fail" : "Pending"}
              </Badge>
            )}
          </div>
        </div>

        {/* AI Summary (completed only) */}
        {completed && interview.score != null && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-start gap-2">
              <MagicStar className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {interview.candidateName} scored {interview.score}% — {getScoreLabel(interview.score)} performance
                  in {typeConfig[interview.type].label.toLowerCase()} interview.
                </p>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <Progress
                  value={interview.score}
                  className="h-1.5 flex-1"
                  indicatorClassName={getScoreProgressColor(interview.score)}
                />
                <span className="text-xs font-medium text-muted w-8 text-right">
                  {interview.score}/100
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
