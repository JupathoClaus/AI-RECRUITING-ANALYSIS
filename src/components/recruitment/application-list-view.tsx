"use client"

import * as React from "react"
import { BrainCircuit, ClipboardCheck, RefreshCw } from "lucide-react"
import { ApplicationFilters, type ApplicationFilterValues } from "@/components/recruitment/application-filters"
import { ApplicationTable, type ApplicationSortField } from "@/components/recruitment/application-table"
import { Pagination } from "@/components/recruitment/pagination"
import { ScreeningBatchProgress } from "@/components/recruitment/screening-batch-progress"
import { TableSkeleton } from "@/components/recruitment/table-skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { fetchApplications, type ApplicationListResponse, type ApplicationQueryParams } from "@/lib/api/applications.api"
import { getJobPipeline, getJobs, type PipelineStageDto } from "@/lib/api/jobs.api"
import { getBulkScreeningProgress, startBulkScreening, type BulkBatchProgress } from "@/lib/api/ai-screening.api"
import { bulkAssignAssessment, getBulkAssignJob, listAssessments, type AssessmentDto } from "@/lib/api/assessments.api"
import type { ApplicationStatus } from "@/types"
import type { JobListDto, PaginationMeta } from "@/lib/api/types"

const PAGE_SIZE = 20

const EMPTY_META: PaginationMeta = { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 }

const EMPTY_FILTERS: ApplicationFilterValues = {
  search: "",
  jobSearch: "",
  jobId: "",
  status: "",
  source: "",
  stageId: "",
  submittedFrom: "",
  submittedTo: "",
}

interface BulkAssignJobState {
  jobId: string
  state: string
  progress?: unknown
  result?: { assigned: number; skipped: number; failed: number } | null
  failedReason?: string | null
}

interface ApplicationListViewProps {
  jobId?: string
  showJobColumn?: boolean
  onApplicationCountChange?: (count: number) => void
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "We couldn't load applications. Please try again."
}

function isFinishedBatch(batch: BulkBatchProgress) {
  return batch.status === "COMPLETED" || batch.status === "FAILED" || batch.status === "CANCELLED"
}

function isAssignFinished(job: BulkAssignJobState) {
  return job.state === "completed" || job.state === "failed"
}

export function ApplicationListView({ jobId, showJobColumn = true, onApplicationCountChange }: ApplicationListViewProps) {
  const [filters, setFilters] = React.useState<ApplicationFilterValues>(EMPTY_FILTERS)
  const [applications, setApplications] = React.useState<ApplicationListResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [sortBy, setSortBy] = React.useState<ApplicationSortField>("submittedAt")
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc")
  const [jobOptions, setJobOptions] = React.useState<JobListDto[]>([])
  const [stages, setStages] = React.useState<PipelineStageDto[]>([])
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [confirmScreeningOpen, setConfirmScreeningOpen] = React.useState(false)
  const [screeningBusy, setScreeningBusy] = React.useState(false)
  const [screeningError, setScreeningError] = React.useState<string | null>(null)
  const [screeningBatch, setScreeningBatch] = React.useState<BulkBatchProgress | null>(null)
  const [refreshNonce, setRefreshNonce] = React.useState(0)
  const [confirmAssignOpen, setConfirmAssignOpen] = React.useState(false)
  const [assignBusy, setAssignBusy] = React.useState(false)
  const [assignError, setAssignError] = React.useState<string | null>(null)
  const [assignAssessments, setAssignAssessments] = React.useState<AssessmentDto[]>([])
  const [assignAssessmentsLoading, setAssignAssessmentsLoading] = React.useState(false)
  const [assignVersionId, setAssignVersionId] = React.useState("")
  const [assignJob, setAssignJob] = React.useState<BulkAssignJobState | null>(null)

  const effectiveJobId = jobId || filters.jobId

  React.useEffect(() => {
    if (jobId) return

    const timeout = window.setTimeout(() => {
      getJobs({ page: 1, limit: 25, search: filters.jobSearch || undefined, sortBy: "title", sortOrder: "asc" })
        .then((response) => setJobOptions(response.data))
        .catch(() => setJobOptions([]))
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [filters.jobSearch, jobId])

  React.useEffect(() => {
    if (!effectiveJobId) {
      setStages([])
      return
    }

    let active = true
    getJobPipeline(effectiveJobId)
      .then((pipeline) => {
        if (active) setStages(pipeline.stages)
      })
      .catch(() => {
        if (active) setStages([])
      })

    return () => { active = false }
  }, [effectiveJobId])

  React.useEffect(() => {
    let active = true
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError(null)

      const params: ApplicationQueryParams = {
        page,
        limit: PAGE_SIZE,
        search: filters.search || undefined,
        jobId: effectiveJobId ? [effectiveJobId] : undefined,
        status: filters.status ? [filters.status as ApplicationStatus] : undefined,
        source: filters.source ? [filters.source] : undefined,
        stageId: filters.stageId ? [filters.stageId] : undefined,
        submittedFrom: filters.submittedFrom || undefined,
        submittedTo: filters.submittedTo || undefined,
        sortBy,
        sortOrder,
      }

      try {
        const response = await fetchApplications(params)
        if (!active) return
        setApplications(response)
        onApplicationCountChange?.(response.meta.total)
      } catch (requestError) {
        if (!active) return
        setApplications(null)
        setError(getErrorMessage(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [effectiveJobId, filters.search, filters.source, filters.stageId, filters.status, filters.submittedFrom, filters.submittedTo, onApplicationCountChange, page, refreshNonce, sortBy, sortOrder])

  React.useEffect(() => {
    if (!screeningBatch || isFinishedBatch(screeningBatch)) return

    let active = true
    const poll = async () => {
      try {
        const updated = await getBulkScreeningProgress(screeningBatch.batchId)
        if (!active) return
        setScreeningBatch(updated)
        if (isFinishedBatch(updated)) setRefreshNonce((current) => current + 1)
      } catch {
        if (active) setScreeningError("We couldn't refresh the screening batch status. You can retry from the applications list.")
      }
    }

    const timer = window.setInterval(poll, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [screeningBatch])

  React.useEffect(() => {
    if (!assignJob || isAssignFinished(assignJob)) return

    let active = true
    const poll = async () => {
      try {
        const updated = await getBulkAssignJob(assignJob.jobId)
        if (!active) return
        setAssignJob(updated)
        if (isAssignFinished(updated)) {
          setRefreshNonce((current) => current + 1)
          if (updated.state === "completed") setSelectedIds([])
        }
      } catch {
        if (active) setAssignError("We couldn't refresh the assessment assignment status. The queue is still running — you can re-check from the applications list.")
      }
    }

    const timer = window.setInterval(poll, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [assignJob])

  const openAssignDialog = () => {
    setAssignError(null)
    setAssignVersionId("")
    setConfirmAssignOpen(true)
    if (!effectiveJobId) return
    setAssignAssessmentsLoading(true)
    listAssessments({ jobId: effectiveJobId, limit: 50 })
      .then((response) => setAssignAssessments(response.data))
      .catch(() => { setAssignAssessments([]); setAssignError("We couldn't load assessments for this job.") })
      .finally(() => setAssignAssessmentsLoading(false))
  }

  const handleRunAssignment = async () => {
    if (!assignVersionId) return
    setAssignBusy(true)
    setAssignError(null)
    try {
      const started = await bulkAssignAssessment(assignVersionId, { applicationIds: selectedIds })
      setAssignJob({ jobId: started.jobId, state: started.state })
      setConfirmAssignOpen(false)
    } catch (requestError) {
      setAssignError(getErrorMessage(requestError))
    } finally {
      setAssignBusy(false)
    }
  }

  const assignable = assignAssessments.filter((assessment) => assessment.versions.some((version) => version.status === "PUBLISHED"))

  const handleFiltersChange = (next: ApplicationFilterValues) => {
    setFilters(next)
    setPage(1)
    setSelectedIds([])
  }

  const handleSort = (field: ApplicationSortField) => {
    setSortOrder((current) => sortBy === field ? (current === "asc" ? "desc" : "asc") : "desc")
    setSortBy(field)
    setPage(1)
    setSelectedIds([])
  }

  const handleRunScreening = async () => {
    if (selectedIds.length === 0) return
    if (selectedIds.length > 100) {
      setScreeningError("Screening batches support up to 100 selected applications. Reduce the selection and try again.")
      setConfirmScreeningOpen(false)
      return
    }

    setScreeningBusy(true)
    setScreeningError(null)
    try {
      const started = await startBulkScreening({ mode: "SELECTED", applicationIds: selectedIds })
      const batch = await getBulkScreeningProgress(started.batchId)
      setScreeningBatch(batch)
      setConfirmScreeningOpen(false)
      setSelectedIds([])
    } catch (requestError) {
      setScreeningError(getErrorMessage(requestError))
    } finally {
      setScreeningBusy(false)
    }
  }

  const totalMeta = applications?.meta || EMPTY_META

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <ApplicationFilters
        values={filters}
        jobs={jobOptions}
        stages={stages}
        onChange={handleFiltersChange}
        onJobSearch={() => undefined}
        onClear={() => handleFiltersChange(EMPTY_FILTERS)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm text-muted">
          {loading ? "Loading applications…" : `${totalMeta.total.toLocaleString()} application${totalMeta.total === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button type="button" size="sm" onClick={() => setConfirmScreeningOpen(true)}>
              <BrainCircuit className="h-4 w-4" />
              Run AI screening ({selectedIds.length})
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={openAssignDialog} disabled={!effectiveJobId} title={effectiveJobId ? undefined : "Select a job to assign an assessment"}>
              <ClipboardCheck className="h-4 w-4" />
              Assign assessment ({selectedIds.length})
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => setRefreshNonce((current) => current + 1)} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {screeningBatch && <div className="p-4 pb-0"><ScreeningBatchProgress batch={screeningBatch} /></div>}
      {assignJob && (
        <div className="p-4 pb-0">
          <div className="rounded-lg border border-border bg-surface-elevated p-3 text-sm" role="status">
            {!isAssignFinished(assignJob) ? (
              <>
                <p className="font-medium">Assigning assessment…</p>
                {typeof assignJob.progress === "number" && <p className="mt-1 text-muted">{assignJob.progress}% queued, running in the background.</p>}
              </>
            ) : assignJob.state === "completed" ? (
              <>
                <p className="font-medium text-success">Assessment assignment complete.</p>
                <p className="mt-1 text-muted">{assignJob.result?.assigned ?? 0} assigned · {assignJob.result?.skipped ?? 0} skipped (already assigned) · {assignJob.result?.failed ?? 0} failed</p>
              </>
            ) : (
              <>
                <p className="font-medium text-error">Assessment assignment failed.</p>
                <p className="mt-1 text-muted">{assignJob.failedReason || "The background job could not be completed. Please try again."}</p>
              </>
            )}
          </div>
        </div>
      )}
      {screeningError && <p className="mx-4 mt-4 rounded-lg border border-error/20 bg-error-muted px-3 py-2 text-sm text-error" role="alert">{screeningError}</p>}
      {assignError && <p className="mx-4 mt-4 rounded-lg border border-error/20 bg-error-muted px-3 py-2 text-sm text-error" role="alert">{assignError}</p>}

      {loading && <TableSkeleton columns={showJobColumn ? 8 : 7} />}

      {!loading && error && (
        <EmptyState
          title="Applications could not be loaded"
          description={error}
          action={<Button type="button" variant="outline" onClick={() => setRefreshNonce((current) => current + 1)}>Retry</Button>}
        />
      )}

      {!loading && !error && applications && applications.data.length === 0 && (
        <EmptyState
          title="No applications found"
          description={effectiveJobId ? "This job has no applications matching the current filters." : "Try adjusting your filters or search terms."}
        />
      )}

      {!loading && !error && applications && applications.data.length > 0 && (
        <>
          <ApplicationTable
            applications={applications.data}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            showJob={showJobColumn}
          />
          <Pagination meta={applications.meta} onPageChange={setPage} />
        </>
      )}

      <Dialog open={confirmScreeningOpen} onOpenChange={setConfirmScreeningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run AI screening?</DialogTitle>
            <DialogDescription>
              TalentAI will queue screening for {selectedIds.length} selected application{selectedIds.length === 1 ? "" : "s"}. Results remain decision support and require recruiter review.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmScreeningOpen(false)} disabled={screeningBusy}>Cancel</Button>
            <Button type="button" onClick={handleRunScreening} disabled={screeningBusy}>
              {screeningBusy ? "Queuing…" : "Queue screening"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAssignOpen} onOpenChange={setConfirmAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign assessment</DialogTitle>
            <DialogDescription>
              Assign the published assessment version to {selectedIds.length} selected application{selectedIds.length === 1 ? "" : "s"}. Applications that already have an assignment for this version are skipped.
            </DialogDescription>
          </DialogHeader>
          {assignAssessmentsLoading ? (
            <p className="text-sm text-muted">Loading assessments…</p>
          ) : assignable.length === 0 ? (
            <p className="text-sm text-muted">No assessment with a published version exists for this job yet. Publish a version from the assessment manager first.</p>
          ) : (
            <div role="radiogroup" aria-label="Assessment version" className="space-y-2">
              {assignable.map((assessment) => {
                const published = assessment.versions.filter((version) => version.status === "PUBLISHED")
                return published.map((version) => {
                  const value = version.id
                  return (
                    <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${assignVersionId === value ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input type="radio" name="assessment-version" value={value} checked={assignVersionId === value} onChange={() => setAssignVersionId(value)} className="h-4 w-4" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{assessment.name}</span>
                        <span className="block text-xs text-muted">Version {version.versionNumber} · {version.questionCount} questions · {version.totalPoints} points</span>
                      </span>
                    </label>
                  )
                })
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmAssignOpen(false)} disabled={assignBusy}>Cancel</Button>
            <Button type="button" onClick={handleRunAssignment} disabled={assignBusy || !assignVersionId}>
              {assignBusy ? "Queuing…" : "Queue assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
