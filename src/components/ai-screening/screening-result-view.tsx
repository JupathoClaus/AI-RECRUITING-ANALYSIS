'use client'

import { useState } from 'react'
import { AiScreeningResultDto, CriterionEvaluation } from '@/lib/api/ai-screening.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

interface Props {
  result: AiScreeningResultDto
}

const STATUS_LABEL: Record<CriterionEvaluation['status'], string> = {
  FULLY_MET: 'Fully met',
  PARTIALLY_MET: 'Partially met',
  NOT_MET: 'Not met',
  UNCERTAIN: 'Uncertain',
}

const STATUS_VARIANT: Record<CriterionEvaluation['status'], 'success' | 'warning' | 'error' | 'info'> = {
  FULLY_MET: 'success',
  PARTIALLY_MET: 'warning',
  NOT_MET: 'error',
  UNCERTAIN: 'info',
}

const REQUIREMENT_LABEL: Record<string, string> = {
  HARD_REQUIREMENT: 'Hard requirement',
  REQUIRED: 'Required',
  PREFERRED: 'Preferred',
}

function VerificationBadge({ status }: { status?: string }) {
  if (!status) return null
  const variant: 'success' | 'secondary' | 'warning' | 'error' =
    status === 'VERBATIM' ? 'success' : status === 'SUPPORTED' ? 'secondary' : status === 'INFERRED' ? 'warning' : 'error'
  const label =
    status === 'VERBATIM' ? 'Verbatim'
    : status === 'SUPPORTED' ? 'Supported paraphrase'
    : status === 'INFERRED' ? 'Loose paraphrase'
    : 'Unverified'
  const title =
    status === 'VERBATIM' ? 'This claim appears word-for-word in the resume.'
    : status === 'SUPPORTED' ? 'A close paraphrase — most key words appear in the resume.'
    : status === 'INFERRED' ? 'A loose paraphrase — only some key words appear in the resume.'
    : 'This claim could not be found in the resume. Treat with caution.'
  return <Badge variant={variant} title={title}>{label}</Badge>
}

function CriterionEvaluationCard({ evaluation }: { evaluation: CriterionEvaluation }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
        aria-label={`${evaluation.criterion} — ${STATUS_LABEL[evaluation.status]}. ${open ? 'Collapse' : 'Expand'} evidence`}
      >
        <div className="min-w-0">
          <div className="font-medium">{evaluation.criterion}</div>
          <div className="text-xs text-muted-foreground">
            {REQUIREMENT_LABEL[evaluation.requirementType] ?? evaluation.requirementType} · Confidence {evaluation.confidence}
            {evaluation.evidenceUnverified ? ' · Unverified evidence' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={STATUS_VARIANT[evaluation.status]}>{STATUS_LABEL[evaluation.status]}</Badge>
          <span className="text-muted-foreground" aria-hidden="true">{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Reasoning</div>
            <p className="text-sm text-muted-foreground">{evaluation.reason}</p>
          </div>
          {evaluation.evidence && evaluation.evidence.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Evidence</div>
              <ul className="space-y-1.5">
                {evaluation.evidence.map((ev, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {ev.sourceCategory}: {ev.sourceText || '—'}
                    </span>
                    <VerificationBadge status={ev.verificationStatus} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RecommendationBadge({ recommendation }: { recommendation?: string }) {
  if (!recommendation) return null
  const badgeVariant: 'success' | 'error' | 'warning' = recommendation === 'SHORTLIST' ? 'success' : recommendation === 'NOT_SHORTLIST' ? 'error' : 'warning'
  const label = recommendation === 'SHORTLIST' ? 'Recommended for shortlist'
    : recommendation === 'NOT_SHORTLIST' ? 'Not recommended for shortlist'
    : 'Human review required'
  return <Badge variant={badgeVariant} className="text-sm px-3 py-1">{label}</Badge>
}

export function ScreeningResultView({ result }: Props) {
  const hasScore = result.overallScore !== null && result.overallScore !== undefined
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Screening Result</span>
            <RecommendationBadge recommendation={result.recommendation} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasScore && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Overall Score</span>
                <span className="font-medium">
                  <span aria-hidden="true">{result.overallScore}/100</span>
                  <span className="sr-only">{result.overallScore} out of 100</span>
                </span>
              </div>
              <Progress value={result.overallScore} className="h-2" />
            </div>
          )}

          {!hasScore && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                AI screening could not produce a score.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This job may not have sufficient structured requirements for scoring.
              </p>
            </div>
          )}

          {result.confidence && (
            <div className="text-sm">
              <span className="text-muted-foreground">Confidence: </span>
              <span className="font-medium">{result.confidence}</span>
            </div>
          )}

          {result.explanation && (
            <div>
              <h4 className="text-sm font-medium mb-1">Explanation</h4>
              <p className="text-sm text-muted-foreground">{result.explanation}</p>
            </div>
          )}

          {result.criterionEvaluations && result.criterionEvaluations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Why this score?</h4>
              <p className="text-xs text-muted-foreground mb-2">
                Every requirement the AI evaluated, with the evidence it found and how it
                judged each one. Expand a requirement to see its reasoning and evidence.
              </p>
              <div className="space-y-2">
                {result.criterionEvaluations.map((evaluation) => (
                  <CriterionEvaluationCard key={evaluation.criterionId} evaluation={evaluation} />
                ))}
              </div>
            </div>
          )}

          <Separator />

          {result.matchedQualifications && result.matchedQualifications.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Matched Qualifications</h4>
              <div className="flex flex-wrap gap-2">
                {result.matchedQualifications.map((q, i) => (
                  <Badge key={i} variant="success">{q}</Badge>
                ))}
              </div>
            </div>
          )}

          {result.missingQualifications && result.missingQualifications.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Missing Qualifications</h4>
              <div className="flex flex-wrap gap-2">
                {result.missingQualifications.map((q, i) => (
                  <Badge key={i} variant="error">{q}</Badge>
                ))}
              </div>
            </div>
          )}

          {result.criteriaScores && result.criteriaScores.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Criteria Scores</h4>
              <div className="space-y-2">
                {result.criteriaScores.map((cs, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm">
                      <span>{cs.criterion}</span>
                      <span className="font-medium">{cs.score}/{cs.maximumScore}</span>
                    </div>
                    <Progress value={(cs.score / cs.maximumScore) * 100} className="h-1.5" />
                    {cs.explanation && <p className="text-xs text-muted-foreground mt-0.5">{cs.explanation}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.evidence && result.evidence.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Evidence</h4>
              <div className="space-y-2">
                {result.evidence.map((ev, i) => (
                  <div key={i} className="border rounded-lg p-3 text-sm">
                    <div className="font-medium">{ev.criterion}</div>
                    {ev.sourceText && <p className="text-muted-foreground mt-1">Source: {ev.sourceText}</p>}
                    <div className="flex gap-2 mt-1">
                      <Badge variant="info">{ev.assessment}</Badge>
                      {ev.score !== undefined && <Badge variant="secondary">Score: {ev.score}</Badge>}
                    </div>
                    {ev.sourceCategory && <p className="text-xs text-muted-foreground mt-1">Category: {ev.sourceCategory}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.uncertainties && result.uncertainties.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1 text-warning">Uncertainties</h4>
              <ul className="text-sm space-y-1">
                {result.uncertainties.map((u, i) => (
                  <li key={i} className="text-muted-foreground">• {u}</li>
                ))}
              </ul>
            </div>
          )}

          {result.riskFlags && result.riskFlags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1 text-warning">Risk Flags</h4>
              <div className="flex flex-wrap gap-2">
                {result.riskFlags.map((rf, i) => (
                  <Badge key={i} variant="warning">{rf}</Badge>
                ))}
              </div>
            </div>
          )}

          {result.completedAt && (
            <p className="text-xs text-muted-foreground">
              Completed: {new Date(result.completedAt).toLocaleString()}
            </p>
          )}

          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground border">
            <strong>Advisory notice:</strong> TalentAI&apos;s screening result is decision support.
            A qualified HR user must review the evidence and make the final recruitment decision.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
