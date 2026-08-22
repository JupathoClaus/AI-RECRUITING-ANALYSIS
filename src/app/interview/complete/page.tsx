"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { clearInterviewSession } from "@/lib/interview-session"
import { InterviewShell } from "@/components/interview/interview-shell"
import { CheckCircle2, PartyPopper } from "lucide-react"

function InterviewCompleteContent() {
  const searchParams = useSearchParams()
  const isSubmitted = searchParams.get("submitted") === "true"

  const [candidateFirstName] = React.useState(() =>
    typeof window === "undefined"
      ? ""
      : sessionStorage.getItem("ai-interview-candidate-first-name") ||
        sessionStorage.getItem("ai-interview-candidate-name") ||
        "",
  )
  const [jobTitle] = React.useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem("ai-interview-job-title") || "",
  )

  React.useEffect(() => {
    return () => {
      clearInterviewSession()
    }
  }, [])

  const completed = isSubmitted

  return (
    <Card className="overflow-hidden shadow-card">
      <div className="border-b border-border/60 bg-gradient-to-b from-success-muted/70 to-transparent px-6 pb-6 pt-8 text-center sm:px-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/5">
          <CheckCircle2 className="h-9 w-9 text-success" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {completed ? "Interview Completed" : "Your interview session has ended"}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {completed
            ? `Thank you, ${candidateFirstName || "Candidate"}.`
            : `Thank you, ${candidateFirstName || "Candidate"}. Your session has been recorded.`}
        </p>
      </div>
      <CardContent className="px-6 py-6 text-center sm:px-8">
        {completed && (
          <div className="rounded-xl border border-border/70 bg-surface-elevated/60 px-4 py-4">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
              <PartyPopper className="h-4 w-4 text-primary" />
              All set
            </div>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              {jobTitle
                ? `Your AI interview for ${jobTitle} has been completed successfully.`
                : "Your AI interview has been completed successfully."}{" "}
              Your responses have been submitted to the recruitment team for review.
            </p>
            <p className="mt-3 text-xs text-muted">
              No further action is required at this time. You can safely close this page.
            </p>
          </div>
        )}
        <Button variant="outline" className="mt-5 w-full" onClick={() => window.close()}>
          Close page
        </Button>
      </CardContent>
    </Card>
  )
}

export default function InterviewCompletePage() {
  return (
    <InterviewShell>
      <Suspense fallback={null}>
        <InterviewCompleteContent />
      </Suspense>
    </InterviewShell>
  )
}