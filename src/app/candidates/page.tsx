"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useStore } from "@/store/useStore"
import type { Candidate, DisplayApplicationStatus } from "@/types"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn, getInitials, timeAgo } from "@/lib/utils"
import { buildBulkActionFeedback } from "@/lib/candidates-bulk-actions"
import { startBulkScreening, getBulkScreeningProgress, getRecentBulkScreening, BulkBatchProgress } from "@/lib/api/ai-screening.api"
import { SendAiInterviewModal } from "@/components/ai-interview/send-ai-interview-modal"
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog"
import { ScreeningProgress } from "@/components/ai-screening/screening-progress"
import { ScreeningResultView } from "@/components/ai-screening/screening-result-view"
import { useAiScreening } from "@/lib/ai-screening/use-ai-screening"
import { getApplicationResume } from "@/lib/api/files.api"
import type { StoredFileResponse } from "@/lib/api/files.api"
import { getResumeExtractionStatus, retryAiScreeningExtraction } from "@/lib/api/ai-screening.api"
import { deleteCandidate } from "@/lib/api/candidates.api"
import {
  SearchNormal,
  Add,
  People,
  Star1,
  More,
  Eye,
  Edit2,
  Calendar,
  CloseSquare,
  Call,
  Message,
  Briefcase,
  MagicStar,
  MessageSquare,
  DocumentText,
  Trash,
} from "iconsax-react"

const statusConfig: Record<DisplayApplicationStatus, { label: string; variant: "default" | "success" | "warning" | "error" | "secondary" | "info" }> = {
  Applied: { label: "Applied", variant: "info" },
  Screening: { label: "Screening", variant: "warning" },
  Interview: { label: "Interview", variant: "default" },
  Offer: { label: "Offer", variant: "success" },
  Hired: { label: "Hired", variant: "success" },
  Rejected: { label: "Rejected", variant: "error" },
}

const displayStatuses: DisplayApplicationStatus[] = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]

function getDisplayStatus(candidate: Candidate): DisplayApplicationStatus | undefined {
  return candidate.applicationSummary?.current?.displayStatus
}

function getJobTitle(candidate: Candidate): string {
  return candidate.applicationSummary?.current?.jobTitle || candidate.currentJobTitle || ""
}

function getAppliedAt(candidate: Candidate): Date | undefined {
  return candidate.applicationSummary?.current?.createdAt
}

function getRating(candidate: Candidate): number {
  return candidate.companyProfile?.rating ?? 0
}

function getSkillNames(candidate: Candidate): string[] {
  return candidate.skills.map((s) => s.name)
}

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            "transition-colors",
            onChange ? "cursor-pointer hover:text-warning" : "cursor-default",
            i < rating ? "text-warning" : "text-muted"
          )}
          onClick={() => onChange?.(i + 1)}
        >
          <Star1 className={cn("h-4 w-4", i < rating && "fill-current")} />
        </button>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

function DetailScreeningSection({ applicationId }: { applicationId: string }) {
  const [resumeInfo, setResumeInfo] = React.useState<StoredFileResponse | null>(null)
  const [resumeLoading, setResumeLoading] = React.useState(true)
  const [extractionStatus, setExtractionStatus] = React.useState<'loading' | 'none' | 'processing' | 'ready' | 'failed'>('loading')
  const [extractionRetryPending, setExtractionRetryPending] = React.useState(false)
  const screening = useAiScreening()
  const { selectApplication, loadLatestScreening, requestScreening, retryScreening } = screening

  React.useEffect(() => {
    if (!applicationId) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setResumeLoading(true)
      void getApplicationResume(applicationId).then((r) => {
        if (!active) return
        setResumeInfo(r)
        setResumeLoading(false)
      })
    })
    return () => { active = false }
  }, [applicationId])

  React.useEffect(() => {
    if (!applicationId) return
    let active = true
    const check = async () => {
      try {
        const extraction = await getResumeExtractionStatus(applicationId)
        if (!active) return
        if (extraction.status === 'COMPLETED') setExtractionStatus('ready')
        else if (extraction.status === 'FAILED') setExtractionStatus('failed')
        else setExtractionStatus('processing')
      } catch {
        if (!active) return
        setExtractionStatus('none')
        return
      }
      if (active) setTimeout(() => check(), 4000)
    }
    void check()
    return () => { active = false }
  }, [applicationId])

  React.useEffect(() => {
    if (!applicationId) return
    queueMicrotask(() => {
      selectApplication(applicationId)
      void loadLatestScreening(applicationId)
    })
  }, [applicationId, selectApplication, loadLatestScreening])

  const handleStartScreening = async () => {
    await requestScreening()
  }

  const handleRetryScreening = () => {
    retryScreening()
  }

  const handleRetryExtraction = async () => {
    if (extractionRetryPending) return
    setExtractionRetryPending(true)
    setExtractionStatus('processing')
    try {
      await retryAiScreeningExtraction(applicationId)
      setTimeout(async () => {
        try {
          const extraction = await getResumeExtractionStatus(applicationId)
          setExtractionStatus(extraction.status === 'COMPLETED' ? 'ready' : extraction.status === 'FAILED' ? 'failed' : 'processing')
        } catch {
          setExtractionStatus('none')
        }
      }, 3000)
    } catch {
      setExtractionStatus('failed')
    } finally {
      setExtractionRetryPending(false)
    }
  }

  const ws = screening.state.workflowState
  const hasScreeningData = screening.state.screeningResult !== null
  const screenNotStarted = ws === 'IDLE' || ws === 'APPLICATION_SELECTED'
  const isWorking = ws !== 'IDLE' && ws !== 'APPLICATION_SELECTED' && ws !== 'SCREENING_COMPLETED' && ws !== 'SCREENING_FAILED'

  return (
    <>
      <Separator />
      <div>
        <div className="flex items-center gap-2 mb-3">
          <DocumentText className="h-4 w-4 text-muted" />
          <h4 className="text-sm font-medium text-foreground">Resume</h4>
        </div>
        <div className="ml-6 space-y-3">
          {resumeLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!resumeLoading && resumeInfo && (
            <div>
              <p className="text-sm font-medium">{resumeInfo.originalName}</p>
              <p className="text-xs text-muted-foreground">
                {(resumeInfo.sizeBytes / 1024).toFixed(0)} KB &middot; {resumeInfo.mimeType}
                &nbsp;&middot; Uploaded {timeAgo(new Date(resumeInfo.createdAt))}
              </p>
              {extractionStatus === 'processing' && (
                <p className="text-xs text-warning flex items-center gap-1.5 mt-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-warning animate-pulse" />
                  Processing...
                </p>
              )}
              {extractionStatus === 'ready' && (
                <p className="text-xs text-success flex items-center gap-1.5 mt-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-success" />
                  Ready
                </p>
              )}
              {extractionStatus === 'failed' && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-error">Processing failed</span>
                  <Button variant="outline" size="sm" onClick={handleRetryExtraction} disabled={extractionRetryPending}>
                    Retry
                  </Button>
                </div>
              )}
            </div>
          )}
          {!resumeLoading && !resumeInfo && (
            <p className="text-sm text-muted-foreground">No resume uploaded for this application.</p>
          )}
        </div>
      </div>

      <Separator />
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MagicStar className="h-4 w-4 text-muted" />
          <h4 className="text-sm font-medium text-foreground">AI Screening</h4>
        </div>
        <div className="ml-6 space-y-3">
          {hasScreeningData && (
            <ScreeningResultView result={screening.state.screeningResult!} />
          )}

          {!hasScreeningData && screenNotStarted && resumeInfo && (
            <div className="text-center py-4">
              <Button onClick={handleStartScreening} size="sm">
                Start AI Screening
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                AI will compare the candidate&apos;s resume against the job requirements
              </p>
            </div>
          )}

          {!hasScreeningData && isWorking && (
            <ScreeningProgress workflowState={ws} />
          )}

          {ws === 'SCREENING_FAILED' && (
            <div className="text-center">
              <p className="text-sm text-error mb-2">{screening.state.error || 'Screening failed'}</p>
              <Button onClick={handleRetryScreening} variant="outline" size="sm">Retry</Button>
            </div>
          )}

          {!hasScreeningData && !resumeInfo && !resumeLoading && (
            <p className="text-sm text-muted-foreground">
              Upload a resume first to enable AI screening.
            </p>
          )}

          {screenNotStarted && !resumeInfo && !resumeLoading && null}
        </div>
      </div>
    </>
  )
}

export default function CandidatesPage() {
  const router = useRouter()
  const { candidates, jobs, rejectCandidateApplication, advanceCandidateApplication, fetchCandidates, fetchJobs, candidatesLoading, candidatesError } = useStore()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [jobFilter, setJobFilter] = React.useState<string>("all")
  const [ratingFilter, setRatingFilter] = React.useState<string>("all")
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [detailsCandidate, setDetailsCandidate] = React.useState<Candidate | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Candidate | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = React.useState(false)
  const [aiInterviewModalOpen, setAiInterviewModalOpen] = React.useState(false)
  const [pageFeedback, setPageFeedback] = React.useState<{ type: "success" | "warning"; message: string } | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = React.useState(false)
  // Bulk AI Screening state
  const [bulkScreenConfirmOpen, setBulkScreenConfirmOpen] = React.useState(false)
  const [bulkScreening, setBulkScreening] = React.useState(false)
  const [bulkBatch, setBulkBatch] = React.useState<BulkBatchProgress | null>(null)
  const [bulkBatchError, setBulkBatchError] = React.useState<string | null>(null)
  const bulkPollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollFailuresRef = React.useRef(0)

  const BULK_BATCH_STORAGE_KEY = "talentai.activeBulkBatchId"

  const persistBatchId = React.useCallback((batchId: string | null) => {
    try {
      if (batchId) sessionStorage.setItem(BULK_BATCH_STORAGE_KEY, batchId)
      else sessionStorage.removeItem(BULK_BATCH_STORAGE_KEY)
    } catch {
      // sessionStorage unavailable — progress simply won't survive reload
    }
  }, [])

  const stopBulkPolling = React.useCallback(() => {
    if (bulkPollRef.current) {
      clearTimeout(bulkPollRef.current)
      bulkPollRef.current = null
    }
  }, [])

  // Poll batch progress until a terminal state. Survives navigation because
  // the batch lives on the backend; the batchId is persisted in sessionStorage
  // and rediscovered on mount via the backend's recent-batch lookup.
  const pollBulkBatch = React.useCallback(async function poll(batchId: string) {
    try {
      const progress = await getBulkScreeningProgress(batchId)
      pollFailuresRef.current = 0
      setBulkBatch(progress)
      setBulkBatchError(null)
      const terminal =
        progress.status === "COMPLETED" ||
        progress.status === "FAILED" ||
        progress.status === "PARTIALLY_COMPLETED"
      if (terminal) {
        persistBatchId(null)
        setBulkScreening(false)
      } else {
        bulkPollRef.current = setTimeout(() => poll(batchId), 4000)
      }
    } catch {
      // Transient network/server error — retry with backoff, then give up
      pollFailuresRef.current += 1
      if (pollFailuresRef.current >= 5) {
        persistBatchId(null)
        setBulkScreening(false)
        setBulkBatchError(
          "Bulk screening is still running in the background, but live progress is temporarily unavailable. Reload the page to re-check."
        )
      } else {
        bulkPollRef.current = setTimeout(() => poll(batchId), 8000)
      }
    }
  }, [persistBatchId])

  // Rediscover an active batch after navigation or a browser reload
  React.useEffect(() => {
    let active = true
    const stored = sessionStorage.getItem(BULK_BATCH_STORAGE_KEY)
    if (stored) {
      queueMicrotask(() => {
        if (!active) return
        setBulkScreening(true)
        void pollBulkBatch(stored)
      })
      return () => { active = false }
    }
    void getRecentBulkScreening()
      .then((batch) => {
        if (!active || !batch) return
        const terminal =
          batch.status === "COMPLETED" ||
          batch.status === "FAILED" ||
          batch.status === "PARTIALLY_COMPLETED"
        if (terminal) return
        persistBatchId(batch.batchId)
        queueMicrotask(() => {
          if (!active) return
          setBulkScreening(true)
          void pollBulkBatch(batch.batchId)
        })
      })
      .catch(() => {})
    return () => { active = false }
  }, [pollBulkBatch, persistBatchId])

  // No timers leak on unmount
  React.useEffect(() => () => stopBulkPolling(), [stopBulkPolling])

  React.useEffect(() => {
    void Promise.all([fetchCandidates(), fetchJobs()])
  }, [fetchCandidates, fetchJobs])

  const filteredCandidates = React.useMemo(() => {
    return candidates.filter((candidate) => {
      const status = getDisplayStatus(candidate)
      const jobTitle = getJobTitle(candidate)
      const rating = getRating(candidate)
      const matchesSearch =
        searchQuery === "" ||
        candidate.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        jobTitle.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === "all" || status === statusFilter
      const matchesJob = jobFilter === "all" || candidate.applicationSummary?.current?.jobId === jobFilter
      const matchesRating =
        ratingFilter === "all" ||
        (ratingFilter === "5" && rating === 5) ||
        (ratingFilter === "4+" && rating >= 4) ||
        (ratingFilter === "3+" && rating >= 3) ||
        (ratingFilter === "unrated" && rating === 0)
      return matchesSearch && matchesStatus && matchesJob && matchesRating
    })
  }, [candidates, searchQuery, statusFilter, jobFilter, ratingFilter])

  const allFilteredIds = React.useMemo(() => filteredCandidates.map((c) => c.id), [filteredCandidates])
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id))

  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = React.useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allFilteredIds))
    }
  }, [allSelected, allFilteredIds])

  const handleDeleteCandidate = React.useCallback(async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteCandidate(deleteTarget.id, { expectedVersion: deleteTarget.version })
      setDeleteTarget(null)
      setDetailsCandidate(null)
      void fetchCandidates()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete candidate"
      setDeleteError(msg)
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteTarget, fetchCandidates])

  const handleBulkAction = React.useCallback(async (action: string) => {
    setBulkActionLoading(true)
    let succeeded = 0
    let failed = 0
    try {
      for (const id of selectedIds) {
        const candidate = candidates.find((c) => c.id === id)
        if (!candidate) continue
        const currentApp = candidate.applicationSummary?.current
        if (!currentApp) continue

        try {
          switch (action) {
            case "reject":
              await rejectCandidateApplication(id)
              break
            case "move-to-screening":
              await advanceCandidateApplication(id, "Screening")
              break
            case "interview":
              await advanceCandidateApplication(id, "Interview")
              break
          }
          succeeded += 1
        } catch {
          failed += 1
        }
      }
      setSelectedIds(new Set())
      const attempted = succeeded + failed
      const feedback = buildBulkActionFeedback(action, succeeded, attempted)
      if (feedback) setPageFeedback(feedback)
    } finally {
      setBulkActionLoading(false)
    }
  }, [selectedIds, candidates, rejectCandidateApplication, advanceCandidateApplication])

  // ── Bulk AI Screening ─────────────────────────────────────────────────────
  const handleBulkScreenSelected = React.useCallback(async () => {
    setBulkScreenConfirmOpen(false)
    setBulkScreening(true)
    setBulkBatch(null)
    setBulkBatchError(null)
    stopBulkPolling()
    pollFailuresRef.current = 0

    // Collect the applicationIds for the selected candidates
    const appIds: string[] = []
    for (const candidateId of selectedIds) {
      const candidate = candidates.find((c) => c.id === candidateId)
      const appId = candidate?.applicationSummary?.current?.id
      if (appId) appIds.push(appId)
    }

    if (appIds.length === 0) {
      setBulkBatchError("No applications found for selected candidates. Upload a resume first.")
      setBulkScreening(false)
      return
    }

    try {
      const response = await startBulkScreening({ mode: "SELECTED", applicationIds: appIds })
      // Persist the batch so progress can be resumed after navigation/reload
      persistBatchId(response.batchId)
      bulkPollRef.current = setTimeout(() => pollBulkBatch(response.batchId), 2000)
    } catch (err) {
      persistBatchId(null)
      setBulkBatchError(err instanceof Error ? err.message : "Bulk screening failed to start")
      setBulkScreening(false)
    }
  }, [selectedIds, candidates, pollBulkBatch, persistBatchId, stopBulkPolling])

  const newCount = candidates.filter((c) => getDisplayStatus(c) === "Applied").length
  const pipelineCount = candidates.filter((c) => getDisplayStatus(c) === "Interview").length

  const detailApplicationId = detailsCandidate?.applicationSummary?.current?.id || null

  return (
    <AppLayout
      title="Candidates"
      description={`${filteredCandidates.length} candidates${newCount > 0 ? ` · ${newCount} new` : ""}${pipelineCount > 0 ? ` · ${pipelineCount} in pipeline` : ""}`}
      actions={
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Add className="h-4 w-4" />
          Add Candidate
        </Button>
      }
    >
      <AddCandidateDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        jobs={jobs}
        onComplete={() => {}}
      />

      {pageFeedback && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm mb-4",
          pageFeedback.type === "success" && "border-success/30 bg-success/5 text-success-foreground",
          pageFeedback.type === "warning" && "border-warning/30 bg-warning/5 text-warning-foreground",
        )}>
          {pageFeedback.message}
        </div>
      )}
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <SearchNormal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              type="search"
              name="candidate-search"
              autoComplete="off"
              placeholder="Search candidates by name, email, or position..."
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
                {displayStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4+">4+ Stars</SelectItem>
                <SelectItem value="3+">3+ Stars</SelectItem>
                <SelectItem value="unrated">Unrated</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || statusFilter !== "all" || jobFilter !== "all" || ratingFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 self-end text-muted-foreground"
                onClick={() => { setSearchQuery(""); setStatusFilter("all"); setJobFilter("all"); setRatingFilter("all") }}
                title="Clear all search and filter settings (does not remove candidates)"
                aria-label="Clear Filters"
              >
                <CloseSquare className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Candidates Table */}
      <div className="animate-fade-in">
        {/* Bulk AI Screening — confirmation dialog */}
        <Dialog open={bulkScreenConfirmOpen} onOpenChange={setBulkScreenConfirmOpen}>
          <DialogContent className="sm:max-w-[440px]">
            <ModalHeader>
              <DialogTitle className="flex items-center gap-2">
                <MagicStar className="h-5 w-5 text-primary" />
                Screen Selected Candidates
              </DialogTitle>
              <DialogDescription>
                {selectedIds.size} candidate{selectedIds.size !== 1 ? "s" : ""} will be queued for AI screening.
                Each candidate is evaluated only against the job they applied for.
              </DialogDescription>
            </ModalHeader>
            <div className="py-2 text-sm text-muted-foreground">
              <ul className="list-disc list-inside space-y-1">
                <li>Screening runs in the background — you can navigate away</li>
                <li>Candidates without an uploaded resume will be skipped</li>
                <li>Existing valid screening results will be reused</li>
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkScreenConfirmOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkScreenSelected}>
                <MagicStar className="h-4 w-4 mr-2" />
                Start Screening
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk AI Screening — batch progress banner */}
        {(bulkBatch || bulkScreening || bulkBatchError) && (
          <div className={cn(
            "rounded-lg border px-4 py-3 mb-4 text-sm animate-fade-in",
            bulkBatchError
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : bulkBatch?.status === "COMPLETED"
                ? "border-success/30 bg-success/5"
                : "border-primary/20 bg-primary/5"
          )}>
            {bulkBatchError ? (
              <p>{bulkBatchError}</p>
            ) : bulkBatch ? (
              <div className="space-y-1">
                <p className="font-medium">
                  {bulkBatch.status === "COMPLETED" ? "AI screening complete" :
                   bulkBatch.status === "PARTIALLY_COMPLETED" ? "AI screening partially complete" :
                   bulkBatch.status === "FAILED" ? "AI screening failed" :
                   `Screening ${bulkBatch.completed} of ${bulkBatch.total} applications...`}
                </p>
                {(bulkBatch.status === "COMPLETED" || bulkBatch.status === "PARTIALLY_COMPLETED") && (
                  <p className="text-muted-foreground">
                    Recommended: <span className="font-semibold text-green-600">{bulkBatch.recommended}</span>
                    {" · "}Human Review: <span className="font-semibold text-yellow-600">{bulkBatch.humanReview}</span>
                    {" · "}Not Recommended: <span className="font-semibold text-red-600">{bulkBatch.notRecommended}</span>
                    {bulkBatch.failed > 0 && <span className="text-red-600"> · Failed: {bulkBatch.failed}</span>}
                    {bulkBatch.skipped > 0 && <span className="text-muted-foreground"> · Skipped: {bulkBatch.skipped}</span>}
                  </p>
                )}
                {bulkBatch.status === "RUNNING" && (
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${bulkBatch.total > 0 ? Math.round((bulkBatch.completed / bulkBatch.total) * 100) : 0}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p>Queuing applications for screening...</p>
            )}
          </div>
        )}

        {candidatesLoading ? (
          <Card>
            <TableSkeleton />
          </Card>
        ) : candidatesError ? (
          <EmptyState
            icon={<People className="h-8 w-8 text-muted" />}
            title="Failed to load candidates"
            description={candidatesError}
            action={<Button variant="outline" onClick={() => fetchCandidates()}>Retry</Button>}
          />
        ) : filteredCandidates.length === 0 ? (
          <EmptyState
            icon={<People className="h-8 w-8 text-muted" />}
            title="No candidates found"
            description={
              searchQuery || statusFilter !== "all" || jobFilter !== "all" || ratingFilter !== "all"
                ? "Try adjusting your filters to see more results."
                : "Start building your talent pool by adding candidates."
            }
            action={
              searchQuery || statusFilter !== "all" || jobFilter !== "all" || ratingFilter !== "all" ? (
                <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setJobFilter("all"); setRatingFilter("all") }}>
                  Clear Filters
                </Button>
              ) : (
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Add className="h-4 w-4" />
                  Add Candidate
                </Button>
              )
            }
          />
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mb-3 px-4 py-2 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in">
                <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={bulkActionLoading} onClick={() => handleBulkAction("move-to-screening")}>
                    <SearchNormal className="h-4 w-4 mr-1" />
                    Move to Screening Stage
                  </Button>
                  <Button variant="outline" size="sm" disabled={bulkActionLoading} onClick={() => handleBulkAction("interview")}>
                    <Calendar className="h-4 w-4 mr-1" />
                    Move to Interview
                  </Button>
                  <Button variant="outline" size="sm" disabled={bulkActionLoading} onClick={() => handleBulkAction("reject")} className="text-error hover:text-error">
                    <CloseSquare className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkActionLoading || bulkScreening}
                    onClick={() => setBulkScreenConfirmOpen(true)}
                  >
                    <MagicStar className="h-4 w-4 mr-1" />
                    {bulkScreening ? "Screening..." : "Run AI Screening"}
                  </Button>
                </div>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  title="Clear Selection — unchecks the selected rows without removing any candidates"
                  aria-label="Clear Selection"
                >
                  Clear Selection
                </Button>
              </div>
            )}
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="hidden md:table-cell">Position</TableHead>
                    <TableHead className="hidden lg:table-cell">Experience</TableHead>
                    <TableHead>AI Score</TableHead>
                    <TableHead>Pipeline Stage</TableHead>
                    <TableHead className="hidden sm:table-cell">Rating</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => {
                    const displayStatus = getDisplayStatus(candidate)
                    const jobTitle = getJobTitle(candidate)
                    const rating = getRating(candidate)
                    return (
                      <TableRow
                        key={candidate.id}
                        className="cursor-pointer"
                        onClick={() => setDetailsCandidate(candidate)}
                      >
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            checked={selectedIds.has(candidate.id)}
                            onChange={() => toggleSelect(candidate.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9" fallback={getInitials(candidate.displayName)}>
                              {candidate.avatar && <AvatarImage src={candidate.avatar} alt={candidate.displayName} />}
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{candidate.displayName}</p>
                              <p className="text-xs text-muted truncate">{candidate.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
                          {jobTitle || candidate.currentJobTitle || "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {candidate.totalExperienceYears} yr{candidate.totalExperienceYears !== 1 ? "s" : ""}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <Progress
                              value={candidate.aiScore ?? 0}
                              className="h-1.5 flex-1"
                              indicatorClassName={cn(
                                candidate.aiScore === null || candidate.aiScore === undefined
                                  ? ""
                                  : candidate.aiScore >= 80 ? "bg-success" :
                                  candidate.aiScore >= 60 ? "bg-warning" :
                                  "bg-error"
                              )}
                            />
                            <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                              {candidate.aiScore === null || candidate.aiScore === undefined ? "—" : candidate.aiScore}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {displayStatus ? (
                            <Badge variant={statusConfig[displayStatus].variant} className="text-xs">
                              {statusConfig[displayStatus].label}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted">
                              No application
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StarRating rating={rating} />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <More className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetailsCandidate(candidate) }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                <Calendar className="h-4 w-4 mr-2" />
                                Schedule Interview
                              </DropdownMenuItem>
{displayStatus && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-error"
                    onClick={async (e) => { e.stopPropagation(); await rejectCandidateApplication(candidate.id) }}
                  >
                    <CloseSquare className="h-4 w-4 mr-2" />
                    Reject
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-error"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(candidate) }}
              >
                <Trash className="h-4 w-4 mr-2" />
                Delete Candidate
              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
          </>
        )}
      </div>

      {/* Candidate Details Dialog */}
      <Dialog open={!!detailsCandidate} onOpenChange={(open) => !open && setDetailsCandidate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailsCandidate && (() => {
            const displayStatus = getDisplayStatus(detailsCandidate)
            const jobTitle = getJobTitle(detailsCandidate)
            const appliedAt = getAppliedAt(detailsCandidate)
            const rating = getRating(detailsCandidate)
            const skillNames = getSkillNames(detailsCandidate)
            return (
              <>
                <ModalHeader>
                  <div className="flex items-start gap-4">
                    <Avatar className="h-14 w-14 shrink-0" fallback={getInitials(detailsCandidate.displayName)}>
                      {detailsCandidate.avatar && <AvatarImage src={detailsCandidate.avatar} alt={detailsCandidate.displayName} />}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-xl">{detailsCandidate.displayName}</DialogTitle>
                      <DialogDescription className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Message className="h-3 w-3" />
                          {detailsCandidate.email}
                        </span>
                        {detailsCandidate.phone && (
                          <span className="flex items-center gap-1">
                            <Call className="h-3 w-3" />
                            {detailsCandidate.phone}
                          </span>
                        )}
                      </DialogDescription>
                    </div>
                    {displayStatus ? (
                      <Badge variant={statusConfig[displayStatus].variant} className="shrink-0">
                        {statusConfig[displayStatus].label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-muted">
                        Pool
                      </Badge>
                    )}
                  </div>
                </ModalHeader>

                <div className="space-y-5">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-border bg-background p-3 text-center">
                      <p className="text-xs text-muted mb-1">Experience</p>
                      <p className="text-lg font-semibold text-foreground">{detailsCandidate.totalExperienceYears}<span className="text-sm font-normal text-muted ml-0.5">yr</span></p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3 text-center">
                      <p className="text-xs text-muted mb-1">AI Score</p>
                      <p className={cn(
                        "text-lg font-semibold",
                        detailsCandidate.aiScore === null || detailsCandidate.aiScore === undefined
                          ? "text-muted-foreground"
                          : detailsCandidate.aiScore >= 80 ? "text-success" :
                          detailsCandidate.aiScore >= 60 ? "text-warning" :
                          "text-foreground"
                      )}>
                        {detailsCandidate.aiScore === null || detailsCandidate.aiScore === undefined ? "—" : detailsCandidate.aiScore}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3 text-center">
                      <p className="text-xs text-muted mb-1">Rating</p>
                      <div className="flex justify-center mt-1">
                        <StarRating rating={rating} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3 text-center">
                      <p className="text-xs text-muted mb-1">Applied</p>
                      <p className="text-sm font-medium text-foreground">
                        {appliedAt ? timeAgo(appliedAt) : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Position */}
                  {jobTitle && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase className="h-4 w-4 text-muted" />
                        <h4 className="text-sm font-medium text-foreground">Position</h4>
                      </div>
                      <p className="text-sm text-muted-foreground ml-6">{jobTitle}</p>
                    </div>
                  )}

                  {detailsCandidate.applicationSummary && detailsCandidate.applicationSummary.total > 0 && (
                    <>
                      <Separator />
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Briefcase className="h-4 w-4 text-muted" />
                          <h4 className="text-sm font-medium text-foreground">Applications</h4>
                          <span className="text-xs text-muted ml-1">
                            ({detailsCandidate.applicationSummary.active} active of {detailsCandidate.applicationSummary.total} total)
                          </span>
                        </div>
                        {detailsCandidate.applicationSummary.current && (
                          <p className="text-sm text-muted-foreground ml-6">
                            Current: {detailsCandidate.applicationSummary.current.jobTitle}
                            {" · "}
                            {statusConfig[detailsCandidate.applicationSummary.current.displayStatus].label}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Skills */}
                  {skillNames.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MagicStar className="h-4 w-4 text-muted" />
                        <h4 className="text-sm font-medium text-foreground">Skills</h4>
                      </div>
                      <div className="flex flex-wrap gap-2 ml-6">
                        {skillNames.map((skill) => (
                          <Badge key={skill} variant="outline">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Score Detail */}
                  {(detailsCandidate.aiScore !== null && detailsCandidate.aiScore !== undefined) && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MagicStar className="h-4 w-4 text-muted" />
                        <h4 className="text-sm font-medium text-foreground">AI Score</h4>
                      </div>
                      <div className="ml-6 space-y-2">
                        <div className="flex items-center gap-3">
                          <Progress
                            value={detailsCandidate.aiScore}
                            className="h-2.5 flex-1"
                            indicatorClassName={cn(
                              detailsCandidate.aiScore >= 80 ? "bg-success" :
                              detailsCandidate.aiScore >= 60 ? "bg-warning" :
                              "bg-error"
                            )}
                          />
                          <span className="text-sm font-semibold text-foreground w-10 text-right">
                            {detailsCandidate.aiScore}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          {detailsCandidate.aiScore >= 80
                            ? "Excellent match — strong technical and cultural fit signals."
                            : detailsCandidate.aiScore >= 60
                            ? "Good match — meets core requirements with some gaps."
                            : "Moderate match — may need further evaluation."}
                        </p>
                        {detailsCandidate.screening?.pendingRerun && (
                          <p className="text-xs text-warning">
                            A newer AI screening is currently running — the score above reflects the latest completed run.
                          </p>
                        )}
                        {detailsCandidate.screening?.failedRerun && (
                          <p className="text-xs text-muted-foreground">
                            A newer AI screening attempt failed. Showing the latest completed score.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Resume & AI Screening */}
                  {detailApplicationId && (
                    <DetailScreeningSection applicationId={detailApplicationId} />
                  )}
                </div>

                <DialogFooter>
                  <div className="flex items-center gap-2 w-full flex-wrap">
                    {displayStatus && displayStatus !== "Rejected" && displayStatus !== "Hired" && (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={actionInProgress}
                          onClick={async () => { await rejectCandidateApplication(detailsCandidate.id); setDetailsCandidate(null) }}
                        >
                          <CloseSquare className="h-4 w-4" />
                          Reject
                        </Button>
                        {displayStatus === "Applied" && (
                          <Button
                            size="sm"
                            disabled={actionInProgress}
                            onClick={() => {
                              setDetailsCandidate(null)
                              router.push(`/ai-screener?applicationId=${encodeURIComponent(detailApplicationId!)}`)
                            }}
                          >
                            <SearchNormal className="h-4 w-4" />
                            Start AI Screening
                          </Button>
                        )}
                        {displayStatus === "Screening" && (
                          <Button
                            size="sm"
                            disabled={actionInProgress}
                            onClick={async () => { await advanceCandidateApplication(detailsCandidate.id, "Interview"); setDetailsCandidate(null) }}
                          >
                            <Calendar className="h-4 w-4" />
                            Move to Interview
                          </Button>
                        )}
                        {displayStatus === "Interview" && (
                          <Button
                            size="sm"
                            disabled={actionInProgress}
                            onClick={async () => { await advanceCandidateApplication(detailsCandidate.id, "Offer"); setDetailsCandidate(null) }}
                          >
                            <MessageSquare className="h-4 w-4" />
                            Extend Offer
                          </Button>
                        )}
                      </>
                    )}
                    {displayStatus === "Offer" && (
                      <Button
                        size="sm"
                        disabled={actionInProgress}
                        onClick={async () => { await advanceCandidateApplication(detailsCandidate.id, "Hired"); setDetailsCandidate(null) }}
                      >
                        <People className="h-4 w-4" />
                        Mark as Hired
                      </Button>
                    )}
                    {displayStatus && detailsCandidate.applicationSummary?.current && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setAiInterviewModalOpen(true)}
                      >
                        <MagicStar className="h-4 w-4" />
                        Send AI Interview
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Candidate confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleteBusy) { setDeleteTarget(null); setDeleteError(null) } }}>
        <DialogContent className="max-w-md">
          <ModalHeader>
            <DialogTitle>Delete Candidate?</DialogTitle>
            <DialogDescription>
              This will remove <span className="font-medium text-foreground">{deleteTarget?.displayName}</span> from the
              active candidate list, dashboard counts and reports. Historical recruitment records are retained internally
              for audit purposes.
            </DialogDescription>
          </ModalHeader>
          {deleteError && (
            <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">{deleteError}</div>
          )}
          <DialogFooter>
            <div className="flex items-center justify-end gap-3 w-full">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteCandidate} disabled={deleteBusy}>
                {deleteBusy ? "Deleting..." : "Delete Candidate"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendAiInterviewModal
        open={aiInterviewModalOpen}
        onOpenChange={setAiInterviewModalOpen}
        candidateName={detailsCandidate?.displayName || ""}
        candidateEmail={detailsCandidate?.email || ""}
        jobTitle={detailsCandidate?.applicationSummary?.current?.jobTitle || ""}
        applicationId={detailsCandidate?.applicationSummary?.current?.id || ""}
      />
    </AppLayout>
  )
}
