"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import type { JobStatus, JobType, Job } from "@/types"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatCurrency, formatNumber, timeAgo } from "@/lib/utils"
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
  More,
  PauseCircle,
  Play,
  CloseSquare,
  Eye,
  Edit2,
  Trash,
  Document,
} from "iconsax-react"

const statusConfig: Record<JobStatus, { label: string; variant: "default" | "success" | "warning" | "error" | "secondary" }> = {
  Active: { label: "Active", variant: "success" },
  Paused: { label: "Paused", variant: "warning" },
  Closed: { label: "Closed", variant: "error" },
  Draft: { label: "Draft", variant: "secondary" },
}

const typeConfig: Record<JobType, { label: string; variant: "default" | "info" | "outline" | "secondary" }> = {
  "full-time": { label: "Full-time", variant: "default" },
  "part-time": { label: "Part-time", variant: "info" },
  contract: { label: "Contract", variant: "outline" },
  internship: { label: "Internship", variant: "secondary" },
}

const departments = ["Engineering", "Product", "Design", "Data", "Marketing", "HR", "Sales", "Finance"]
const locations = ["San Francisco, CA", "New York, NY", "Remote", "Austin, TX", "Seattle, WA", "London, UK"]
const jobTypes: JobType[] = ["full-time", "part-time", "contract", "internship"]
const jobStatuses: JobStatus[] = ["Active", "Paused", "Closed", "Draft"]

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
  const { jobs, addJob, updateJobStatus } = useStore()
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const activeJobs = React.useMemo(() => jobs.filter((j) => j.status === "Active").length, [jobs])
  const [departmentFilter, setDepartmentFilter] = React.useState<string>("all")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [detailsJob, setDetailsJob] = React.useState<Job | null>(null)

  const [newJob, setNewJob] = React.useState({
    title: "",
    department: "",
    location: "",
    type: "full-time" as JobType,
    salaryMin: "",
    salaryMax: "",
    description: "",
  })

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  const filteredJobs = React.useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        searchQuery === "" ||
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.location.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === "all" || job.status === statusFilter
      const matchesDepartment = departmentFilter === "all" || job.department === departmentFilter
      const matchesType = typeFilter === "all" || job.type === typeFilter
      return matchesSearch && matchesStatus && matchesDepartment && matchesType
    })
  }, [jobs, searchQuery, statusFilter, departmentFilter, typeFilter])

  const handleCreateJob = () => {
    if (!newJob.title || !newJob.department || !newJob.location || !newJob.salaryMin || !newJob.salaryMax) return
    addJob({
      title: newJob.title,
      department: newJob.department,
      location: newJob.location,
      type: newJob.type,
      salaryMin: Number(newJob.salaryMin),
      salaryMax: Number(newJob.salaryMax),
      description: newJob.description,
      status: "Draft",
    })
    setCreateDialogOpen(false)
    setNewJob({ title: "", department: "", location: "", type: "full-time", salaryMin: "", salaryMax: "", description: "" })
  }

  // activeJobs is defined above with useMemo
  const totalApplicants = jobs.reduce((sum, j) => sum + j.applicants, 0)

  return (
    <AppLayout
      title="Jobs"
      description={`${filteredJobs.length} positions · ${activeJobs} active · ${formatNumber(totalApplicants)} applicants`}
      actions={
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Add className="h-4 w-4" />
              Create Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <ModalHeader>
              <DialogTitle>Create New Job</DialogTitle>
              <DialogDescription>Add a new job opening to start recruiting.</DialogDescription>
            </ModalHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Job Title *</label>
                  <Input
                    placeholder="e.g. Senior Engineer"
                    value={newJob.title}
                    onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Department *</label>
                  <Select value={newJob.department} onValueChange={(v) => setNewJob((p) => ({ ...p, department: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Location *</label>
                  <Select value={newJob.location} onValueChange={(v) => setNewJob((p) => ({ ...p, location: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Job Type</label>
                  <Select value={newJob.type} onValueChange={(v) => setNewJob((p) => ({ ...p, type: v as JobType }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map((t) => (
                        <SelectItem key={t} value={t}>{typeConfig[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Salary Min (USD) *</label>
                  <Input
                    type="number"
                    placeholder="80000"
                    value={newJob.salaryMin}
                    onChange={(e) => setNewJob((p) => ({ ...p, salaryMin: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Salary Max (USD) *</label>
                  <Input
                    type="number"
                    placeholder="120000"
                    value={newJob.salaryMax}
                    onChange={(e) => setNewJob((p) => ({ ...p, salaryMax: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  placeholder="Describe the role, responsibilities, and requirements..."
                  value={newJob.description}
                  onChange={(e) => setNewJob((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateJob} disabled={!newJob.title || !newJob.department || !newJob.location || !newJob.salaryMin || !newJob.salaryMax}>
                <Add className="h-4 w-4" />
                Create Job
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <SearchNormal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Search jobs by title, department, or location..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {jobStatuses.map((s) => (
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
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {jobTypes.map((t) => (
                  <SelectItem key={t} value={t}>{typeConfig[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* View Toggle & Content */}
      <Tabs defaultValue="grid" className="animate-fade-in">
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
          <span className="text-sm text-muted">{filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Grid View */}
        <TabsContent value="grid">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-8 w-8 text-muted" />}
              title="No jobs found"
              description={searchQuery || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all"
                ? "Try adjusting your filters to see more results."
                : "Get started by creating your first job opening."
              }
              action={
                (searchQuery || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all") ? (
                  <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setDepartmentFilter("all"); setTypeFilter("all") }}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Add className="h-4 w-4" />
                    Create Job
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredJobs.map((job) => (
                <Card
                  key={job.id}
                  className="group hover:border-primary/30 transition-all duration-200 cursor-pointer"
                  onClick={() => setDetailsJob(job)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{job.title}</CardTitle>
                        <CardDescription className="flex items-center gap-1.5 mt-1">
                          <Buildings className="h-3 w-3 shrink-0" />
                          {job.department}
                        </CardDescription>
                      </div>
                      <Badge variant={statusConfig[job.status].variant} className="shrink-0">
                        {statusConfig[job.status].label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Location className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DollarSquare className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatCurrency(job.salaryMin)} – {formatCurrency(job.salaryMax)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>Posted {timeAgo(job.createdAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 flex items-center justify-between">
                    <Badge variant={typeConfig[job.type].variant}>
                      {typeConfig[job.type].label}
                    </Badge>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <People className="h-3.5 w-3.5" />
                      <span>{job.applicants}</span>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table">
          {isLoading ? (
            <Card>
              <TableSkeleton />
            </Card>
          ) : filteredJobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-8 w-8 text-muted" />}
              title="No jobs found"
              description={searchQuery || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all"
                ? "Try adjusting your filters to see more results."
                : "Get started by creating your first job opening."
              }
              action={
                (searchQuery || statusFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all") ? (
                  <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setDepartmentFilter("all"); setTypeFilter("all") }}>
                    Clear Filters
                  </Button>
                ) : (
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Add className="h-4 w-4" />
                    Create Job
                  </Button>
                )
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
                    <TableHead className="text-center">Applicants</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Posted</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id} className="cursor-pointer" onClick={() => setDetailsJob(job)}>
                      <TableCell>
                        <span className="font-medium text-foreground">{job.title}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{job.department}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{job.location}</TableCell>
                      <TableCell>
                        <Badge variant={typeConfig[job.type].variant} className="text-xs">
                          {typeConfig[job.type].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {formatCurrency(job.salaryMin)} – {formatCurrency(job.salaryMax)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium text-foreground">{job.applicants}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[job.status].variant}>
                          {statusConfig[job.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                        {timeAgo(job.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (job.status === "Active") updateJobStatus(job.id, "Paused")
                            else if (job.status === "Paused") updateJobStatus(job.id, "Active")
                            else if (job.status === "Draft") updateJobStatus(job.id, "Active")
                          }}
                        >
                          {job.status === "Active" ? (
                            <PauseCircle className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Play className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Job Details Dialog */}
      <Dialog open={!!detailsJob} onOpenChange={(open) => !open && setDetailsJob(null)}>
        <DialogContent className="max-w-xl">
          {detailsJob && (
            <>
              <ModalHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{detailsJob.title}</DialogTitle>
                    <DialogDescription className="mt-1">{detailsJob.department} · {detailsJob.location}</DialogDescription>
                  </div>
                  <Badge variant={statusConfig[detailsJob.status].variant} className="shrink-0">
                    {statusConfig[detailsJob.status].label}
                  </Badge>
                </div>
              </ModalHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-background p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Briefcase className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Type</p>
                    </div>
                    <Badge variant={typeConfig[detailsJob.type].variant}>{typeConfig[detailsJob.type].label}</Badge>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <People className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Applicants</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{detailsJob.applicants}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <DollarSquare className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Salary Range</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{formatCurrency(detailsJob.salaryMin)} – {formatCurrency(detailsJob.salaryMax)}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Posted</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{timeAgo(detailsJob.createdAt)}</p>
                  </div>
                </div>
                {detailsJob.description && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Document className="text-muted-foreground" size={14} />
                      <p className="text-sm font-medium text-foreground">Description</p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed ml-5">{detailsJob.description}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <div className="flex items-center gap-2 w-full">
                  {detailsJob.status !== "Closed" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { updateJobStatus(detailsJob.id, "Closed"); setDetailsJob(null) }}
                    >
                      <CloseSquare className="h-4 w-4" />
                      Close Position
                    </Button>
                  )}
                  <div className="flex-1" />
                  {detailsJob.status === "Active" ? (
                    <Button variant="outline" size="sm" onClick={() => updateJobStatus(detailsJob.id, "Paused")}>
                      <PauseCircle className="h-4 w-4" />
                      Pause
                    </Button>
                  ) : detailsJob.status === "Paused" ? (
                    <Button size="sm" onClick={() => updateJobStatus(detailsJob.id, "Active")}>
                      <Play className="h-4 w-4" />
                      Activate
                    </Button>
                  ) : detailsJob.status === "Draft" ? (
                    <Button size="sm" onClick={() => updateJobStatus(detailsJob.id, "Active")}>
                      <Play className="h-4 w-4" />
                      Publish
                    </Button>
                  ) : null}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
