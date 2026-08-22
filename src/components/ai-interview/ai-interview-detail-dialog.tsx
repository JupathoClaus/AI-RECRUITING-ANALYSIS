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
import type { AiInterviewDetail, AiInterviewStatus, TranscriptTurn } from "@/lib/api/ai-interviews.api"
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
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString()
}

function durationBetween(start: string | null, end: string | null): string {
  if (!start || !end) return "—"
  const minutes = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  return `${minutes} min`
}

export function AiInterviewDetailDialog({
  interview,
  open,
  onOpenChange,
}: AiInterviewDetailDialogProps) {
  const candidate = interview.application?.candidate
  const job = interview.application?.job

  const transcriptTurns: TranscriptTurn[] = Array.isArray(interview.transcript)
    ? interview.transcript
    : []

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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[interview.status]}>
              {STATUS_LABEL[interview.status]}
            </Badge>
            <Badge variant="outline">{interview.provider}</Badge>
            <Badge variant="secondary">
              {interview.language.toUpperCase()}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <User className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Candidate</p>
                <p className="text-sm font-semibold text-foreground">
                  {candidate ? `${candidate.firstName} ${candidate.lastName}` : "—"}
                </p>
                {candidate?.email && <p className="text-xs text-muted">{candidate.email}</p>}
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3">
              <Briefcase className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Job</p>
                <p className="text-sm font-semibold text-foreground">{job?.title || "—"}</p>
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
                    <> · Sent {formatDateTime(interview.invitationSentAt)}</>
                  )}
                </p>
                <p className="text-xs text-muted">
                  Started {formatDateTime(interview.startedAt)} · Completed{" "}
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
                  Code hint {interview.codeDisplayHint || "—"}
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

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Recording</h3>
              <Badge variant={interview.recordingStatus === "READY" ? "success" : "outline"}>
                {interview.recordingStatus === "READY" ? "Ready" : interview.recordingStatus ?? "Not available"}
              </Badge>
            </div>
            {interview.recordingUrl ? (
              <a
                href={interview.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary hover:bg-surface-hover"
              >
                <Video className="h-3.5 w-3.5" />
                Open recording reference
              </a>
            ) : (
              <p className="text-xs text-muted">
                {interview.recordingStatus === "FAILED"
                  ? "Recording delivery failed at the provider."
                  : "No recording reference yet."}
              </p>
            )}
            {interview.tavusConversationId && (
              <p className="text-[10px] text-muted">
                Provider reference: {interview.tavusConversationId}
              </p>
            )}
          </div>

          <div className="space-y-3">
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
                    : interview.transcriptStatus ?? "Pending"}
              </Badge>
            </div>

            {transcriptTurns.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated/60 p-3">
                {transcriptTurns.map((turn, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Badge
                      variant={turn.role === "assistant" ? "info" : "secondary"}
                      className="shrink-0 capitalize"
                    >
                      {turn.role === "assistant" ? "Interviewer" : turn.role ?? "Candidate"}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-foreground">{turn.content}</p>
                      {typeof turn.seconds_from_start === "number" && (
                        <p className="text-[10px] text-muted">
                          {Math.round(turn.seconds_from_start)}s
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">
                {interview.transcriptStatus === "READY"
                  ? "Transcript is ready but has no retrievable turns."
                  : interview.transcriptStatus === "FAILED"
                    ? "Transcript generation failed."
                    : "Transcript is not available yet."}
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}