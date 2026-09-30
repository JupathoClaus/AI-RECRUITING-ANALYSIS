"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ModalHeader } from "@/components/ui/modal-header"
import { Button } from "@/components/ui/button"
import {
  getAiInterview,
  syncAiInterviewArtifacts,
  getRecordingPlayback,
  getAiInterviewEvaluation,
  reEvaluateAiInterview,
  recordAiInterviewDecision,
  type AiInterviewDetail,
  type AiInterviewStatus,
  type AiInterviewEvaluationResponse,
  type AiInterviewEvaluationRecommendation,
  type AiInterviewEvidenceVerification,
  type TranscriptTurn,
} from "@/lib/api/ai-interviews.api"
import {
  MagicStar,
  Clock,
  Link2,
  DocumentText,
  Video,
  Calendar,
  LanguageSquare,
  User,
  Briefcase,
  Refresh,
  Star1,
  InfoCircle,
  Warning2,
} from "iconsax-react"

const STATUS_LABEL: Record<AiInterviewStatus, string> = {
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

const STATUS_VARIANT: Record<AiInterviewStatus, "default" | "secondary" | "warning" | "info" | "outline" | "success" | "error"> = {
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

interface AiInterviewDetailDialogProps {
  interview: AiInterviewDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefreshed?: (updated: AiInterviewDetail) => void
}

function formatDateTime(value: string | null): string {
  if (!value) return "â€”"
  return new Date(value).toLocaleString()
}

function durationBetween(start: string | null, end: string | null): string {
  if (!start || !end) return "â€”"
  const minutes = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  return `${minutes} min`
}

function speakerLabel(role?: string): string {
  if (role === "assistant") return "AI Interviewer"
  if (role === "user") return "Candidate"
  return "System"
}

function transcriptProcessing(interview: AiInterviewDetail): boolean {
  return (
    interview.transcriptStatus === "NOT_REQUESTED" ||
    interview.transcriptStatus === "PENDING"
  )
}

function recordingProcessing(interview: AiInterviewDetail): boolean {
  return interview.recordingStatus === "PROCESSING"
}

const RECOMMENDATION_LABEL: Record<AiInterviewEvaluationRecommendation, string> = {
  PASS: "Pass",
  HOLD: "Hold",
  FAIL: "Fail",
}

const RECOMMENDATION_VARIANT: Record<AiInterviewEvaluationRecommendation, "success" | "warning" | "error"> = {
  PASS: "success",
  HOLD: "warning",
  FAIL: "error",
}

const VERIFICATION_LABEL: Record<AiInterviewEvidenceVerification, string> = {
  VERBATIM: "Verbatim",
  SUPPORTED: "Supported",
  INFERRED: "Inferred",
  UNVERIFIED: "Unverified",
}

const VERIFICATION_VARIANT: Record<AiInterviewEvidenceVerification, "success" | "info" | "warning" | "error"> = {
  VERBATIM: "success",
  SUPPORTED: "info",
  INFERRED: "warning",
  UNVERIFIED: "error",
}

export function AiInterviewDetailDialog({
  interview,
  open,
  onOpenChange,
  onRefreshed,
}: AiInterviewDetailDialogProps) {
const [syncing, setSyncing] = React.useState(false)
  const [syncError, setSyncError] = React.useState("")
  const [playback, setPlayback] = React.useState<{
    playbackUrl: string
    expiresAt: string
  } | null>(null)
  const [playbackLoading, setPlaybackLoading] = React.useState(false)
  const [playbackError, setPlaybackError] = React.useState("")
  const [playerOpen, setPlayerOpen] = React.useState(false)
  const [evaluation, setEvaluation] = React.useState<AiInterviewEvaluationResponse | null>(null)
  const [evaluationLoading, setEvaluationLoading] = React.useState(false)
  const [evaluationError, setEvaluationError] = React.useState("")
  const [reevaluating, setReevaluating] = React.useState(false)
  const [decision, setDecision] = React.useState<AiInterviewEvaluationRecommendation | "">("")
  const [decisionNote, setDecisionNote] = React.useState("")
  const [decisionSaving, setDecisionSaving] = React.useState(false)
  const [decisionError, setDecisionError] = React.useState("")
  const [highlightedSegments, setHighlightedSegments] = React.useState<number[]>([])
  const transcriptRef = React.useRef<HTMLDivElement | null>(null)

  const handleViewEvidence = React.useCallback((segmentIndexes: number[]) => {
    setHighlightedSegments((prev) =>
      JSON.stringify(prev) === JSON.stringify(segmentIndexes) ? [] : segmentIndexes,
    )
    requestAnimationFrame(() => {
      transcriptRef.current?.scrollIntoView?.({ behavior: "auto", block: "center" })
    })
  }, [])

  const loadEvaluation = React.useCallback(async (silent = false) => {
    if (!silent) setEvaluationLoading(true)
    setEvaluationError("")
    try {
      const result = await getAiInterviewEvaluation(interview.id)
      setEvaluation(result)
      setDecision(result.report?.recruiterDecision ?? "")
      setDecisionNote(result.report?.decisionNote ?? "")
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : "Could not load the evaluation report.")
    } finally {
      if (!silent) setEvaluationLoading(false)
    }
  }, [interview.id])

  const handlePlay = React.useCallback(async () => {
    setPlaybackLoading(true)
    setPlaybackError("")
    try {
      const result = await getRecordingPlayback(interview.id)
      setPlayback(result)
      setPlayerOpen(true)
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : "The recording could not be prepared for playback.")
    } finally {
      setPlaybackLoading(false)
    }
  }, [interview.id])

  const refresh = React.useCallback(
    async (silent = false) => {
      if (!silent) setSyncing(true)
      setSyncError("")
      try {
        const updated = await getAiInterview(interview.id)
        onRefreshed?.(updated)
        return updated
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : "Could not refresh interview details.")
        return null
      } finally {
        if (!silent) setSyncing(false)
      }
    },
    [interview.id, onRefreshed],
  )

  const handleSync = React.useCallback(async () => {
    setSyncing(true)
    setSyncError("")
    try {
      await syncAiInterviewArtifacts(interview.id)
      await refresh(true)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Could not synchronize interview artifacts.")
    } finally {
      setSyncing(false)
    }
  }, [interview.id, refresh])

// Bounded polling while artifacts are still processing and the dialog is open.
  const interviewId = interview.id
  const transcriptPendingNow = transcriptProcessing(interview)
  const recordingPendingNow = recordingProcessing(interview)

  React.useEffect(() => {
    if (open) return
    setHighlightedSegments([])
  }, [open])

  React.useEffect(() => {
    if (!open) return
    void loadEvaluation()
  }, [open, interviewId, loadEvaluation])

  const evaluationPending = evaluation?.evaluationStatus === "PENDING" || evaluation?.evaluationStatus === "RUNNING"
  React.useEffect(() => {
    if (!open || !evaluationPending) return
    let attempts = 0
    const maxAttempts = 5
    const timer = setInterval(async () => {
      attempts += 1
      const result = await getAiInterviewEvaluation(interviewId).catch(() => null)
      if (result) {
        setEvaluation(result)
        if (result.evaluationStatus !== "PENDING" && result.evaluationStatus !== "RUNNING") {
          clearInterval(timer)
        }
      }
      if (attempts >= maxAttempts) clearInterval(timer)
    }, 15000)
    return () => clearInterval(timer)
  }, [open, interviewId, evaluationPending])

  const handleReevaluate = React.useCallback(async () => {
    setReevaluating(true)
    setEvaluationError("")
    try {
      await reEvaluateAiInterview(interview.id)
      await loadEvaluation(true)
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : "Could not start a re-evaluation.")
    } finally {
      setReevaluating(false)
    }
  }, [interview.id, loadEvaluation])

  const handleSaveDecision = React.useCallback(async () => {
    if (!decision) return
    setDecisionSaving(true)
    setDecisionError("")
    try {
      await recordAiInterviewDecision(interview.id, { decision, note: decisionNote.trim() || undefined })
      await loadEvaluation(true)
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : "Could not record the decision.")
    } finally {
      setDecisionSaving(false)
    }
  }, [decision, decisionNote, interview.id, loadEvaluation])

  React.useEffect(() => {
    if (!open) return
    if (!transcriptPendingNow && !recordingPendingNow) return

    let attempts = 0
    const maxAttempts = 6
    const timer = setInterval(async () => {
      attempts += 1
      try {
        const result = await syncAiInterviewArtifacts(interviewId)
        const done =
          (result.transcriptStatus === "READY" || result.transcriptStatus === "FAILED") &&
          (result.recordingStatus === "READY" ||
            result.recordingStatus === "FAILED" ||
            result.recordingStatus == null)
        if (done || attempts >= maxAttempts) {
          clearInterval(timer)
        }
        const updated = await getAiInterview(interviewId)
        onRefreshed?.(updated)
      } catch {
        if (attempts >= maxAttempts) clearInterval(timer)
      }
    }, 20000)
    return () => clearInterval(timer)
  }, [open, interviewId, transcriptPendingNow, recordingPendingNow, onRefreshed])

  const candidate = interview.application?.candidate
  const job = interview.application?.job

  const transcriptTurns: TranscriptTurn[] = Array.isArray(interview.transcript)
    ? interview.transcript.filter((t) => t.role === "assistant" || t.role === "user")
    : []
  const transcriptPending = transcriptProcessing(interview)
  const recordingPending = recordingProcessing(interview)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" tabIndex={0}>
        <ModalHeader>
          <DialogTitle className="flex items-center gap-2">
            <MagicStar className="h-5 w-5 text-primary" />
            AI Interview Details
          </DialogTitle>
          <DialogDescription>
            Candidate interview record for {candidate ? `${candidate.firstName} ${candidate.lastName}` : "candidate"}.
          </DialogDescription>
        </ModalHeader>

        <div className="space-y-5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[interview.status]}>
                {STATUS_LABEL[interview.status]}
              </Badge>
              <Badge variant="outline">{interview.provider}</Badge>
              <Badge variant="secondary">
                {interview.language.toUpperCase()}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? (
                <Refresh className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Refresh className="h-3.5 w-3.5" />
              )}
              {syncing ? "Synchronizingâ€¦" : "Refresh"}
            </Button>
          </div>

          {syncError && (
            <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error" role="alert">
              {syncError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <User className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Candidate</p>
                <p className="text-sm font-semibold text-foreground">
                  {candidate ? `${candidate.firstName} ${candidate.lastName}` : "â€”"}
                </p>
                {candidate?.email && <p className="text-xs text-muted">{candidate.email}</p>}
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <Briefcase className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Job</p>
                <p className="text-sm font-semibold text-foreground">{job?.title || "â€”"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <Clock className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Duration</p>
                <p className="text-sm font-semibold text-foreground">
                  Estimated {interview.estimatedDurationMinutes} min
                </p>
                <p className="text-xs text-muted">
                  Actual {durationBetween(interview.startedAt, interview.completedAt)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <LanguageSquare className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Language</p>
                <p className="text-sm font-semibold text-foreground">
                  {interview.language || "en"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <Calendar className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Timeline</p>
                <p className="text-xs text-muted">
                  Created {formatDateTime(interview.createdAt)}
                  {interview.invitationSentAt && (
                    <> Â· Sent {formatDateTime(interview.invitationSentAt)}</>
                  )}
                </p>
                <p className="text-xs text-muted">
                  Started {formatDateTime(interview.startedAt)} Â· Completed{" "}
                  {formatDateTime(interview.completedAt)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <Link2 className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Invitation</p>
                <p className="text-xs text-muted">
                  {interview.invitationEmail || "Not sent yet"}
                </p>
                <p className="text-xs text-muted">
                  Code hint {interview.codeDisplayHint || "â€”"}
                </p>
              </div>
            </div>
          </div>

          {interview.accommodationRequested && (
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                Accommodation requested
              </p>
              <p className="mt-1 text-sm text-foreground">
                {interview.accommodationNotes || "Adjustment requested (no details provided)."}
              </p>
            </div>
          )}

          <Separator />

          <section className="space-y-3" aria-label="Interview recording">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Interview Recording</h3>
              <Badge
                variant={
                  interview.recordingStatus === "READY"
                    ? "success"
                    : interview.recordingStatus === "FAILED"
                      ? "error"
                      : "outline"
                }
              >
                {interview.recordingStatus === "READY"
                  ? "Ready"
                  : interview.recordingStatus === "FAILED"
                    ? "Failed"
                    : recordingPending
                      ? "Processingâ€¦"
                      : "Unavailable"}
              </Badge>
            </div>

{interview.recordingStatus === "READY" && interview.recordingUrl ? (
              <div className="space-y-2">
                {/^https?:\/\//.test(interview.recordingUrl) ? (
                  <a
                    href={interview.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Watch Recording
                  </a>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void handlePlay()}
                    disabled={playbackLoading}
                  >
                    {playbackLoading ? (
                      <Refresh className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Video className="h-3.5 w-3.5" />
                    )}
                    {playbackLoading ? "Preparing…" : "Play Recording"}
                  </Button>
                )}
                {playbackError && (
                  <p className="text-xs text-error" role="alert">{playbackError}</p>
                )}
                {interview.recordingMetadata && (
                  <p className="text-[11px] text-muted">
                    {typeof interview.recordingMetadata.duration === "number"
                      ? `Duration ${Math.round(interview.recordingMetadata.duration)}s · `
                      : ""}
                    Provider {interview.recordingMetadata.storage_provider ?? "storage"} · Secure storage
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">
                {interview.recordingStatus === "FAILED"
                  ? "Recording delivery failed at the provider."
                  : recordingPending
                    ? "Recording is being processed by the provider. It will appear here when ready."
                    : "No recording was produced for this interview."}
              </p>
            )}
            {interview.tavusConversationId && (
              <p className="text-[10px] text-muted">
                Provider reference: {interview.tavusConversationId}
              </p>
            )}
          </section>

          <section className="space-y-3" aria-label="Interview transcript">
            <div className="flex items-center gap-2">
              <DocumentText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Transcript</h3>
              <Badge
                variant={
                  interview.transcriptStatus === "READY"
                    ? "success"
                    : interview.transcriptStatus === "FAILED"
                      ? "error"
                      : "outline"
                }
              >
                {interview.transcriptStatus === "READY"
                  ? "Ready"
                  : interview.transcriptStatus === "FAILED"
                    ? "Failed"
                    : transcriptPending
                      ? "Processingâ€¦"
                      : "Unavailable"}
              </Badge>
            </div>

            {transcriptTurns.length > 0 ? (
              <div
                ref={transcriptRef}
                tabIndex={0}
                className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated/60 p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {interview.transcript?.map((turn, rawIndex) => {
                  if (turn.role !== "assistant" && turn.role !== "user") return null
                  const isHighlighted = highlightedSegments.includes(rawIndex)
                  return (
                    <div
                      key={rawIndex}
                      className={`flex flex-col gap-1 ${
                        isHighlighted ? "rounded-lg border border-primary/50 bg-primary/10 px-2 py-1" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={turn.role === "assistant" ? "info" : "secondary"}
                          className="shrink-0"
                        >
                          {speakerLabel(turn.role)}
                        </Badge>
                        {typeof turn.seconds_from_start === "number" && (
                          <span
                            className={`text-[10px] tabular-nums ${
                              isHighlighted ? "text-foreground" : "text-muted"
                            }`}
                          >
                            {Math.round(turn.seconds_from_start)}s
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-foreground">{turn.content}</p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted">
                {interview.transcriptStatus === "READY"
                  ? "Transcript is ready but has no retrievable turns."
                  : interview.transcriptStatus === "FAILED"
                    ? "Transcript generation failed."
                    : transcriptPending
                      ? "Transcript is being processed. It will appear here when ready."
                      : "No transcript was produced for this interview."}
              </p>
            )}

{interview.transcriptUrl && (
              <a
                href={interview.transcriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary hover:bg-surface-hover"
              >
                <DocumentText className="h-3.5 w-3.5" />
                Open transcript file
              </a>
            )}
          </section>

          <Separator />

          <section className="space-y-3" aria-label="AI evaluation report">
            <div className="flex items-center gap-2">
              <Star1 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">AI Evaluation</h3>
              <Badge
                variant={
                  evaluation?.evaluationStatus === "COMPLETED"
                    ? "success"
                    : evaluation?.evaluationStatus === "FAILED"
                      ? "error"
                      : evaluation?.evaluationStatus === "PENDING" || evaluation?.evaluationStatus === "RUNNING"
                        ? "warning"
                        : "outline"
                }
              >
                {evaluation?.evaluationStatus === "COMPLETED"
                  ? "Evaluated"
                  : evaluation?.evaluationStatus === "FAILED"
                    ? "Failed"
                    : evaluation?.evaluationStatus === "PENDING" || evaluation?.evaluationStatus === "RUNNING"
                      ? "Evaluating\u2026"
                      : "Not evaluated"}
              </Badge>
            </div>

            {evaluationLoading && !evaluation && (
              <p className="text-xs text-muted">Loading evaluation report\u2026</p>
            )}
            {evaluationError && (
              <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error" role="alert">
                {evaluationError}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 px-2 text-xs"
                  onClick={() => void loadEvaluation()}
                >
                  Retry
                </Button>
              </div>
            )}

            {evaluation?.evaluationStatus === "COMPLETED" && evaluation.report ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {typeof evaluation.report.totalScore === "number"
                        ? Math.round(evaluation.report.totalScore)
                        : "\u2014"}
                      <span className="text-sm font-medium text-muted">
                        /{evaluation.report.maximumScore ?? 100}
                      </span>
                    </span>
                    <Badge variant={RECOMMENDATION_VARIANT[evaluation.report.recommendation ?? "HOLD"]}>
                      {RECOMMENDATION_LABEL[evaluation.report.recommendation ?? "HOLD"]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                    <Badge variant="secondary">Confidence {evaluation.report.confidence ?? "n/a"}</Badge>
                    <Badge variant="secondary">Attempt {evaluation.report.attempt}</Badge>
                    {evaluation.report.latencyMs != null && (
                      <Badge variant="secondary">{evaluation.report.latencyMs}ms</Badge>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 px-3 py-2 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <InfoCircle className="h-3.5 w-3.5 shrink-0" />
                    AI-assisted draft produced by {evaluation.report.provider ?? "the AI provider"}
                    {evaluation.report.model ? ` (${evaluation.report.model})` : ""} · prompt v
                    {evaluation.report.promptVersion ?? "?"} · schema v{evaluation.report.schemaVersion ?? "?"}. The
                    AI never decides: review this against the transcript and record the final decision.
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Strengths</p>
                    <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                      {evaluation.report.strengths.length > 0 ? (
                        evaluation.report.strengths.map((s, i) => <li key={i}>- {s}</li>)
                      ) : (
                        <li className="text-xs text-muted">None highlighted.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Gaps</p>
                    <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                      {evaluation.report.gaps.length > 0 ? (
                        evaluation.report.gaps.map((g, i) => <li key={i}>- {g}</li>)
                      ) : (
                        <li className="text-xs text-muted">None highlighted.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Uncertainties</p>
                    <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                      {evaluation.report.uncertainties.length > 0 ? (
                        evaluation.report.uncertainties.map((u, i) => <li key={i}>- {u}</li>)
                      ) : (
                        <li className="text-xs text-muted">None reported.</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Competency breakdown</p>
                  {evaluation.report.competencies.map((c) => {
                    const pct = c.maxScore > 0 ? Math.round((c.score / c.maxScore) * 100) : 0
                    return (
                      <div
                        key={c.competency}
                        className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{c.competency}</p>
                          <div className="flex items-center gap-1.5 text-xs">
                            <Badge variant="secondary">
                              {c.score}/{c.maxScore} · {c.confidence}
                            </Badge>
                            <Badge
                              variant={
                                c.status === "MET"
                                  ? "success"
                                  : c.status === "PARTIALLY_MET"
                                    ? "warning"
                                    : c.status === "NOT_MET"
                                      ? "error"
                                      : "outline"
                              }
                            >
                              {c.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {c.rationale && <p className="mt-2 text-xs text-muted">{c.rationale}</p>}
                        {c.evidence.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {c.evidence.map((e, i) => (
                              <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                                <Badge variant={VERIFICATION_VARIANT[e.verification]}>
                                  {VERIFICATION_LABEL[e.verification]}
                                </Badge>
                                <span className="text-foreground">"{e.quote}"</span>
                                {typeof e.sourceSeconds === "number" && (
                                  <span className="tabular-nums text-muted">
                                    @{Math.round(e.sourceSeconds)}s
                                  </span>
                                )}
                                {e.excerpt && e.excerpt !== e.quote && (
                                  <span className="w-full text-muted">
                                    Transcript: "{e.excerpt}"
                                  </span>
                                )}
                                {e.segmentIndexes.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleViewEvidence(e.segmentIndexes)}
                                    className="text-primary underline underline-offset-2 hover:text-primary-hover"
                                  >
                                    View in transcript
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-elevated/60 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                    Recruiter decision
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {(["PASS", "HOLD", "FAIL"] as const).map((d) => (
                      <Button
                        key={d}
                        size="sm"
                        variant={decision === d ? "default" : "outline"}
                        onClick={() => setDecision(d)}
                        disabled={decisionSaving}
                      >
                        {RECOMMENDATION_LABEL[d]}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!decision || decisionSaving}
                      onClick={() => void handleSaveDecision()}
                    >
                      {decisionSaving ? "Saving\u2026" : "Save decision"}
                    </Button>
                  </div>
                  <input
                    type="text"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Optional note about this decision\u2026"
                    disabled={decisionSaving}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted focus:border-primary"
                  />
                  {decisionError && (
                    <p className="text-xs text-error" role="alert">{decisionError}</p>
                  )}
                  {evaluation.report.recruiterDecision && (
                    <p className="text-xs text-muted">
                      Last decision: {RECOMMENDATION_LABEL[evaluation.report.recruiterDecision]}
                      {evaluation.report.decidedAt
                        ? ` · ${new Date(evaluation.report.decidedAt).toLocaleString()}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            ) : evaluation?.evaluationStatus === "FAILED" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error" role="alert">
                  <span className="flex items-center gap-1.5">
                    <Warning2 className="h-4 w-4 shrink-0" />
                    The evaluation failed and no score was produced.
                  </span>
                  {evaluation.report?.failureMessageSafe && (
                    <p className="mt-1 text-xs opacity-80">{evaluation.report.failureMessageSafe}</p>
                  )}
                  {evaluation.report?.failureCode && (
                    <p className="text-[11px] opacity-70">{evaluation.report.failureCode}</p>
                  )}
                </div>
                {evaluation.report?.uncertainties && evaluation.report.uncertainties.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted">
                    {evaluation.report.uncertainties.map((u, i) => (
                      <li key={i}>- {u}</li>
                    ))}
                  </ul>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleReevaluate()}
                  disabled={reevaluating || interview.status !== "COMPLETED"}
                >
                  {reevaluating ? <Refresh className="h-3.5 w-3.5 animate-spin" /> : <Refresh className="h-3.5 w-3.5" />}
                  {reevaluating ? "Starting\u2026" : "Re-evaluate"}
                </Button>
              </div>
            ) : evaluation?.evaluationStatus === "PENDING" || evaluation?.evaluationStatus === "RUNNING" ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <Refresh className="h-3.5 w-3.5 animate-spin" />
                Evaluation in progress\u2026 this report will refresh automatically.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  No evaluation has been produced for this interview yet. Completed interviews with a transcript are
                  evaluated automatically.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleReevaluate()}
                  disabled={reevaluating || interview.status !== "COMPLETED"}
                >
                  {reevaluating ? <Refresh className="h-3.5 w-3.5 animate-spin" /> : <Star1 className="h-3.5 w-3.5" />}
                  {reevaluating ? "Starting\u2026" : "Evaluate now"}
                </Button>
              </div>
            )}
          </section>
        </div>
      </DialogContent>

      {playerOpen && playback && (
        <Dialog open={playerOpen} onOpenChange={(o) => { if (!o) { setPlayerOpen(false); setPlayback(null) } }}>
          <DialogContent className="sm:max-w-2xl">
            <ModalHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Interview Recording
              </DialogTitle>
              <DialogDescription>
                {candidate ? `${candidate.firstName} ${candidate.lastName}` : "Candidate"}
                {job ? ` · ${job.title}` : ""}
              </DialogDescription>
            </ModalHeader>
            <div className="space-y-3 py-2">
              <video
                src={playback.playbackUrl}
                controls
                preload="metadata"
                className="w-full rounded-lg bg-foreground/5 ring-1 ring-border"
                aria-label="Interview recording"
              />
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {typeof interview.recordingMetadata?.duration === "number"
                    ? `Duration ${Math.round(interview.recordingMetadata.duration)}s`
                    : "Interview recording"}
                </span>
                <span>Signed access expires {new Date(playback.expiresAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => { setPlayerOpen(false); setPlayback(null) }}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}
