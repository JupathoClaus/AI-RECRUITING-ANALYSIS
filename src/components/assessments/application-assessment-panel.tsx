"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { getErrorMessage } from "@/lib/utils"
import { getApplicationAssessmentState } from "@/lib/api/assessments.api"
import { assignmentStatusLabel } from "@/lib/assessments/assessment-helpers"

/**
 * Application Workspace panel. Shows application-scoped assessment state —
 * never fabricates values; empty when nothing is assigned.
 */
export function ApplicationAssessmentPanel({ applicationId, onReview }: { applicationId: string; onReview?: (sessionId: string) => void }) {
  const [state, setState] = React.useState<Awaited<ReturnType<typeof getApplicationAssessmentState>> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    getApplicationAssessmentState(applicationId)
      .then((data) => { if (active) { setState(data); setError(null) } })
      .catch((reason: unknown) => { if (active) setError(getErrorMessage(reason, "Assessment state could not be loaded.")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [applicationId])

  if (loading) return <Skeleton className="h-36 w-full" />
  if (error) return <Card><CardContent className="p-4 text-sm text-error" role="alert">{error}</CardContent></Card>
  if (!state || state.assignments.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Assessment</CardTitle></CardHeader>
        <CardContent><EmptyState title="No assessment assigned" description="Assign a published assessment version to evaluate this candidate." /></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>Assessment</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {state.assignments.map((assignment) => {
          const session = assignment.latestSession
          return (
            <div key={assignment.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{assignment.assessment.name}</p>
                <Badge variant="outline">v{assignment.assessment.versionNumber}</Badge>
                <Badge variant={assignment.status === "EVALUATED" ? "default" : "outline"}>{assignmentStatusLabel(assignment.status)}</Badge>
              </div>
              {assignment.assessment.durationMinutes != null && <p className="mt-1 text-xs text-muted">{assignment.assessment.durationMinutes} minutes</p>}
              {session && (
                <div className="mt-2 text-sm text-muted">
                  {session.result ? (
                    <p>Score: <span className="font-semibold text-foreground">{session.result.totalScore} / 100</span>
                      {assignment.assessment.passingScore != null && (
                        <span> · {session.result.totalScore >= assignment.assessment.passingScore ? "meets" : "below"} threshold ({assignment.assessment.passingScore})</span>
                      )}
                    </p>
                  ) : (
                    <p>Status: {assignmentStatusLabel(session.status)}</p>
                  )}
                  {session.submittedAt && <p className="text-xs">Submitted {new Date(session.submittedAt).toLocaleString()}</p>}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {session && onReview && <Button variant="outline" size="sm" onClick={() => onReview(session.id)}>View assessment</Button>}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
