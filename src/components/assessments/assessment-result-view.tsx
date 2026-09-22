"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { getScoreBgColor, getScoreColor, getErrorMessage } from "@/lib/utils"
import { getAssessmentResult, retryAssessmentEvaluation, type AssessmentResultDto } from "@/lib/api/assessments.api"
import { thresholdNote } from "@/lib/assessments/assessment-helpers"

function VerificationBadge({ value }: { value: string }) {
  const tone = value === "VERBATIM" ? "bg-success/10 text-success" : value === "SUPPORTED" ? "bg-primary/10 text-primary" : value === "INFERRED" ? "bg-warning/10 text-warning" : "bg-error/10 text-error"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{value}</span>
}

export function AssessmentResultView({ sessionId, onNavigate }: { sessionId: string; onNavigate?: (applicationId: string) => void }) {
  const [result, setResult] = React.useState<AssessmentResultDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [retrying, setRetrying] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    getAssessmentResult(sessionId)
      .then((data) => { setResult(data); setError(null) })
      .catch((reason: unknown) => setError(getErrorMessage(reason, "Assessment result could not be loaded.")))
      .finally(() => setLoading(false))
  }, [sessionId])

  React.useEffect(() => { load() }, [load])

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
  if (error || !result) return <EmptyState title="Result unavailable" description={error || "This assessment result was not found."} />

  const evaluation = result.latestEvaluation
  const evaluationFailed = evaluation?.status === "FAILED"
  const evaluationPending = !result.result || evaluation?.status === "PENDING" || evaluation?.status === "RUNNING"

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{result.assessment.name} · v{result.assessment.versionNumber}</p>
              <p className="mt-1 text-sm text-muted">{result.application.candidate.firstName} {result.application.candidate.lastName} · {result.application.job.title}</p>
              {result.result ? (
                <p className="mt-2 text-3xl font-semibold tracking-tight"><span className={getScoreColor(result.result.totalScore)}>{result.result.totalScore}</span><span className="text-lg text-muted"> / 100</span></p>
              ) : (
                <p className="mt-2 text-sm text-muted">{evaluationFailed ? "AI evaluation failed — deterministic score preserved." : "Evaluation in progress."}</p>
              )}
              {result.result?.threshold && <p className="mt-1 text-xs text-muted">{thresholdNote(result.result.totalScore, result.assessment.passingScore)}</p>}
              <p className="mt-1 text-xs text-muted">Assessment results are decision support. Final hiring decisions remain with the recruiter.</p>
            </div>
            <div className="flex flex-col gap-2">
              {result.result && <Progress value={result.result.totalScore} className="w-48" indicatorClassName={getScoreBgColor(result.result.totalScore)} />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
                {evaluationFailed && (
                  <Button
                    size="sm"
                    disabled={retrying}
                    onClick={() => {
                      setRetrying(true)
                      retryAssessmentEvaluation(sessionId).then(() => load()).catch((reason: unknown) => setError(getErrorMessage(reason, "Retry could not be queued."))).finally(() => setRetrying(false))
                    }}
                  >
                    {retrying ? "Queuing…" : "Retry evaluation"}
                  </Button>
                )}
                {onNavigate && <Button variant="outline" size="sm" onClick={() => onNavigate(result.application.id)}>Open application</Button>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {evaluationPending && !evaluationFailed && (
        <Card><CardContent className="p-5 text-sm text-muted">Evaluation is being processed. Deterministic scores are preserved and the full result will appear here automatically on refresh.</CardContent></Card>
      )}

      {result.result?.competencyBreakdown && result.result.competencyBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Competency breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {result.result.competencyBreakdown.map((entry) => {
              const pct = entry.max > 0 ? Math.round((entry.score / entry.max) * 100) : 0
              return (
                <div key={entry.competency}>
                  <div className="flex items-center justify-between text-sm"><span className="font-medium">{entry.competency}</span><span className="text-muted">{entry.score} / {entry.max}</span></div>
                  <Progress value={pct} className="mt-1" indicatorClassName={getScoreBgColor(pct)} />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {result.questions.map((question, index) => (
          <Card key={question.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">Q{index + 1}. {question.prompt}</p>
                <Badge variant="outline">{question.type}</Badge>
              </div>
              {(question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE" || question.type === "TRUE_FALSE") && (
                <ul className="space-y-1.5 text-sm">
                  {question.options.map((option) => (
                    <li key={option.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${option.selected ? "border-primary bg-primary/5" : "border-border"}`}>
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${option.isCorrect ? "border-success text-success" : "border-border text-muted"}`}>{option.isCorrect ? "✓" : ""}</span>
                      <span>{option.label}</span>
                      {option.selected && <span className="ml-auto text-xs text-muted">candidate answer</span>}
                    </li>
                  ))}
                </ul>
              )}
              {(question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") && (
                <div className="rounded-md border border-border bg-surface-elevated p-3 text-sm">
                  {question.response?.textAnswer || <span className="text-muted">No answer provided.</span>}
                </div>
              )}
              <p className="text-xs text-muted">
                Score: {question.response?.deterministicScore ?? 0} / {question.response?.deterministicMax ?? question.points}
                {question.aiEvaluated ? " + AI rubric" : " (deterministic)"}
              </p>
              {renderCriteria(question.id, result)}
            </CardContent>
          </Card>
        ))}
      </div>

      {renderEvaluationMeta(evaluation, result)}
    </div>
  )
}

function renderCriteria(questionId: string, result: AssessmentResultDto) {
  const breakdown = result.result?.questionBreakdown as { questionId: string; criteria?: { criterionId: string; status: string; score: number; maxScore: number; evidence: { quote: string; verification: string }[]; rationale: string; confidence: string }[] }[] | undefined
  const entry = breakdown?.find((b) => b.questionId === questionId)
  if (!entry?.criteria?.length) return null
  return (
    <div className="space-y-2 border-t border-border pt-3">
      {entry.criteria.map((criterion) => (
        <div key={criterion.criterionId} className="rounded-md bg-surface-elevated p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{criterion.status}</Badge>
            <span className="text-muted">{criterion.score} / {criterion.maxScore}</span>
            <span className="text-xs text-muted">Confidence: {criterion.confidence}</span>
          </div>
          <p className="mt-2">{criterion.rationale}</p>
          {criterion.evidence.length > 0 && (
            <ul className="mt-2 space-y-1">
              {criterion.evidence.map((item, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <VerificationBadge value={item.verification} />
                  <q className="text-muted">“{item.quote}”</q>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function renderEvaluationMeta(evaluation: AssessmentResultDto["latestEvaluation"], result: AssessmentResultDto) {
  const full = result.evaluations[0]
  return (
    <Card>
      <CardHeader><CardTitle>Evaluation details</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted">
        <p>Status: <span className="font-medium text-foreground">{evaluation?.status ?? "Not started"}</span></p>
        {full?.provider && <p>Provider: {full.provider}{full.model ? ` (${full.model})` : ""} · prompt {full.promptVersion} · schema {full.schemaVersion}{full.latencyMs != null ? ` · ${full.latencyMs}ms` : ""}</p>}
        {full?.failureCode && <p className="text-error">Failed ({full.failureCode}): {full.failureMessageSafe}</p>}
        {result.result?.uncertainties && result.result.uncertainties.length > 0 && (
          <div><p className="font-medium text-foreground">Uncertainties</p><ul className="list-disc pl-5">{result.result.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
        )}
        {result.result?.strengths && result.result.strengths.length > 0 && (
          <div><p className="font-medium text-foreground">Strengths</p><ul className="list-disc pl-5">{result.result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        )}
        {result.result?.gaps && result.result.gaps.length > 0 && (
          <div><p className="font-medium text-foreground">Gaps</p><ul className="list-disc pl-5">{result.result.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
        )}
        <p>Attempt {full?.attempt ?? 1}{result.evaluations.length > 1 ? ` · ${result.evaluations.length} attempts preserved` : ""}</p>
      </CardContent>
    </Card>
  )
}
