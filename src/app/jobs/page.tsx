"use client"

import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { formatCurrency, timeAgo } from "@/lib/utils"
import { getJobs, getJobById, createJob, updateJob, publishJob, closeJob, reopenJob, pauseJob, resumeJob, archiveJob } from "@/lib/api/jobs.api"
import { resolveJobStatusFilter } from "@/lib/jobs-view"
import type { JobListDto } from "@/lib/api/types"
import type { CreateJobRequest, UpdateJobRequest } from "@/lib/api/jobs.api"
import {
  SearchNormal,
  Add,
  Grid5,
  Menu,
  Briefcase,
  Location,
  DollarSquare,
  People,
  Calendar,
  Buildings,
  DirectLeft,
  DirectRight,
  RotateLeft,
  InfoCircle,
  More,
  TickCircle,
  CloseCircle,
  Pause,
  Edit2,
  Archive,
} from "iconsax-react"

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "secondary" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PENDING_APPROVAL: { label: "Pending Approval", variant: "warning" },
  APPROVED: { label: "Approved", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  PUBLISHED: { label: "Active", variant: "success" },
  PAUSED: { label: "Paused", variant: "warning" },
  CLOSED: { label: "Closed", variant: "error" },
  FILLED: { label: "Filled", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "error" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
}

const typeConfig: Record<string, { label: string; variant: "default" | "info" | "outline" | "secondary" }> = {
  FULL_TIME: { label: "Full-time", variant: "default" },
  PART_TIME: { label: "Part-time", variant: "info" },
  CONTRACT: { label: "Contract", variant: "outline" },
  TEMPORARY: { label: "Temporary", variant: "secondary" },
  INTERNSHIP: { label: "Internship", variant: "secondary" },
  VOLUNTEER: { label: "Volunteer", variant: "secondary" },
  FREELANCE: { label: "Freelance", variant: "outline" },
  APPRENTICESHIP: { label: "Apprenticeship", variant: "secondary" },
  OTHER: { label: "Other", variant: "outline" },
}

const LIMIT = 20

function JobCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Skeleton className="h-8 w-full" />
      </CardFooter>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = React.useState<JobListDto[]>([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [fetchKey, setFetchKey] = React.useState(0)

  const [searchInput, setSearchInput] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [departmentFilter, setDepartmentFilter] = React.useState<string>("all")
  const [view, setView] = React.useState<"grid" | "table">("grid")
  // Default view is Active: closed/filled/cancelled/archived jobs are hidden
  // unless the user opens the History view.
  const [jobScope, setJobScope] = React.useState<"active" | "history">("active")

  const [detailsJobId, setDetailsJobId] = React.useState<string | null>(null)
  const [detailsJob, setDetailsJob] = React.useState<JobListDto | null>(null)
  const [detailsError, setDetailsError] = React.useState<string | null>(null)

  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [createForm, setCreateForm] = React.useState<CreateJobRequest>({
    title: "",
    employmentType: "FULL_TIME",
    workplaceType: "HYBRID",
    experienceLevel: "MID",
    description: "",
  })
  const [createSubmitting, setCreateSubmitting] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const [editMode, setEditMode] = React.useState(false)
  const [editForm, setEditForm] = React.useState<UpdateJobRequest>({})
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  const handleJobAction = React.useCallback(async (jobId: string, action: string) => {
    setActionLoading(`${jobId}-${action}`)
    try {
      switch (action) {
        case "publish":
          await publishJob(jobId)
          break
        case "close":
          await closeJob(jobId)
          break
        case "pause":
          await pauseJob(jobId)
          break
        case "resume":
          await resumeJob(jobId)
          break
        case "archive":
          await archiveJob(jobId)
          break
        case "reopen":
          await reopenJob(jobId)
          // Reopening moves the job back to DRAFT (active workflow); switch the
          // view so it is immediately visible again.
          setJobScope("active")
          break
      }
      setDetailsJobId(null)
      setDetailsJob(null)
      setEditMode(false)
      setFetchKey((k) => k + 1)
    } catch {
      // action errors are handled by the API
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleUpdateJob = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!detailsJobId) return
    setActionLoading(`${detailsJobId}-update`)
    try {
      await updateJob(detailsJobId, editForm)
      setEditMode(false)
      setEditForm({})
      const updated = await getJobById(detailsJobId)
      setDetailsJob(updated)
      setFetchKey((k) => k + 1)
    } catch {
      // handled by API
    } finally {
      setActionLoading(null)
    }
  }, [detailsJobId, editForm])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setError(null)

      const params: Record<string, string | number | string[] | undefined> = { page, limit: LIMIT }
      if (debouncedSearch) params.search = debouncedSearch
      params.status = resolveJobStatusFilter(jobScope, statusFilter === "all" ? null : statusFilter)
      if (typeFilter !== "all") params.employmentType = [typeFilter]

      try {
        const result = await getJobs(params as Parameters<typeof getJobs>[0])
        if (!cancelled) {
          setJobs(result.data)
          setTotal(result.meta.total)
          setTotalPages(result.meta.totalPages)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const apiErr = err as { message?: string; statusCode?: number }
          if (!apiErr.message || apiErr.message === "Failed to fetch") {
            setError("We couldn\u2019t connect to the TalentAI server. Confirm that the backend is running and try again.")
          } else if (apiErr.statusCode === 401) {
            setError("Your session has expired. Please sign in again.")
          } else {
            setError(apiErr.message || "Failed to load jobs. Please try again.")
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, debouncedSearch, statusFilter, typeFilter, jobScope, fetchKey])

  React.useEffect(() => {
    if (!detailsJobId) return
    let cancelled = false

    getJobById(detailsJobId).then((job) => {
      if (!cancelled) setDetailsJob(job)
    }).catch((err: unknown) => {
      if (!cancelled) {
        const apiErr = err as { message?: string; statusCode?: number }
        if (apiErr.statusCode === 404) setDetailsError("Job not found.")
        else if (apiErr.statusCode === 403) setDetailsError("You don\u2019t have permission to view this job.")
        else setDetailsError(apiErr.message || "Failed to load job details.")
      }
    })

    return () => { cancelled = true }
  }, [detailsJobId])

  const departmentOptions = React.useMemo(() => {
    const depts = new Set((jobs || []).map((j) => j.department?.name).filter((d): d is string => !!d))
    return ["all", ...Array.from(depts).sort()]
  }, [jobs])

  const displayJobs = React.useMemo(() => {
    const jobsArray = jobs || []
    if (departmentFilter === "all") return jobsArray
    return jobsArray.filter((j) => j.department?.name === departmentFilter)
  }, [jobs, departmentFilter])

  const activeCount = React.useMemo(() => (displayJobs || []).filter((j) => j.status === "PUBLISHED").length, [displayJobs])

  const openDetails = React.useCallback((jobId: string) => {
    setDetailsJobId(jobId)
    setDetailsJob(null)
    setDetailsError(null)
  }, [])

  const handleCreateJob = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateSubmitting(true)
    setCreateError(null)
    try {
      await createJob(createForm)
      setShowCreateDialog(false)
      setCreateForm({ title: "", employmentType: "FULL_TIME", workplaceType: "HYBRID", experienceLevel: "MID", description: "" })
      setFetchKey((k) => k + 1)
    } catch (err: unknown) {
      const apiErr = err as { message?: string }
      setCreateError(apiErr.message || "Failed to create job. Please try again.")
    } finally {
      setCreateSubmitting(false)
    }
  }, [createForm])

  return (
    <AppLayout
      title="Jobs"
      description={error ? "" : `${total} position${total !== 1 ? "s" : ""}${activeCount ? ` \u00B7 ${activeCount} active` : ""}`}
      actions={
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setCreateError(null) }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Add className="h-4 w-4" />
              Create Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <ModalHeader>
              <DialogTitle>Create New Job</DialogTitle>
              <DialogDescription>Fill in the details to create a new job posting.</DialogDescription>
            </ModalHeader>
            <form onSubmit={handleCreateJob} className="space-y-4">
              {createError && (
                <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">{createError}</div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Job Title *</label>
                <Input
                  placeholder="e.g. Senior Software Engineer"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Type *</label>
                  <Select value={createForm.employmentType} onValueChange={(v) => setCreateForm((f) => ({ ...f, employmentType: v as CreateJobRequest["employmentType"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full-time</SelectItem>
                      <SelectItem value="PART_TIME">Part-time</SelectItem>
                      <SelectItem value="CONTRACT">Contract</SelectItem>
                      <SelectItem value="TEMPORARY">Temporary</SelectItem>
                      <SelectItem value="INTERNSHIP">Internship</SelectItem>
                      <SelectItem value="FREELANCE">Freelance</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Workplace *</label>
                  <Select value={createForm.workplaceType} onValueChange={(v) => setCreateForm((f) => ({ ...f, workplaceType: v as CreateJobRequest["workplaceType"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ON_SITE">On-site</SelectItem>
                      <SelectItem value="REMOTE">Remote</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                      <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Level *</label>
                  <Select value={createForm.experienceLevel} onValueChange={(v) => setCreateForm((f) => ({ ...f, experienceLevel: v as CreateJobRequest["experienceLevel"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTRY">Entry</SelectItem>
                      <SelectItem value="JUNIOR">Junior</SelectItem>
                      <SelectItem value="MID">Mid</SelectItem>
                      <SelectItem value="SENIOR">Senior</SelectItem>
                      <SelectItem value="LEAD">Lead</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                      <SelectItem value="DIRECTOR">Director</SelectItem>
                      <SelectItem value="EXECUTIVE">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Description *</label>
                <textarea
                  placeholder="Describe the role, responsibilities, and requirements..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  required
                  rows={5}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createSubmitting}>
                  {createSubmitting ? "Creating..." : "Create Job"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 animate-fade-in">
        {/* Active / History scope */}
        <Tabs
          value={jobScope}
          onValueChange={(v) => {
            setJobScope(v as "active" | "history")
            setStatusFilter("all")
            setPage(1)
          }}
          className="w-fit"
        >
          <TabsList>
            <TabsTrigger value="active" className="gap-1.5">
              <TickCircle className="h-4 w-4" />
              Active
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <Archive className="h-4 w-4" />
              Closed &amp; Archived
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <SearchNormal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Search jobs by title\u2026"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(["PUBLISHED", "PAUSED", "CLOSED", "DRAFT", "CANCELLED", "FILLED"] as const).map((s) => (
                  <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departmentOptions.slice(1).map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"] as const).map((t) => (
                  <SelectItem key={t} value={t}>{typeConfig[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error ? (
        <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-6 mb-6 text-center animate-fade-in">
          <InfoCircle className="h-8 w-8 text-error mx-auto mb-3" />
          <p className="text-sm text-error font-medium mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setFetchKey((k) => k + 1)}>
            <RotateLeft className="h-4 w-4 mr-1.5" />
            Retry
          </Button>
        </div>
      ) : (
        <>
          {/* View Toggle */}
          <Tabs value={view} onValueChange={(v) => setView(v as "grid" | "table")} className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="grid" className="gap-1.5">
                  <Grid5 className="h-4 w-4" />
                  Grid
                </TabsTrigger>
                <TabsTrigger value="table" className="gap-1.5">
                  <Menu className="h-4 w-4" />
                  Table
                </TabsTrigger>
              </TabsList>
              <span className="text-sm text-muted">{displayJobs.length} job{displayJobs.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Grid View */}
            <TabsContent value="grid">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <JobCardSkeleton key={i} />
                  ))}
                </div>
              ) : displayJobs.length === 0 ? (
                <EmptyState
                  icon={<Briefcase className="h-8 w-8 text-muted" />}
                  title="No jobs found"
                  description={searchInput || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all"
                    ? "Try adjusting your filters to see more results."
                    : "No jobs have been created yet."
                  }
                  action={
                    (searchInput || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all") ? (
                      <Button variant="outline" onClick={() => { setSearchInput(""); setDebouncedSearch(""); setStatusFilter("all"); setDepartmentFilter("all"); setTypeFilter("all") }}>
                        Clear Filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {displayJobs.map((job) => (
                    <Card
                      key={job.id}
                      className="group hover:border-primary/30 transition-all duration-200"
                    >
                      <CardHeader className="pb-3" onClick={() => openDetails(job.id)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base truncate">{job.title}</CardTitle>
                            <CardDescription className="flex items-center gap-1.5 mt-1">
                              <Buildings className="h-3 w-3 shrink-0" />
                              {job.department?.name ?? "No department"}
                            </CardDescription>
                          </div>
                          <Badge variant={statusConfig[job.status]?.variant ?? "secondary"} className="shrink-0">
                            {statusConfig[job.status]?.label ?? job.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3 cursor-pointer" onClick={() => openDetails(job.id)}>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Location className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{job.location ? `${job.location.name}, ${job.location.city ?? job.location.countryCode}` : "Remote / Not specified"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <DollarSquare className="h-3.5 w-3.5 shrink-0" />
                            {job.salaryMin != null && job.salaryMax != null ? (
                              <span>{formatCurrency(job.salaryMin)} \u2013 {formatCurrency(job.salaryMax)}</span>
                            ) : job.salaryMin != null ? (
                              <span>From {formatCurrency(job.salaryMin)}</span>
                            ) : (
                              <span>Salary not specified</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span>Posted {timeAgo(new Date(job.createdAt))}</span>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0 flex items-center justify-between">
                        <Badge variant={typeConfig[job.employmentType]?.variant ?? "secondary"}>
                          {typeConfig[job.employmentType]?.label ?? job.employmentType}
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
                            <People className="h-3.5 w-3.5" />
                            <span>{job.numberOfOpenings} opening{job.numberOfOpenings !== 1 ? "s" : ""}</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                <More className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetails(job.id)}>
                                <InfoCircle className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {(job.status === "DRAFT" || job.status === "APPROVED" || job.status === "SCHEDULED") && (
                                <DropdownMenuItem onClick={() => handleJobAction(job.id, "publish")} disabled={actionLoading === `${job.id}-publish`}>
                                  <TickCircle className="h-4 w-4 mr-2" />
                                  Publish
                                </DropdownMenuItem>
                              )}
                              {job.status === "PUBLISHED" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleJobAction(job.id, "pause")} disabled={actionLoading === `${job.id}-pause`}>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pause
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleJobAction(job.id, "close")} disabled={actionLoading === `${job.id}-close`}>
                                    <CloseCircle className="h-4 w-4 mr-2" />
                                    Close
                                  </DropdownMenuItem>
                                </>
                              )}
                              {job.status === "PAUSED" && (
                                <DropdownMenuItem onClick={() => handleJobAction(job.id, "resume")} disabled={actionLoading === `${job.id}-resume`}>
                                  <TickCircle className="h-4 w-4 mr-2" />
                                  Resume
                                </DropdownMenuItem>
                              )}
                              {(job.status === "CLOSED" || job.status === "CANCELLED" || job.status === "FILLED" || job.status === "ARCHIVED") && (
                                <>
                                  {(job.status === "CLOSED" || job.status === "CANCELLED" || job.status === "ARCHIVED") && (
                                    <DropdownMenuItem onClick={() => handleJobAction(job.id, "reopen")} disabled={actionLoading === `${job.id}-reopen`}>
                                      <TickCircle className="h-4 w-4 mr-2" />
                                      Reopen
                                    </DropdownMenuItem>
                                  )}
                                  {job.status !== "ARCHIVED" && (
                                    <DropdownMenuItem onClick={() => handleJobAction(job.id, "archive")} disabled={actionLoading === `${job.id}-archive`}>
                                      <Archive className="h-4 w-4 mr-2" />
                                      Archive
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { openDetails(job.id); setEditMode(true); setEditForm({ title: job.title, description: job.description || "", numberOfOpenings: job.numberOfOpenings, salaryMin: job.salaryMin ?? undefined, salaryMax: job.salaryMax ?? undefined }) }}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {displayJobs.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <DirectLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      Next
                      <DirectRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Table View */}
            <TabsContent value="table">
              {isLoading ? (
                <Card>
                  <TableSkeleton />
                </Card>
              ) : displayJobs.length === 0 ? (
                <EmptyState
                  icon={<Briefcase className="h-8 w-8 text-muted" />}
                  title="No jobs found"
                  description={searchInput || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all"
                    ? "Try adjusting your filters to see more results."
                    : "No jobs have been created yet."
                  }
                  action={
                    (searchInput || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all") ? (
                      <Button variant="outline" onClick={() => { setSearchInput(""); setDebouncedSearch(""); setStatusFilter("all"); setDepartmentFilter("all"); setTypeFilter("all") }}>
                        Clear Filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Card>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job Title</TableHead>
                          <TableHead className="hidden md:table-cell">Department</TableHead>
                          <TableHead className="hidden lg:table-cell">Location</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="hidden sm:table-cell">Salary</TableHead>
                          <TableHead className="text-center">Openings</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden lg:table-cell">Posted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayJobs.map((job) => (
                          <TableRow key={job.id} className="cursor-pointer" onClick={() => openDetails(job.id)}>
                            <TableCell>
                              <span className="font-medium text-foreground">{job.title}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">{job.department?.name ?? "\u2014"}</TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground">
                              {job.location ? `${job.location.name}, ${job.location.city ?? job.location.countryCode}` : "\u2014"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={typeConfig[job.employmentType]?.variant ?? "secondary"} className="text-xs">
                                {typeConfig[job.employmentType]?.label ?? job.employmentType}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground">
                              {job.salaryMin != null && job.salaryMax != null
                                ? `${formatCurrency(job.salaryMin)} \u2013 ${formatCurrency(job.salaryMax)}`
                                : job.salaryMin != null
                                  ? `From ${formatCurrency(job.salaryMin)}`
                                  : "\u2014"}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-medium text-foreground">{job.numberOfOpenings}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusConfig[job.status]?.variant ?? "secondary"}>
                                {statusConfig[job.status]?.label ?? job.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                              {timeAgo(new Date(job.createdAt))}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                    <More className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openDetails(job.id)}>
                                    <InfoCircle className="h-4 w-4 mr-2" />
                                    View
                                  </DropdownMenuItem>
                                  {(job.status === "DRAFT" || job.status === "APPROVED" || job.status === "SCHEDULED") && (
                                    <DropdownMenuItem onClick={() => handleJobAction(job.id, "publish")}>
                                      <TickCircle className="h-4 w-4 mr-2" />
                                      Publish
                                    </DropdownMenuItem>
                                  )}
                                  {job.status === "PUBLISHED" && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleJobAction(job.id, "pause")}>
                                        <Pause className="h-4 w-4 mr-2" />
                                        Pause
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleJobAction(job.id, "close")}>
                                        <CloseCircle className="h-4 w-4 mr-2" />
                                        Close
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {job.status === "PAUSED" && (
                                    <DropdownMenuItem onClick={() => handleJobAction(job.id, "resume")}>
                                      <TickCircle className="h-4 w-4 mr-2" />
                                      Resume
                                    </DropdownMenuItem>
                                  )}
                                  {(job.status === "CLOSED" || job.status === "CANCELLED" || job.status === "ARCHIVED") && (
                                    <DropdownMenuItem onClick={() => handleJobAction(job.id, "reopen")}>
                                      <TickCircle className="h-4 w-4 mr-2" />
                                      Reopen
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Pagination */}
              {displayJobs.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <DirectLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      Next
                      <DirectRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Job Details Dialog */}
      <Dialog open={!!detailsJobId} onOpenChange={(open) => { if (!open) { setDetailsJobId(null); setDetailsJob(null); setDetailsError(null); setEditMode(false); setEditForm({}) } }}>
        <DialogContent className="max-w-xl">
          {detailsError ? (
            <div className="py-6 text-center">
              <InfoCircle className="h-8 w-8 text-error mx-auto mb-3" />
              <p className="text-sm text-error font-medium mb-3">{detailsError}</p>
              <Button variant="outline" size="sm" onClick={() => detailsJobId && openDetails(detailsJobId)}>
                <RotateLeft className="h-4 w-4 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : !detailsJob ? (
            <div className="py-6 text-center">
              <Skeleton className="h-5 w-3/4 mx-auto mb-4" />
              <Skeleton className="h-4 w-1/2 mx-auto mb-6" />
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          ) : editMode ? (
            <>
              <ModalHeader>
                <DialogTitle>Edit Job</DialogTitle>
                <DialogDescription>Update the job details below.</DialogDescription>
              </ModalHeader>
              <form onSubmit={handleUpdateJob} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Job Title</label>
                  <Input value={editForm.title ?? detailsJob.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Openings</label>
                    <Input type="number" min={1} value={editForm.numberOfOpenings ?? detailsJob.numberOfOpenings} onChange={(e) => setEditForm((f) => ({ ...f, numberOfOpenings: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Salary Currency</label>
                    <Input value={editForm.salaryCurrency ?? detailsJob.salaryCurrency ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, salaryCurrency: e.target.value }))} placeholder="USD" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Salary Min</label>
                    <Input type="number" min={0} value={editForm.salaryMin ?? detailsJob.salaryMin ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, salaryMin: e.target.value ? parseInt(e.target.value) : undefined }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Salary Max</label>
                    <Input type="number" min={0} value={editForm.salaryMax ?? detailsJob.salaryMax ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, salaryMax: e.target.value ? parseInt(e.target.value) : undefined }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" rows={5} value={editForm.description ?? detailsJob.description ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setEditMode(false); setEditForm({}) }}>Cancel</Button>
                  <Button type="submit" disabled={actionLoading === `${detailsJobId}-update`}>{actionLoading === `${detailsJobId}-update` ? "Saving..." : "Save Changes"}</Button>
                </div>
              </form>
            </>
          ) : (
            <>
              <ModalHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{detailsJob.title}</DialogTitle>
                    <DialogDescription className="mt-1">
                      Created {timeAgo(new Date(detailsJob.createdAt))}
                    </DialogDescription>
                  </div>
                  <Badge variant={statusConfig[detailsJob.status]?.variant ?? "secondary"} className="shrink-0">
                    {statusConfig[detailsJob.status]?.label ?? detailsJob.status}
                  </Badge>
                </div>
              </ModalHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-background border border-border p-3">
                    <p className="text-xs text-muted mb-1">Type</p>
                    <Badge variant={typeConfig[detailsJob.employmentType]?.variant ?? "secondary"}>
                      {typeConfig[detailsJob.employmentType]?.label ?? detailsJob.employmentType}
                    </Badge>
                  </div>
                  <div className="rounded-lg bg-background border border-border p-3">
                    <p className="text-xs text-muted mb-1">Openings</p>
                    <p className="text-sm font-medium text-foreground">{detailsJob.numberOfOpenings}</p>
                  </div>
                  <div className="rounded-lg bg-background border border-border p-3">
                    <p className="text-xs text-muted mb-1">Salary Range</p>
                    <p className="text-sm font-medium text-foreground">
                      {detailsJob.salaryMin != null && detailsJob.salaryMax != null
                        ? `${formatCurrency(detailsJob.salaryMin)} \u2013 ${formatCurrency(detailsJob.salaryMax)}`
                        : detailsJob.salaryMin != null
                          ? `From ${formatCurrency(detailsJob.salaryMin)}`
                          : "Not specified"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-background border border-border p-3">
                    <p className="text-xs text-muted mb-1">Posted</p>
                    <p className="text-sm font-medium text-foreground">{timeAgo(new Date(detailsJob.createdAt))}</p>
                  </div>
                </div>
                {detailsJob.description && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Description</p>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{detailsJob.description}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
                <Button variant="outline" size="sm" onClick={() => { setEditMode(true); setEditForm({ title: detailsJob.title, description: detailsJob.description || "", numberOfOpenings: detailsJob.numberOfOpenings, salaryMin: detailsJob.salaryMin ?? undefined, salaryMax: detailsJob.salaryMax ?? undefined }) }}>
                  <Edit2 className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
                {(detailsJob.status === "DRAFT" || detailsJob.status === "APPROVED" || detailsJob.status === "SCHEDULED") && (
                  <Button size="sm" onClick={() => handleJobAction(detailsJob.id, "publish")} disabled={actionLoading === `${detailsJob.id}-publish`}>
                    <TickCircle className="h-4 w-4 mr-1.5" />
                    {actionLoading === `${detailsJob.id}-publish` ? "Publishing..." : "Publish"}
                  </Button>
                )}
                {detailsJob.status === "PUBLISHED" && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleJobAction(detailsJob.id, "pause")} disabled={actionLoading === `${detailsJob.id}-pause`}>
                      <Pause className="h-4 w-4 mr-1.5" />
                      Pause
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleJobAction(detailsJob.id, "close")} disabled={actionLoading === `${detailsJob.id}-close`}>
                      <CloseCircle className="h-4 w-4 mr-1.5" />
                      Close
                    </Button>
                  </>
                )}
                {detailsJob.status === "PAUSED" && (
                  <Button size="sm" onClick={() => handleJobAction(detailsJob.id, "resume")} disabled={actionLoading === `${detailsJob.id}-resume`}>
                    <TickCircle className="h-4 w-4 mr-1.5" />
                    Resume
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
