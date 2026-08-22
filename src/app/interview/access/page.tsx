"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { verifyInterviewCode } from "@/lib/api/ai-interviews.api"
import { ApiErrorResponse } from "@/lib/api/client"
import { clearInterviewSession, storeInterviewSession } from "@/lib/interview-session"
import { InterviewShell } from "@/components/interview/interview-shell"
import {
  ShieldCheck,
  Clock3,
  Camera,
  LifeBuoy,
  KeyRound,
  AlertCircle,
  CalendarX2,
  Ban,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react"

type EntryState = "idle" | "loading" | "invalid" | "expired" | "cancelled" | "completed"

const INFO_ITEMS = [
  {
    icon: ShieldCheck,
    title: "Secure Interview Access",
    text: "Your code identifies your interview securely. Do not share it.",
  },
  {
    icon: Clock3,
    title: "Estimated Time",
    text: "Your interview duration will be shown after verification.",
  },
  {
    icon: Camera,
    title: "Camera & Microphone",
    text: "You will need camera and microphone access for the interview.",
  },
  {
    icon: LifeBuoy,
    title: "Need Help?",
    text: "Contact the recruitment team that invited you.",
  },
]

export default function InterviewAccessPage() {
  const router = useRouter()

  const [code, setCode] = React.useState("")
  const [state, setState] = React.useState<EntryState>("idle")
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    clearInterviewSession()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === "loading") return
    const normalized = code.replace(/[^A-Z0-9]/gi, "")
    if (normalized.length < 8) return
    setState("loading")
    setError("")

    try {
      clearInterviewSession()
      const result = await verifyInterviewCode(code.trim())
      storeInterviewSession({
        "ai-interview-access-token": result.accessToken,
        "ai-interview-candidate-first-name": result.candidateFirstName,
        "ai-interview-candidate-name": result.candidateDisplayName,
        "ai-interview-job-title": result.jobTitle,
        "ai-interview-organization": result.organizationName,
        "ai-interview-language": result.language,
        "ai-interview-duration": String(result.estimatedDurationMinutes),
        "ai-interview-expires-at": result.expiresAt ?? "",
      })
      router.push("/interview/welcome")
    } catch (err: unknown) {
      let message = "We could not verify this interview code. Please check it and try again."
      let kind: EntryState = "invalid"
      if (err instanceof ApiErrorResponse) {
        switch (err.errorCode) {
          case "INTERVIEW_EXPIRED":
            message = "This interview invitation has expired. Please contact the recruitment team."
            kind = "expired"
            break
          case "INTERVIEW_COMPLETED":
            message = "This interview has already been completed. Thank you for participating."
            kind = "completed"
            break
          case "INTERVIEW_UNAVAILABLE":
            message = "This interview is no longer available. Please contact the recruitment team."
            kind = "cancelled"
            break
          default:
            message = "We could not verify this interview code. Please check it and try again."
            kind = "invalid"
        }
      }
      setState(kind)
      setError(message)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    let formatted = ""
    for (let i = 0; i < raw.length; i++) {
      if (i === 4 && raw.length > 4) formatted += "-"
      formatted += raw[i]
    }
    setCode(formatted.slice(0, 9))
    if (state !== "idle") {
      setState("idle")
      setError("")
    }
  }

  const codeComplete = code.replace(/[^A-Z0-9]/g, "").length >= 8

  const errorMeta =
    state === "expired"
      ? { icon: CalendarX2, tone: "text-warning" }
      : state === "cancelled"
        ? { icon: Ban, tone: "text-warning" }
        : state === "completed"
          ? { icon: CheckCircle2, tone: "text-success" }
          : { icon: AlertCircle, tone: "text-error" }

  return (
    <InterviewShell>
      <Card className="overflow-hidden shadow-card">
        <div className="border-b border-border/60 bg-gradient-to-b from-primary-subtle to-transparent px-6 pb-6 pt-7 sm:px-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <KeyRound className="h-3.5 w-3.5" />
            AI Interview
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome to your interview
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Enter the interview code from the invitation email sent to you.
          </p>
        </div>

        <CardContent className="px-6 py-6 sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="interview-code"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
              >
                Interview code
              </label>
              <Input
                id="interview-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="XXXX - XXXX"
                aria-label="Interview code"
                aria-invalid={state === "invalid" || state === "expired" || state === "cancelled"}
                aria-describedby={error ? "code-error" : undefined}
                value={code}
                onChange={handleChange}
                disabled={state === "loading"}
                autoFocus
                className="h-12 text-center font-mono text-lg tracking-[0.3em]"
              />
            </div>

            {error && (
              <div
                id="code-error"
                role="alert"
                className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ${
                  state === "completed"
                    ? "bg-success-muted text-success"
                    : state === "expired" || state === "cancelled"
                      ? "bg-warning-muted text-warning"
                      : "bg-error-muted text-error"
                }`}
              >
                <errorMeta.icon className={`mt-0.5 h-4 w-4 shrink-0 ${errorMeta.tone}`} />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!codeComplete || state === "loading"}
            >
              {state === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifyingâ€¦
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-border/60 pt-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INFO_ITEMS.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-elevated/60 px-3 py-2.5"
                >
                  <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </InterviewShell>
  )
}