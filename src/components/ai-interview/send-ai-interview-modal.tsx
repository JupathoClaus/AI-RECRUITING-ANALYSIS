"use client"

import * as React from "react"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  createAiInterview,
  sendAiInterviewInvitation,
  getAiInterviewsByApplication,
  cancelAiInterview,
  regenerateAiInterviewCode,
  type AiInterviewDetail,
  type AiInterviewStatus,
} from "@/lib/api/ai-interviews.api"

type Step = "initial" | "created" | "sending" | "sent" | "error"

interface SendAiInterviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateName: string
  candidateEmail: string
  jobTitle: string
  applicationId: string
}

const statusLabels: Record<AiInterviewStatus, string> = {
  CREATED: "Prepared",
  SENT: "Invitation sent",
  ACCESSED: "Accessed",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
}

const statusVariants: Record<AiInterviewStatus, "default" | "secondary" | "success" | "warning" | "error" | "info" | "outline"> = {
  CREATED: "secondary",
  SENT: "info",
  ACCESSED: "warning",
  READY: "default",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "error",
  EXPIRED: "outline",
  FAILED: "error",
}

export function SendAiInterviewModal({
  open,
  onOpenChange,
  candidateName,
  jobTitle,
  applicationId,
}: SendAiInterviewModalProps) {
  const [step, setStep] = React.useState<Step>("initial")
  const [interview, setInterview] = React.useState<AiInterviewDetail | null>(null)
  const [existingInterviews, setExistingInterviews] = React.useState<AiInterviewDetail[]>([])
  const [rawCode, setRawCode] = React.useState("")
  const [sendLoading, setSendLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [actionInProgress, setActionInProgress] = React.useState(false)
  const [sendSuccess, setSendSuccess] = React.useState(false)
  const [copiedCode, setCopiedCode] = React.useState(false)
  const [copiedLink, setCopiedLink] = React.useState(false)

  const loadExisting = useCallback(async () => {
    try {
      const list = await getAiInterviewsByApplication(applicationId)
      setExistingInterviews(list)
      const active = list.find(i =>
        !["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"].includes(i.status)
      )
      if (active) {
        setInterview(active)
        setStep(active.status === "SENT" ? "sent" : "created")
      }
    } catch {
      // No existing interviews
    }
  }, [applicationId])

  React.useEffect(() => {
    if (open) {
      queueMicrotask(() => void loadExisting())
    }
  }, [open, loadExisting])

  const handleCreate = async () => {
    setActionInProgress(true)
    setError("")
    try {
      const result = await createAiInterview({
        applicationId,
        estimatedDurationMinutes: 30,
      })
      setInterview({
        id: result.id,
        applicationId: result.applicationId,
        provider: result.provider,
        status: "CREATED",
        codeDisplayHint: result.codeDisplayHint,
        invitationSentAt: null,
        invitationEmail: null,
        accessedAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        tavusConversationId: null,
        tavusConversationUrl: null,
        tavusStatus: null,
        transcriptStatus: "NOT_REQUESTED",
        language: result.language,
        estimatedDurationMinutes: result.estimatedDurationMinutes,
        expiresAt: result.expiresAt,
        notes: null,
        createdAt: result.createdAt,
        updatedAt: new Date().toISOString(),
        application: {
          candidate: {
            id: "",
            firstName: result.application.candidate.firstName,
            lastName: result.application.candidate.lastName,
            email: result.application.candidate.email,
          },
          job: {
            id: "",
            title: result.application.job.title,
          },
        },
      })
      setRawCode(result.rawCode)
      setStep("created")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create interview")
    } finally {
      setActionInProgress(false)
    }
  }

  const handleSend = async () => {
    if (!interview) return
    setSendLoading(true)
    setError("")
    try {
      const result = await sendAiInterviewInvitation(interview.id, {
        rawCode,
      })
      setSendSuccess(true)
      setStep("sent")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invitation. The interview record has been preserved.")
    } finally {
      setSendLoading(false)
    }
  }

  const handleRegenerateCode = async () => {
    if (!interview) return
    setActionInProgress(true)
    try {
      const result = await regenerateAiInterviewCode(interview.id)
      setRawCode(result.rawCode)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to regenerate code")
    } finally {
      setActionInProgress(false)
    }
  }

  const handleCancel = async () => {
    if (!interview) return
    setActionInProgress(true)
    try {
      await cancelAiInterview(interview.id)
      setStep("initial")
      setInterview(null)
      setRawCode("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel interview")
    } finally {
      setActionInProgress(false)
    }
  }

  const copyToClipboard = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 2000)
    } catch {
      // Fallback
    }
  }

  const interviewLink = typeof window !== "undefined"
    ? `${window.location.origin}/interview/access`
    : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Interview</DialogTitle>
          <DialogDescription>
            Send an AI-powered interview invitation to {candidateName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-surface p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Candidate</span>
              <span className="font-medium">{candidateName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Position</span>
              <span className="font-medium">{jobTitle}</span>
            </div>
            {interview && (
              <div className="flex justify-between">
                <span className="text-muted">Status</span>
                <Badge variant={statusVariants[interview.status]}>
                  {statusLabels[interview.status]}
                </Badge>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-error/10 p-3 text-sm text-error" role="alert">
              {error}
            </div>
          )}

          {step === "initial" && !interview && (
            <Button className="w-full" onClick={handleCreate} disabled={actionInProgress}>
              {actionInProgress ? "Creating..." : "Send AI Interview"}
            </Button>
          )}

          {(step === "created" || step === "sent") && interview && rawCode && (
            <div className="space-y-4">
              <Separator />

              <div className="text-center space-y-2">
                <p className="text-sm text-muted">Interview code</p>
                <p className="text-2xl font-mono font-bold tracking-[0.25em] text-primary">
                  {rawCode}
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(rawCode, setCopiedCode)}
                  >
                    {copiedCode ? "Copied!" : "Copy code"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(interviewLink, setCopiedLink)}
                  >
                    {copiedLink ? "Copied!" : "Copy link"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateCode}
                    disabled={actionInProgress}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>

              {step === "created" && !sendSuccess && (
                <div className="space-y-2">
                  <p className="text-sm text-muted text-center">
                    Review the details above, then send the invitation email to the candidate.
                  </p>
                  <Button
                    className="w-full"
                    onClick={handleSend}
                    disabled={sendLoading}
                  >
                    {sendLoading ? "Sending..." : "Send Interview Invitation"}
                  </Button>
                </div>
              )}

              {sendSuccess && (
                <div className="rounded-lg bg-success/10 p-3 text-sm text-success text-center">
                  Invitation sent successfully.
                </div>
              )}
            </div>
          )}

          {step === "created" && interview && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted"
                onClick={handleCancel}
                disabled={actionInProgress}
              >
                Cancel interview
              </Button>
            </div>
          )}

          {existingInterviews.length > 0 && (
            <div className="text-xs text-muted">
              {existingInterviews.length} interview(s) for this application
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
