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
  type AiInterviewDetail,
  type AiInterviewStatus,
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

export function AiInterviewDetailDialog({
  interview,
  open,
  onOpenChange,
  onRefreshed,
}: AiInterviewDetailDialogProps) {
  const [syncing, setSyncing] = React.useState(false)
  const [syncError, setSyncError] = React.useState("")

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
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
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
                  <a
                    href={interview.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary hover:bg-surface-hover"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Open recording reference
                  </a>
                )}
                <p className="text-[10px] text-muted break-all">{interview.recordingUrl}</p>
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
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated/60 p-3">
                {transcriptTurns.map((turn, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={turn.role === "assistant" ? "info" : "secondary"}
                        className="shrink-0"
                      >
                        {speakerLabel(turn.role)}
                      </Badge>
                      {typeof turn.seconds_from_start === "number" && (
                        <span className="text-[10px] tabular-nums text-muted">
                          {Math.round(turn.seconds_from_start)}s
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{turn.content}</p>
                  </div>
                ))}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
