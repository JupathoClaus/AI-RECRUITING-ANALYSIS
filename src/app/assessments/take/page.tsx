"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getErrorMessage } from "@/lib/utils"
import {
  getCandidateAssessmentToken,
  clearCandidateAssessmentToken,
  getCandidateSession,
  startCandidateSession,
  saveCandidateResponse,
  submitCandidateSession,
  type CandidateSessionView,
} from "@/lib/api/assessments.api"
import { formatCountdown, answeredPositions } from "@/lib/assessments/assessment-helpers"
import { ApiErrorResponse } from "@/lib/api/client"

type SaveState = "saved" | "saving" | "error" | "offline"
type Phase = "loading" | "welcome" | "taking" | "review" | "submitted" | "expired" | "error"

interface Answer {
  selectedOptionIds: string[]
  textAnswer: string
  updatedAt?: string
}

function isChoice(type: string) {
  return type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE"
}

export default function AssessmentTakePage() {
  const router = useRouter()
  const [view, setView] = React.useState<CandidateSessionView | null>(null)
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [error, setError] = React.useState<string | null>(null)
  const [answers, setAnswers] = React.useState<Map<string, Answer>>(new Map())
  const [saveStates, setSaveStates] = React.useState<Map<string, SaveState>>(new Map())
  const [globalNotice, setGlobalNotice] = React.useState<string | null>(null)
  const [remaining, setRemaining] = React.useState<number | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Last server-confirmed updatedAt per question (ref, not state — avoids
  // stale closures in debounced saves causing false STALE_WRITE conflicts).
  const confirmedAt = React.useRef<Map<string, string>>(new Map())

  const hydrateAnswers = React.useCallback((data: CandidateSessionView) => {
    const next = new Map<string, Answer>()
    confirmedAt.current = new Map<string, string>()
    for (const r of data.responses || []) {
      next.set(r.questionId, { selectedOptionIds: r.selectedOptionIds || [], textAnswer: r.textAnswer || "", updatedAt: r.updatedAt })
      confirmedAt.current.set(r.questionId, r.updatedAt)
    }
    setAnswers(next)
    const states = new Map<string, SaveState>()
    for (const r of data.responses || []) states.set(r.questionId, "saved")
    setSaveStates(states)
  }, [])

  const load = React.useCallback(() => {
    const token = getCandidateAssessmentToken()
    if (!token) {
      router.replace("/assessments/start")
      return
    }
    setPhase("loading")
    getCandidateSession(token)
      .then((data) => {
        setView(data)
        hydrateAnswers(data)
        setRemaining(data.remainingSeconds ?? null)
        if (data.status === "NOT_STARTED") setPhase("welcome")
        else if (data.status === "IN_PROGRESS") setPhase("taking")
        else if (data.status === "EXPIRED" || data.status === "CANCELLED") setPhase("expired")
        else setPhase("submitted")
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiErrorResponse && reason.statusCode === 401) {
          clearCandidateAssessmentToken()
          router.replace("/assessments/start")
          return
        }
        setError(getErrorMessage(reason, "Your assessment could not be loaded."))
        setPhase("error")
      })
  }, [router, hydrateAnswers])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  // Local countdown; the server remains authoritative (resynced on every save).
  React.useEffect(() => {
    if (phase !== "taking" || remaining == null) return
    if (remaining <= 0) {
      setPhase("expired")
      return
    }
    const id = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1)), 1000)
    return () => clearTimeout(id)
  }, [phase, remaining])

  function persist(questionId: string, answer: Answer, immediate: boolean) {
    const token = getCandidateAssessmentToken()
    if (!token) return
    const pending = timers.current.get(questionId)
    if (pending) clearTimeout(timers.current.get(questionId))
    setSaveStates((prev) => new Map(prev).set(questionId, "saving"))
    const run = () => {
      const base = confirmedAt.current.get(questionId)
      const isText = !isChoice(view?.questions.find((q) => q.id === questionId)?.type || "")
      saveCandidateResponse(
        {
          questionId,
          selectedOptionIds: isText ? undefined : answer.selectedOptionIds,
          textAnswer: isText ? answer.textAnswer : undefined,
          baseUpdatedAt: base,
        },
        token,
      )
        .then((res) => {
          confirmedAt.current.set(questionId, res.response.updatedAt)
          setAnswers((prev) => {
            const next = new Map(prev)
            const current = next.get(questionId)
            if (current) next.set(questionId, { ...current, updatedAt: res.response.updatedAt })
            return next
          })
          setSaveStates((prev) => new Map(prev).set(questionId, "saved"))
          setGlobalNotice(null)
          if (res.response.updatedAt && view?.remainingSeconds != null) {
            // Resync the timer against server truth after every confirmed save.
            getCandidateSession(token).then((fresh) => {
              setRemaining(fresh.remainingSeconds ?? null)
              if (fresh.status === "EXPIRED") setPhase("expired")
            }).catch(() => undefined)
          }
        })
        .catch((reason: unknown) => {
          if (reason instanceof ApiErrorResponse && reason.errorCode === "STALE_WRITE") {
            // Another tab saved first: rebase onto the fresh server version and
            // retry once (last-write-wins) so this tab's text is never lost.
            getCandidateSession(token).then((fresh) => {
              const server = fresh.responses.find((r) => r.questionId === questionId)
              if (server) confirmedAt.current.set(questionId, server.updatedAt)
              setGlobalNotice("A newer answer was saved from another tab. Your latest input has been kept.")
              persist(questionId, answer, true)
            }).catch(() => setGlobalNotice("A newer answer exists from another tab. Please refresh to merge."))
            return
          }
          if (reason instanceof ApiErrorResponse && (reason.errorCode === "SESSION_NOT_WRITABLE" || reason.errorCode === "ASSESSMENT_EXPIRED")) {
            setPhase("expired")
            return
          }
          const offline = reason instanceof TypeError || (reason instanceof ApiErrorResponse && reason.statusCode === 408)
          setSaveStates((prev) => new Map(prev).set(questionId, offline ? "offline" : "error"))
          setGlobalNotice(
            offline
              ? "Connection lost. Your last saved answers are safe. We'll retry automatically when you keep typing."
              : "Unable to save your answer. Please check your connection and try again.",
          )
        })
    }
    if (immediate) run()
    else timers.current.set(questionId, setTimeout(run, 800))
  }

  function onChoice(questionId: string, optionId: string, multiple: boolean) {
    const current = answers.get(questionId) ?? { selectedOptionIds: [], textAnswer: "" }
    const next: Answer = multiple
      ? { ...current, selectedOptionIds: current.selectedOptionIds.includes(optionId) ? current.selectedOptionIds.filter((id) => id !== optionId) : [...current.selectedOptionIds, optionId] }
      : { ...current, selectedOptionIds: [optionId] }
    setAnswers((prev) => new Map(prev).set(questionId, next))
    persist(questionId, next, true)
  }

  function onText(questionId: string, text: string) {
    const current = answers.get(questionId) ?? { selectedOptionIds: [], textAnswer: "" }
    const next: Answer = { ...current, textAnswer: text }
    setAnswers((prev) => new Map(prev).set(questionId, next))
    persist(questionId, next, false)
  }

  function submit() {
    const token = getCandidateAssessmentToken()
    if (!token) return
    setSubmitting(true)
    submitCandidateSession(token)
      .then(() => { setConfirming(false); setPhase("submitted") })
      .catch((reason: unknown) => {
        setConfirming(false)
        if (reason instanceof ApiErrorResponse && reason.errorCode === "INCOMPLETE_ASSESSMENT") {
          setGlobalNotice("Some required questions are still unanswered. Please answer them before submitting.")
          setPhase("review")
          return
        }
        setGlobalNotice(getErrorMessage(reason, "Submission failed. Your answers are saved — please try again."))
      })
      .finally(() => setSubmitting(false))
  }

  if (phase === "loading") {
    return <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></main>
  }

  if (phase === "error") {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10"><EmptyState title="Assessment unavailable" description={error || "Please try again."} action={<Button onClick={load}>Retry</Button>} /></main>
  }

  if (!view) return null

  if (phase === "submitted") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card><CardContent className="space-y-2 p-6 text-center">
          <p className="text-xl font-semibold">Assessment submitted successfully.</p>
          <p className="text-sm text-muted">Thank you — the hiring team will review your assessment. Your assessment has been submitted and evaluation is being processed.</p>
        </CardContent></Card>
      </main>
    )
  }

  if (phase === "expired") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card><CardContent className="space-y-2 p-6 text-center">
          <p className="text-xl font-semibold">This assessment has expired.</p>
          <p className="text-sm text-muted">Your saved answers have been preserved. Please contact the hiring team if you need assistance.</p>
        </CardContent></Card>
      </main>
    )
  }

  if (phase === "welcome") {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{view.assessment.name}</CardTitle>
            <p className="text-sm text-muted">You have been invited to complete an assessment{view.assessment.durationMinutes ? ` · estimated time ${view.assessment.durationMinutes} minutes` : ""} · {view.assessment.questionCount} questions</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {view.assessment.description && <p className="text-sm">{view.assessment.description}</p>}
            {view.assessment.instructions && <p className="rounded-md border border-border bg-surface-elevated p-3 text-sm">{view.assessment.instructions}</p>}
            <Button onClick={() => startCandidateSession(getCandidateAssessmentToken() || undefined).then((data) => { setView(data); hydrateAnswers(data); setRemaining(data.remainingSeconds ?? null); setPhase("taking") }).catch((reason: unknown) => setError(getErrorMessage(reason, "The assessment could not be started.")))}>
              Start assessment
            </Button>
            {error && <p className="text-sm text-error" role="alert">{error}</p>}
          </CardContent>
        </Card>
      </main>
    )
  }

  const stats = answeredPositions({ questions: view.questions.map((q) => ({ id: q.id, type: q.type, required: q.required })), answers: new Map([...answers].map(([k, v]) => [k, { selectedOptionIds: v.selectedOptionIds, textAnswer: v.textAnswer }])) })
  const progress = view.questions.length > 0 ? Math.round((stats.answered / view.questions.length) * 100) : 0

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{view.assessment.name}</p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={progress} className="flex-1" aria-label={`Progress: ${stats.answered} of ${view.questions.length} answered`} />
              <span className="text-xs text-muted" aria-hidden="true">{progress}%</span>
            </div>
            <p className="mt-1 text-xs text-muted">{stats.answered} of {view.questions.length} answered</p>
          </div>
          {remaining != null && (
            <p className="rounded-md border border-border px-3 py-2 text-sm font-semibold tabular-nums" aria-label={`Time remaining: ${formatCountdown(remaining)}`}>
              {formatCountdown(remaining)}
            </p>
          )}
          <SaveIndicator saveStates={saveStates} />
        </CardContent>
      </Card>

      {globalNotice && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="alert">{globalNotice}</p>}

      {phase === "taking" && (
        <>
          {view.questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              answer={answers.get(question.id)}
              saveState={saveStates.get(question.id) ?? "saved"}
              onChoice={(optionId, multiple) => onChoice(question.id, optionId, multiple)}
              onText={(text) => onText(question.id, text)}
            />
          ))}
          <Button className="w-full" onClick={() => setPhase("review")}>Review and submit</Button>
        </>
      )}

      {phase === "review" && (
        <Card>
          <CardHeader><CardTitle>Review answers</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {view.questions.map((question) => {
              const answer = answers.get(question.id)
              const done = isChoice(question.type) ? (answer?.selectedOptionIds.length ?? 0) > 0 : (answer?.textAnswer.trim().length ?? 0) > 0
              return (
                <div key={question.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span className={`font-medium ${done ? "text-success" : "text-warning"}`}>{done ? "✓ Answered" : "○ Unanswered"}</span>
                  <span className="truncate">Question {question.position}{question.required ? " (required)" : ""}</span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPhase("taking")}>Edit</Button>
                </div>
              )
            })}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setPhase("taking")}>Back</Button>
              <Button onClick={() => setConfirming(true)} disabled={submitting}>Submit assessment</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit assessment?</DialogTitle>
            <DialogDescription>
              {stats.missingRequired.length > 0
                ? `${stats.missingRequired.length} required question(s) are unanswered and will block submission.`
                : "You cannot change your answers after submitting."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep editing</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Confirm submit"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function SaveIndicator({ saveStates }: { saveStates: Map<string, SaveState> }) {
  const values = [...saveStates.values()]
  const state: SaveState = values.includes("saving") ? "saving" : values.includes("offline") ? "offline" : values.includes("error") ? "error" : "saved"
  const label = state === "saving" ? "Saving…" : state === "offline" ? "Offline — will retry" : state === "error" ? "Save failed" : "Saved ✓"
  return <p className="text-xs text-muted" role="status" aria-live="polite">{label}</p>
}

function QuestionCard({ question, answer, saveState, onChoice, onText }: {
  question: { id: string; type: string; prompt: string; instructions?: string | null; position: number; required: boolean; points: number; options: { id: string; label: string }[] }
  answer?: Answer
  saveState: SaveState
  onChoice: (optionId: string, multiple: boolean) => void
  onText: (text: string) => void
}) {
  const selected = answer?.selectedOptionIds ?? []
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">Question {question.position} of required{question.required ? "" : " (optional)"}</p>
          <Badge variant="outline">{saveState === "saved" ? "Saved ✓" : saveState === "saving" ? "Saving…" : "Save failed"}</Badge>
        </div>
        <p className="text-[15px]">{question.prompt}</p>
        {question.instructions && <p className="text-sm text-muted">{question.instructions}</p>}

        {question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE" ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option) => (
              <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-[15px] ${selected.includes(option.id) ? "border-primary bg-primary/5" : "border-border"}`}>
                <input type="radio" name={question.id} checked={selected.includes(option.id)} onChange={() => onChoice(option.id, false)} className="h-5 w-5" />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {question.type === "MULTIPLE_CHOICE" ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">{question.prompt} (select all that apply)</legend>
            {question.options.map((option) => (
              <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-[15px] ${selected.includes(option.id) ? "border-primary bg-primary/5" : "border-border"}`}>
                <input type="checkbox" checked={selected.includes(option.id)} onChange={() => onChoice(option.id, true)} className="h-5 w-5" />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {question.type === "SHORT_TEXT" ? (
          <label className="block"><span className="sr-only">{question.prompt}</span>
            <Input value={answer?.textAnswer ?? ""} onChange={(e) => onText(e.target.value)} placeholder="Type your answer…" maxLength={2000} />
          </label>
        ) : null}

        {question.type === "LONG_TEXT" ? (
          <label className="block"><span className="sr-only">{question.prompt}</span>
            <textarea
              value={answer?.textAnswer ?? ""}
              onChange={(e) => onText(e.target.value)}
              placeholder="Write your answer…"
              maxLength={20000}
              rows={6}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        ) : null}
      </CardContent>
    </Card>
  )
}
