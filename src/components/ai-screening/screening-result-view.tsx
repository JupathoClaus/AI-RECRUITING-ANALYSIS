'use client'

import { AiScreeningResultDto } from '@/lib/api/ai-screening.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

interface Props {
  result: AiScreeningResultDto
}

function RecommendationBadge({ recommendation }: { recommendation?: string }) {
  if (!recommendation) return null
  const variant = recommendation === 'SHORTLIST' ? 'success' : recommendation === 'NOT_SHORTLIST' ? 'error' : 'warning'
  const label = recommendation === 'SHORTLIST' ? 'Recommended for shortlist'
    : recommendation === 'NOT_SHORTLIST' ? 'Not recommended for shortlist'
    : 'Human review required'
  return <Badge variant={variant as any} className="text-sm px-3 py-1">{label}</Badge>
}

export function ScreeningResultView({ result }: Props) {
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
          {result.overallScore !== undefined && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Overall Score</span>
                <span className="font-medium">{result.overallScore}/100</span>
              </div>
              <Progress value={result.overallScore} className="h-2" />
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

          {result.uncertainties && result.uncertainties.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1 text-amber-600">Uncertainties</h4>
              <ul className="text-sm space-y-1">
                {result.uncertainties.map((u, i) => (
                  <li key={i} className="text-muted-foreground">• {u}</li>
                ))}
              </ul>
            </div>
          )}

          {result.riskFlags && result.riskFlags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1 text-orange-600">Risk Flags</h4>
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
