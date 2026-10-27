"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ChevronLeft,
  ClipboardList,
  FileText,
  UserRound,
  CheckCircle,
  XCircle,
  Star,
  ArrowRight,
  BrainCircuit,
  Video,
} from "lucide-react"
import { ScreeningResultView } from "@/components/ai-screening/screening-result-view"
import { ApplicationAssessmentPanel } from "@/components/assessments/application-assessment-panel"
import { AssessmentResultView } from "@/components/assessments/assessment-result-view"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ApplicationStatusBadge, ScreeningStatusBadge } from "@/components/recruitment/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApplicationById, type ApplicationDetail, type ApplicationNote, rejectApplication, shortlistApplication, markApplicationHired, moveApplication, createApplicationNote } from "@/lib/api/applications.api"
import { getLatestAiScreening, requestAiScreening, type AiScreeningResultDto } from "@/lib/api/ai-screening.api"
import { getAiInterviewsByApplication, type AiInterviewDetail } from "@/lib/api/ai-interviews.api"
import { getJobPipeline, type PipelineStageDto } from "@/lib/api/jobs.api"
import { SendAiInterviewModal } from "@/components/ai-interview/send-ai-interview-modal"

// ── Helpers ────────────────────────────────────────────────────────

/** Extract a user-facing message from an API error, mapping known backend
 *  error codes to helpful recruiter-facing copy. */
function extractScreeningErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "The request could not be completed. Try again."

  const msg = err.message
  // Backend puts JSON in the message for structured errors
  try {
    const parsed = JSON.parse(msg)
    const code = parsed?.code ?? parsed?.error?.code
    if (code === "INSUFFICIENT_JOB_CRITERIA") {
      return "This job doesn't have enough structured requirements for AI screening. Add skills, experience, or education requirements first."
    }
    if (code === "RESUME_EXTRACTION_PENDING") {
      return "The resume is still being processed. Try again in a moment."
    }
    const serverMsg = parsed?.message ?? parsed?.error?.message
    if (serverMsg) return serverMsg
  } catch {
    // not JSON — use the raw message
  }

  if (msg.includes("No resume file")) return "No resume is attached to this application. Upload a resume before requesting screening."
  if (msg.includes("no description or qualifications")) return "The job has no description or qualifications. Add these before screening."
  if (msg.includes("Screening job could not be queued") || msg.includes("queue")) return "The screening queue is temporarily unavailable. Try again in a moment."
  if (msg.includes("concurrent access")) return "Another screening was submitted at the same time. Refresh and check the status."

  return msg || "The screening request could not be completed. Try again."
}

// ── Request Screening Button ───────────────────────────────────────

interface RequestScreeningButtonProps {
  applicationId: string
  screeningStatus: AiScreeningResultDto["status"] | undefined
  onSuccess: () => void
}

function RequestScreeningButton({ applicationId, screeningStatus, onSuccess }: RequestScreeningButtonProps) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  // PENDING or RUNNING — screening already active, nothing to do
  const isActive = screeningStatus === "PENDING" || screeningStatus === "RUNNING"

  // For COMPLETED, the backend will REUSE the result unless forceRerun is true.
  // We offer a "Re-run" path that sets forceRerun.
  const isCompleted = screeningStatus === "COMPLETED"

  const handleRequest = async (forceRerun: boolean) => {
    setError(null)
    setSuccessMessage(null)
    setBusy(true)
    try {
      const response = await requestAiScreening(applicationId, { forceRerun })
      const action = response.data?.action
      if (action === "CREATED") {
        setSuccessMessage("Screening queued. Results will appear when complete.")
      } else {
        // REUSED — an identical, non-failed result already exists
        setSuccessMessage("An existing screening result is already available.")
      }
      onSuccess()
    } catch (err) {
      setError(extractScreeningErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (isActive) {
    return (
      <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-muted" role="status">
        <BrainCircuit className="inline h-4 w-4 mr-1.5 align-text-bottom" aria-hidden="true" />
        Screening {screeningStatus === "RUNNING" ? "running" : "queued"} — results will appear when complete.
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full justify-start gap-2"
        disabled={busy}
        onClick={() => handleRequest(isCompleted)}
        aria-busy={busy}
      >
        <BrainCircuit className="h-4 w-4" aria-hidden="true" />
        {busy
          ? "Requesting…"
          : isCompleted
            ? "Re-run AI screening"
            : "Request AI screening"}
      </Button>
      {error && (
        <p className="text-xs text-error" role="alert">{error}</p>
      )}
      {successMessage && (
        <p className="text-xs text-success" role="status">{successMessage}</p>
      )}
    </div>
  )
}

// ── Recruiter Actions Panel ────────────────────────────────────────

interface RecruiterActionsPanelProps {
  application: ApplicationDetail
  screening: AiScreeningResultDto | null
  pipelineStages: PipelineStageDto[]
  onActionComplete: () => void
}

type ActionType = "reject" | "shortlist" | "hired" | "move"

function RecruiterActionsPanel({ application, screening, pipelineStages, onActionComplete }: RecruiterActionsPanelProps) {
  const [pendingAction, setPendingAction] = React.useState<ActionType | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [moveStageId, setMoveStageId] = React.useState("")
  const [rejectReason, setRejectReason] = React.useState("")

  const isFinal =
    application.status === "HIRED" ||
    application.status === "REJECTED" ||
    application.status === "WITHDRAWN" ||
    application.status === "DISQUALIFIED"

  const confirm = async () => {
    setError(null)
    setBusy(true)
    try {
      const base = { expectedVersion: application.version }
      if (pendingAction === "reject") {
        await rejectApplication(application.id, {
          ...base,
          reasonCode: rejectReason || undefined,
        })
      } else if (pendingAction === "shortlist") {
        await shortlistApplication(application.id, base)
      } else if (pendingAction === "hired") {
        await markApplicationHired(application.id, base)
      } else if (pendingAction === "move") {
        if (!moveStageId) { setError("Please select a stage."); setBusy(false); return }
        await moveApplication(application.id, { ...base, toStageId: moveStageId })
      }
      setPendingAction(null)
      onActionComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action could not be completed. Refresh and try again.")
    } finally {
      setBusy(false)
    }
  }

  const openAction = (action: ActionType) => {
    setError(null)
    setRejectReason("")
    setMoveStageId("")
    setPendingAction(action)
  }

  // Stages available to move to (excluding the current stage)
  const targetStages = pipelineStages.filter((s) => s.id !== application.currentStage?.id)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recruiter actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isFinal ? (
            <p className="text-sm text-muted">
              This application has reached a final status ({application.status.toLowerCase().replace("_", " ")}) and cannot be actioned further.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted mb-3">
                AI results are decision support. All decisions require recruiter review.
              </p>
              <div className="flex flex-col gap-2">
                <RequestScreeningButton
                  applicationId={application.id}
                  screeningStatus={screening?.status}
                  onSuccess={onActionComplete}
                />
                {application.status !== "SHORTLISTED" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => openAction("shortlist")}
                  >
                    <Star className="h-4 w-4 text-warning" aria-hidden="true" />
                    Shortlist
                  </Button>
                )}
                {targetStages.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => openAction("move")}
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    Move to stage
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => openAction("hired")}
                >
                  <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
                  Mark hired
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="justify-start gap-2 text-error hover:text-error"
                  onClick={() => openAction("reject")}
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Reject
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reject confirmation */}
      <Dialog open={pendingAction === "reject"} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
            <DialogDescription>
              This will move the application to a rejected status. The candidate will not be
              automatically notified unless email delivery is configured.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="reject-reason">
              Reason code <span className="text-muted font-normal">(optional)</span>
            </label>
            <select
              id="reject-reason"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            >
              <option value="">— Not specified —</option>
              <option value="UNDERQUALIFIED">Underqualified</option>
              <option value="OVERQUALIFIED">Overqualified</option>
              <option value="POSITION_FILLED">Position filled</option>
              <option value="POOR_CULTURE_FIT">Culture fit</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={busy} className="bg-error text-white hover:bg-error/90">
              {busy ? "Rejecting…" : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortlist confirmation */}
      <Dialog open={pendingAction === "shortlist"} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Shortlist application</DialogTitle>
            <DialogDescription>
              Move this application to the shortlisted status, indicating it meets the minimum bar for further review.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={confirm} disabled={busy}>
              {busy ? "Shortlisting…" : "Confirm shortlist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark hired confirmation */}
      <Dialog open={pendingAction === "hired"} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as hired</DialogTitle>
            <DialogDescription>
              This records the hiring decision and closes the application. Ensure all required approvals
              have been obtained before confirming.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={confirm} disabled={busy}>
              {busy ? "Saving…" : "Confirm hire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move stage confirmation */}
      <Dialog open={pendingAction === "move"} onOpenChange={() => setPendingAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to stage</DialogTitle>
            <DialogDescription>
              Move this application to a different pipeline stage.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="move-stage">
              Target stage
            </label>
            <select
              id="move-stage"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={moveStageId}
              onChange={(e) => setMoveStageId(e.target.value)}
            >
              <option value="">— Select stage —</option>
              {targetStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={confirm} disabled={busy || !moveStageId}>
              {busy ? "Moving…" : "Confirm move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── AI Interview Panel ─────────────────────────────────────────────

const AI_INTERVIEW_STATUS_LABEL: Record<AiInterviewDetail["status"], string> = {
  CREATED: "Created",
  SENT: "Invitation sent",
  ACCESSED: "Accessed",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
}

const AI_INTERVIEW_STATUS_VARIANT: Record<AiInterviewDetail["status"], "default" | "secondary" | "warning" | "info" | "outline" | "success" | "error"> = {
  CREATED: "secondary",
  SENT: "info",
  ACCESSED: "warning",
  READY: "warning",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
  EXPIRED: "outline",
  FAILED: "error",
}

interface AiInterviewPanelProps {
  applicationId: string
  candidateName: string
  jobTitle: string
  interviews: AiInterviewDetail[]
  onInterviewScheduled: () => void
}

function AiInterviewPanel({
  applicationId,
  candidateName,
  jobTitle,
  interviews,
  onInterviewScheduled,
}: AiInterviewPanelProps) {
  const [modalOpen, setModalOpen] = React.useState(false)

  const activeInterview = interviews.find(
    (i) => !["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"].includes(i.status),
  )
  const latestCompleted = interviews.find((i) => i.status === "COMPLETED")

  const handleModalClose = (open: boolean) => {
    setModalOpen(open)
    if (!open) onInterviewScheduled()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-4 w-4" aria-hidden="true" />
            AI Interview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {interviews.length === 0 ? (
            <>
              <p className="text-sm text-muted">No AI interview has been scheduled yet.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setModalOpen(true)}
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                Schedule AI interview
              </Button>
            </>
          ) : (
            <>
              {activeInterview && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Active</span>
                    <Badge variant={AI_INTERVIEW_STATUS_VARIANT[activeInterview.status]}>
                      {AI_INTERVIEW_STATUS_LABEL[activeInterview.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    Created {new Date(activeInterview.createdAt).toLocaleDateString()}
                    {activeInterview.invitationSentAt && (
                      <> · Sent {new Date(activeInterview.invitationSentAt).toLocaleDateString()}</>
                    )}
                  </p>
                  {(activeInterview.status === "CREATED" || activeInterview.status === "SENT") && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => setModalOpen(true)}
                    >
                      <Video className="h-4 w-4" aria-hidden="true" />
                      {activeInterview.status === "SENT" ? "Resend invitation" : "Send invitation"}
                    </Button>
                  )}
                </div>
              )}
              {latestCompleted && !activeInterview && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Last interview</span>
                    <Badge variant="success">Completed</Badge>
                  </div>
                  {latestCompleted.completedAt && (
                    <p className="text-xs text-muted">
                      Completed {new Date(latestCompleted.completedAt).toLocaleString()}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setModalOpen(true)}
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    Schedule new interview
                  </Button>
                </div>
              )}
              <Link
                href={`/ai-interviews?applicationId=${applicationId}`}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground underline underline-offset-4"
              >
                View all interviews ({interviews.length})
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <SendAiInterviewModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        candidateName={candidateName}
        candidateEmail=""
        jobTitle={jobTitle}
        applicationId={applicationId}
      />
    </>
  )
}

// ── Notes Card ────────────────────────────────────────────────────

interface NotesCardProps {
  applicationId: string
  notes: ApplicationNote[]
  onNoteAdded: () => void
}

const MAX_NOTE_LENGTH = 10000

function NotesCard({ applicationId, notes, onNoteAdded }: NotesCardProps) {
  const [content, setContent] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const trimmed = content.trim()
  const isEmpty = trimmed.length === 0
  const tooLong = trimmed.length > MAX_NOTE_LENGTH

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isEmpty || tooLong || busy) return
    setError(null)
    setBusy(true)
    try {
      await createApplicationNote(applicationId, { content: trimmed })
      setContent("")
      textareaRef.current?.focus()
      onNoteAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : "The note could not be saved. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing notes */}
        {notes.length > 0 ? (
          <ol className="space-y-3" aria-label="Application notes">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg bg-surface-elevated p-3 text-sm space-y-1">
                <p className="whitespace-pre-wrap break-words">{note.content}</p>
                <p className="text-xs text-muted">
                  {new Date(note.createdAt).toLocaleString()}
                  {note.editedAt && " · edited"}
                  {note.visibility === "PRIVATE" && " · private"}
                  {note.visibility === "COMPANY" && " · visible to company"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No notes have been added.</p>
        )}

        {/* Add note form */}
        <form onSubmit={handleSubmit} aria-label="Add note">
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="note-content">
            Add a note
          </label>
          <textarea
            id="note-content"
            ref={textareaRef}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            rows={3}
            placeholder="Internal notes are visible only to your team."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={busy}
            maxLength={MAX_NOTE_LENGTH + 1}
            aria-describedby={error ? "note-error" : tooLong ? "note-length-warning" : undefined}
          />
          {tooLong && (
            <p id="note-length-warning" className="mt-1 text-xs text-error" role="alert">
              Note must be {MAX_NOTE_LENGTH.toLocaleString()} characters or fewer.
            </p>
          )}
          {error && (
            <p id="note-error" className="mt-1 text-xs text-error" role="alert">{error}</p>
          )}
          <div className="mt-2 flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={isEmpty || tooLong || busy}
              aria-busy={busy}
            >
              {busy ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Screening Status Card ──────────────────────────────────────────

function ScreeningStatusCard({ screening }: { screening: AiScreeningResultDto | null }) {
  const status = screening?.status

  if (status === "COMPLETED" && screening) {
    return <ScreeningResultView result={screening} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>AI screening</span>
          <ScreeningStatusBadge status={status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        {status === "RUNNING" || status === "PENDING"
          ? "AI screening is in progress. Results will appear when complete."
          : status === "FAILED"
            ? (screening?.failureMessageSafe || "AI screening failed. You can retry from the AI screener.")
            : "No completed screening result is available for this application."}
        {(status === "RUNNING" || status === "PENDING" || status === "FAILED") && (
          <p className="mt-2">
            <Link
              href={screening?.applicationId ? `/ai-screener?applicationId=${screening.applicationId}` : "/ai-screener"}
              className="inline-flex items-center gap-1 text-sm underline underline-offset-4 hover:text-foreground"
            >
              Open AI screener
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── ApplicationWorkspace ───────────────────────────────────────────

export function ApplicationWorkspace() {
  const { applicationId } = useParams<{ applicationId: string }>()
  const [application, setApplication] = React.useState<ApplicationDetail | null>(null)
  const [screening, setScreening] = React.useState<AiScreeningResultDto | null>(null)
  const [interviews, setInterviews] = React.useState<AiInterviewDetail[]>([])
  const [pipelineStages, setPipelineStages] = React.useState<PipelineStageDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reviewSessionId, setReviewSessionId] = React.useState<string | null>(null)

  const loadData = React.useCallback(
    (id: string) => {
      let active = true
      setLoading(true)
      setError(null)
      Promise.all([
        fetchApplicationById(id),
        getLatestAiScreening(id).catch(() => null),
        getAiInterviewsByApplication(id).catch(() => []),
      ])
        .then(([detail, result, interviewList]) => {
          if (!active) return
          setApplication(detail)
          setScreening(result)
          setInterviews(interviewList)
          // Load pipeline stages when we know the job id
          if (detail.job?.id) {
            getJobPipeline(detail.job.id)
              .then((pipeline) => { if (active) setPipelineStages(pipeline.stages) })
              .catch(() => { if (active) setPipelineStages([]) })
          }
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "This application could not be loaded.")
        })
        .finally(() => { if (active) setLoading(false) })
      return () => { active = false }
    },
    [],
  )

  React.useEffect(() => {
    if (!applicationId) return
    return loadData(applicationId)
  }, [applicationId, loadData])

  const handleActionComplete = React.useCallback(() => {
    if (applicationId) loadData(applicationId)
  }, [applicationId, loadData])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (error || !application) {
    return (
      <EmptyState
        title="Application unavailable"
        description={error || "This application was not found."}
        action={
          <Link
            href="/applications"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-hover"
          >
            Back to applications
          </Link>
        }
      />
    )
  }

  const candidate = application.candidate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <Link
          href={application.job ? `/jobs/${application.job.id}/applications` : "/applications"}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Applications
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {candidate?.displayName || "Candidate unavailable"}
          </h1>
          <ApplicationStatusBadge status={application.status} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {application.job?.title || "Job unavailable"} · Application #{application.applicationNumber}
        </p>
      </div>

      {/* Main content */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Application overview */}
          <Card>
            <CardHeader>
              <CardTitle>Application overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted">Pipeline stage</p>
                <p className="mt-1 font-medium">{application.currentStage?.name || "Not assigned"}</p>
              </div>
              <div>
                <p className="text-muted">Source</p>
                <p className="mt-1 font-medium">{application.source || "Unavailable"}</p>
              </div>
              <div>
                <p className="text-muted">Submitted</p>
                <p className="mt-1 font-medium">
                  {application.submittedAt
                    ? new Date(application.submittedAt).toLocaleDateString()
                    : "Not submitted"}
                </p>
              </div>
              <div>
                <p className="text-muted">Stage updates</p>
                <p className="mt-1 font-medium">{application.stageHistory.length}</p>
              </div>
            </CardContent>
          </Card>

          {/* AI screening */}
          <ScreeningStatusCard screening={screening} />

          {/* Assessment */}
          <ApplicationAssessmentPanel applicationId={applicationId} onReview={setReviewSessionId} />

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {application.stageHistory.length ? (
                <ol className="space-y-3">
                  {application.stageHistory.map((event) => (
                    <li key={event.id} className="border-l-2 border-border pl-3 text-sm">
                      <p className="font-medium">{event.name}</p>
                      <p className="text-muted">{new Date(event.occurredAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No application stage history is available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-5">
          {/* Candidate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                Candidate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{candidate?.displayName || "Unavailable"}</p>
              {candidate?.headline && <p className="text-muted">{candidate.headline}</p>}
              {candidate?.email && <p>{candidate.email}</p>}
              <Link
                href={`/candidates/${candidate?.id}?from=/applications/${applicationId}`}
                className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-hover"
              >
                View candidate profile
              </Link>
            </CardContent>
          </Card>

          {/* Recruiter actions */}
          <RecruiterActionsPanel
            application={application}
            screening={screening}
            pipelineStages={pipelineStages}
            onActionComplete={handleActionComplete}
          />

          {/* AI interview */}
          <AiInterviewPanel
            applicationId={applicationId}
            candidateName={application.candidate?.displayName || "Candidate"}
            jobTitle={application.job?.title || "Position"}
            interviews={interviews}
            onInterviewScheduled={handleActionComplete}
          />

          {/* Notes */}
          <NotesCard
            applicationId={applicationId}
            notes={application.notes}
            onNoteAdded={handleActionComplete}
          />

          {/* Application answers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Application answers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">
                Application answer details are available through the existing protected API.
                They are intentionally not inferred from candidate information.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Assessment result dialog */}
      {reviewSessionId && (
        <Dialog open onOpenChange={() => setReviewSessionId(null)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Assessment result</DialogTitle>
            </DialogHeader>
            <AssessmentResultView sessionId={reviewSessionId} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
