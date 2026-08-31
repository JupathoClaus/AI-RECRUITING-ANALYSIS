"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { useStore } from "@/store/useStore"
import { createAiInterview, sendAiInterviewInvitation, cancelAiInterview, regenerateAiInterviewCode, getAiInterview, listAiInterviews, getAiInterviewsByApplication, type AiInterviewDetail, type AiInterviewStatus } from "@/lib/api/ai-interviews.api"
import { AiInterviewDetailDialog } from "@/components/ai-interview/ai-interview-detail-dialog"
import { MagicStar, DocumentText, Clock, Link2, Warning2, Send2, Refresh, Eye, Calendar } from "iconsax-react"

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

export default function AIInterviewsPage() {
  const { candidates, jobs, fetchCandidates, fetchJobs } = useStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<AiInterviewDetail[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState("")
  const [language, setLanguage] = useState("en")
  const [durationMinutes, setDurationMinutes] = useState("30")
  const [scheduledAt, setScheduledAt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<AiInterviewDetail | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchCandidates(), fetchJobs(), listAiInterviews()])
      .then(([, , interviews]) => {
        if (active) setCreated(interviews)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "AI interviews could not be loaded")
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Applications available for AI interviews: every candidate with a current
  // application gets an entry, matched to a real job.
  const applicationOptions = useMemo(() => {
    const map = new Map<string, { applicationId: string; candidateName: string; jobTitle: string }>()
    for (const c of candidates) {
      const app = c.applicationSummary?.current
      if (!app || !app.id) continue
      const jobTitle = jobs.find((j) => j.id === app.jobId)?.title || app.jobTitle || c.currentJobTitle || "Position"
      map.set(app.id, {
        applicationId: app.id,
        candidateName: c.displayName,
        jobTitle,
      })
    }
    return [...map.values()]
  }, [candidates, jobs])

  const selectedApp = applicationOptions.find((a) => a.applicationId === selectedApplicationId)

  const durationValue = Number(durationMinutes)
  const durationValid = Number.isFinite(durationValue) && durationValue >= 5 && durationValue <= 120
  const durationError = durationMinutes.trim() !== "" && !durationValid
  const scheduledValid = scheduledAt === "" || (new Date(scheduledAt) > new Date())
  const scheduledError = scheduledAt !== "" && !scheduledValid
  const formValid = !!selectedApplicationId && durationValid && scheduledValid

  const handleCreate = useCallback(async () => {
    if (!formValid) return
    setCreating(true)
    setCreateError(null)
    try {
      const interview = await createAiInterview({
        applicationId: selectedApplicationId,
        language,
        estimatedDurationMinutes: durationValue,
        scheduledAt: scheduledAt || undefined,
      })
      // Load any existing interviews for the same application (tenant-scoped).
      const [detail, existing] = await Promise.all([getAiInterview(interview.id), getAiInterviewsByApplication(selectedApplicationId).catch(() => [])])
      setCreated((prev) => {
        const merged = [detail, ...existing.filter((i) => i.id !== detail.id), ...prev]
        return [...new Map(merged.map((i) => [i.id, i])).values()]
      })
      setCreateOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Interview could not be created"
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }, [selectedApplicationId, language, durationValid, formValid, durationValue, scheduledAt, scheduledValid])

  const handleSend = useCallback(async (interview: AiInterviewDetail) => {
    setBusyId(interview.id)
    setError(null)
    try {
      await sendAiInterviewInvitation(interview.id, { rawCode: undefined })
      const updated = await getAiInterview(interview.id)
      setCreated((prev) => prev.map((i) => (i.id === interview.id ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation could not be sent")
    } finally {
      setBusyId(null)
    }
  }, [])

  const handleCancel = useCallback(async (interview: AiInterviewDetail) => {
    setBusyId(interview.id)
    setError(null)
    try {
      await cancelAiInterview(interview.id)
      const updated = await getAiInterview(interview.id)
      setCreated((prev) => prev.map((i) => (i.id === interview.id ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interview could not be cancelled")
    } finally {
      setBusyId(null)
    }
  }, [])

  const handleRegenerate = useCallback(async (interview: AiInterviewDetail) => {
    setBusyId(interview.id)
    setError(null)
    try {
      await regenerateAiInterviewCode(interview.id)
      const updated = await getAiInterview(interview.id)
      setCreated((prev) => prev.map((i) => (i.id === interview.id ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code could not be regenerated")
    } finally {
      setBusyId(null)
    }
  }, [])

  const canCancel = useCallback((status: AiInterviewStatus) => ["CREATED", "SENT", "ACCESSED", "READY", "IN_PROGRESS"].includes(status), [])
  const canSend = useCallback((status: AiInterviewStatus) => ["CREATED", "SENT"].includes(status), [])

  return (
    <AppLayout
      title="AI Interviews"
      description="AI interview sessions are created from candidate applications. Sessions are started by the candidate through their access link."
      actions={
        <Dialog
          open={createOpen}
          onOpenChange={(o) => {
            setCreateOpen(o)
            if (!o) setCreateError(null)
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <MagicStar className="h-4 w-4 mr-2" />
              Create AI Interview
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <ModalHeader>
              <DialogTitle className="flex items-center gap-2">
                <MagicStar className="h-5 w-5 text-primary" />
                Create AI Interview
              </DialogTitle>
              <DialogDescription>Create an interview invitation for a candidate application.</DialogDescription>
            </ModalHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Candidate &amp; Position</label>
                <Select value={selectedApplicationId} onValueChange={setSelectedApplicationId}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder={applicationOptions.length ? "Select a candidate application" : "No candidates available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {applicationOptions.length === 0 && (
                      <SelectItem value="none" disabled>
                        No candidates available
                      </SelectItem>
                    )}
                    {applicationOptions.map((a) => (
                      <SelectItem key={a.applicationId} value={a.applicationId}>
                        {a.candidateName} — {a.jobTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Language</label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Estimated duration (min)</label>
                  <Input type="number" min={5} max={120} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} aria-invalid={durationError} />
                  {durationError && (
                    <p className="text-xs text-error">Enter a duration between 5 and 120 minutes.</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Schedule for (optional)</label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  aria-invalid={scheduledError}
                />
                {scheduledError && (
                  <p className="text-xs text-error">Scheduled time must be in the future.</p>
                )}
              </div>
              {createError && (
                <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error flex items-start gap-2">
                  <Warning2 className="h-4 w-4 mt-0.5 shrink-0" />
                  {createError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!formValid || creating}>
                <MagicStar className="h-4 w-4 mr-2" />
                {creating ? "Creating..." : "Create Interview"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {error && (
        <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error mb-4 flex items-start gap-2">
          <Warning2 className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {created.length === 0 && !error ? (
        <Card>
          <CardContent className="py-16">
            <EmptyState icon={<MagicStar className="h-12 w-12" />} title="No AI interviews yet" description="AI interviews are created per candidate application. Use “Create AI Interview” above, or open a candidate’s detail page and choose “Send AI Interview”." />
          </CardContent>
        </Card>
      ) : created.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">AI Interview Sessions</h2>
          <div className="grid grid-cols-1 gap-4">
            {created.map((interview) => {
              const candidate = interview.application?.candidate
              const job = interview.application?.job
              return (
                <Card key={interview.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="relative shrink-0">
                        <div className="h-12 w-12 flex items-center justify-center bg-primary-muted rounded-full">
                          <MagicStar className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{candidate ? `${candidate.firstName} ${candidate.lastName}` : "Candidate"}</h3>
                          <Badge variant={STATUS_VARIANT[interview.status]} className="text-[10px]">
                            {STATUS_LABEL[interview.status]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted">{job?.title || "Position"}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {interview.estimatedDurationMinutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            {interview.codeDisplayHint || "code pending"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setDetailTarget(interview)}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View Details
                          </Button>
                          {canSend(interview.status) && (
                            <Button size="sm" className="h-8" disabled={busyId === interview.id} onClick={() => handleSend(interview)}>
                              <Send2 className="h-3.5 w-3.5 mr-1.5" />
                              Send Invitation
                            </Button>
                          )}
                          {(interview.status === "CREATED" || interview.status === "SENT") && (
                            <Button size="sm" variant="outline" className="h-8" disabled={busyId === interview.id} onClick={() => handleRegenerate(interview)}>
                              <Refresh className="h-3.5 w-3.5 mr-1.5" />
                              Regenerate Code
                            </Button>
                          )}
                          {canCancel(interview.status) && (
                            <Button size="sm" variant="outline" className="h-8" disabled={busyId === interview.id} onClick={() => handleCancel(interview)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted text-right">The candidate starts the session from the access link.</p>
                      </div>
                    </div>
                    {interview.createdAt && (
                      <>
                        <Separator className="my-4" />
                        <p className="text-xs text-muted">Created {new Date(interview.createdAt).toLocaleString()} · Access via candidate invitation email</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ) : null}

      {detailTarget && (
        <AiInterviewDetailDialog
          interview={detailTarget}
          open={!!detailTarget}
          onOpenChange={(o) => {
            if (!o) setDetailTarget(null)
          }}
          onRefreshed={(updated) => {
            setDetailTarget(updated)
            setCreated((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          }}
        />
      )}
    </AppLayout>
  )
}
