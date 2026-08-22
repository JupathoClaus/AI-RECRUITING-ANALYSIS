"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getInterviewSession } from "@/lib/api/ai-interviews.api"
import { ApiErrorResponse } from "@/lib/api/client"
import { clearInterviewSession, storeInterviewSession } from "@/lib/interview-session"
import { InterviewShell } from "@/components/interview/interview-shell"
import {
  Briefcase,
  Building2,
  Clock3,
  Languages,
  Loader2,
  ArrowRight,
  Sparkles,
} from "lucide-react"

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
}

export default function InterviewWelcomePage() {
  const router = useRouter()
  const accessToken = React.useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("ai-interview-access-token"),
    [],
  )

  const [session, setSession] = React.useState<{
    candidateFirstName: string
    jobTitle: string
    organizationName: string
    language: string
    estimatedDurationMinutes: number
  } | null>(null)
  const [sessionError, setSessionError] = React.useState("")

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
      return
    }
    let active = true
    getInterviewSession(accessToken)
      .then((data) => {
        if (!active) return
        setSession(data)
        storeInterviewSession({
          "ai-interview-candidate-first-name": data.candidateFirstName,
          "ai-interview-candidate-name": data.candidateDisplayName,
          "ai-interview-job-title": data.jobTitle,
          "ai-interview-organization": data.organizationName,
          "ai-interview-language": data.language,
          "ai-interview-duration": String(data.estimatedDurationMinutes),
        })
      })
      .catch((err: unknown) => {
        if (!active) return
        const errorCode =
          err instanceof ApiErrorResponse ? err.errorCode : ""
        if (errorCode === "INTERVIEW_EXPIRED") {
          setSessionError(
            "This interview invitation has expired. Please contact the recruitment team.",
          )
        } else if (errorCode === "INTERVIEW_COMPLETED") {
          setSessionError("This interview has already been completed.")
        } else if (errorCode === "INTERVIEW_UNAVAILABLE") {
          setSessionError("This interview is no longer available.")
        } else {
          setSessionError(
            "We couldn't load your interview details. Please go back and try again.",
          )
        }
        clearInterviewSession()
      })
    return () => {
      active = false
    }
  }, [accessToken, router])

  if (!accessToken) return null

  if (sessionError) {
    return (
      <InterviewShell>
        <Card>
          <CardContent className="px-6 py-10 text-center">
            <p className="text-sm text-muted" role="alert">
              {sessionError}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => router.replace("/interview/access")}
            >
              Return to start
            </Button>
          </CardContent>
        </Card>
      </InterviewShell>
    )
  }

  if (!session) {
    return (
      <InterviewShell>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted">Preparing your interviewâ€¦</p>
        </div>
      </InterviewShell>
    )
  }

  const languageLabel = LANGUAGE_LABELS[session.language] ?? session.language

  return (
    <InterviewShell step={1} stepCount={4} stepLabels={["Welcome", "Instructions", "Device check", "Interview"]}>
      <Card className="overflow-hidden shadow-card">
        <div className="border-b border-border/60 bg-gradient-to-b from-primary-subtle to-transparent px-6 pb-6 pt-7 sm:px-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome, {session.candidateFirstName}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            You are about to begin your AI-assisted interview. Everything is set up and waiting
            for you.
          </p>
        </div>

        <CardContent className="px-6 py-6 sm:px-8">
          <div className="rounded-xl border border-border/70 bg-surface-elevated/70 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Your interview is for
                </p>
                <p className="truncate text-base font-semibold text-foreground">
                  {session.jobTitle}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <Building2 className="h-3.5 w-3.5" />
                  {session.organizationName}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border border-border-subtle px-3.5 py-3">
              <Clock3 className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Estimated duration
                </p>
                <p className="text-sm font-semibold text-foreground">
                  ~{session.estimatedDurationMinutes} minutes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border-subtle px-3.5 py-3">
              <Languages className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Language
                </p>
                <p className="text-sm font-semibold text-foreground">{languageLabel}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-xl bg-surface-elevated/70 px-4 py-4 text-sm leading-relaxed text-muted">
            <p>
              The AI interviewer will speak with you naturally, ask questions about the role, and
              may follow up on your answers. Speak as you would in a normal interview.
            </p>
            <p>
              On the next page you will review the interview instructions, tell us about any
              accessibility adjustments you need, and confirm that you are ready.
            </p>
          </div>

          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={() => router.push("/interview/preparation")}
          >
            Continue to instructions
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </InterviewShell>
  )
}