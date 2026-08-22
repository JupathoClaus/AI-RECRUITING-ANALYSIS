"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { completeAiInterview } from "@/lib/api/ai-interviews.api"
import { InterviewBrand } from "@/components/interview/interview-shell"
import {
  Camera,
  Mic,
  Wifi,
  Loader2,
  LogOut,
  Sparkles,
  Clock3,
} from "lucide-react"
import { cn } from "@/lib/utils"

function useElapsed() {
  const [seconds, setSeconds] = React.useState(0)
  const startedAtRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (startedAtRef.current === null) startedAtRef.current = Date.now()
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - (startedAtRef.current || 0)) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
  return seconds
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function InterviewSessionPage() {
  const router = useRouter()
  const accessToken = React.useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("ai-interview-access-token"),
    [],
  )
  const conversationUrl = React.useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("ai-interview-conversation-url"),
    [],
  )
  const meetingToken = React.useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("ai-interview-meeting-token"),
    [],
  )
  const provider = React.useMemo(
    () =>
      typeof window === "undefined" ? null : sessionStorage.getItem("ai-interview-provider"),
    [],
  )
  const candidateFirstName = React.useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : sessionStorage.getItem("ai-interview-candidate-first-name") ||
          sessionStorage.getItem("ai-interview-candidate-name") ||
          "Candidate",
    [],
  )
  const jobTitle = React.useMemo(
    () => (typeof window === "undefined" ? "" : sessionStorage.getItem("ai-interview-job-title") || ""),
    [],
  )

  const [joining, setJoining] = React.useState(true)
  const [isOnline, setIsOnline] = React.useState(true)
  const [leaving, setLeaving] = React.useState(false)
  const elapsed = useElapsed()

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
      return
    }
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    const timer = setTimeout(() => setJoining(false), 2500)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      clearTimeout(timer)
    }
  }, [accessToken, router])

  const handleLeave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      if (accessToken) {
        await completeAiInterview(accessToken)
      }
    } catch {
      // Continue to completion page even if the API call fails
    }
    // Session data is cleared when the completion page unmounts, so the
    // completion page can still read the candidate name/job.
    router.push("/interview/complete?submitted=true")
  }

  if (!accessToken) return null

  const sessionError =
    !conversationUrl ? "Interview session not initialized. Please go back and try again." : ""

  const joinedUrl =
    conversationUrl && meetingToken
      ? `${conversationUrl}${conversationUrl.includes("?") ? "&" : "?"}t=${encodeURIComponent(meetingToken)}`
      : conversationUrl

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="relative z-10 border-b border-border/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <InterviewBrand compact />
            <div className="hidden h-8 w-px bg-border sm:block" aria-hidden />
            <div className="hidden sm:block leading-tight">
              <p className="text-xs font-semibold text-foreground">AI Interview</p>
              <p className="text-[11px] text-muted">
                {candidateFirstName}
                {jobTitle ? ` Â· ${jobTitle}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Badge variant="success" className="gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              In progress
            </Badge>
            <span className="flex items-center gap-1.5 rounded-full bg-surface-elevated px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
              <Clock3 className="h-3 w-3" />
              {formatElapsed(elapsed)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Leave
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-0 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {sessionError ? (
          <div className="flex flex-1 items-center justify-center">
            <Card className="w-full max-w-md p-8 text-center">
              <p className="text-sm text-error" role="alert">
                {sessionError}
              </p>
              <Button variant="outline" className="mt-5" onClick={handleLeave}>
                Return to start
              </Button>
            </Card>
          </div>
        ) : (
          <>
            <section
              className={cn(
                "relative aspect-video w-full overflow-hidden rounded-xl bg-foreground/5 ring-1 ring-border",
                provider !== "MOCK" && "ring-primary/30",
              )}
              aria-label="Live AI interview"
            >
              {provider === "MOCK" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary-subtle to-transparent px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-muted">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-lg font-semibold text-foreground">
                    AI Interview Simulation
                  </p>
                  <p className="max-w-md text-sm leading-relaxed text-muted">
                    You are connected to your AI interviewer. The interview is being conducted
                    now â€” answer naturally, and press <strong>Leave</strong> when you are done.
                  </p>
                </div>
              ) : (
                <div className="relative h-full w-full">
                  {joining && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm text-muted">Connecting you to your AI interviewerâ€¦</p>
                    </div>
                  )}
                  {joinedUrl ? (
                    <iframe
                      src={joinedUrl}
                      title="AI Interview"
                      className="h-full w-full border-0"
                      allow="camera; microphone; fullscreen; display-capture; autoplay"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                      onLoad={() => setJoining(false)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      Unable to load the interview session.
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Camera className="h-3.5 w-3.5 text-primary" />
                  Camera active
                </span>
                <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Mic className="h-3.5 w-3.5 text-primary" />
                  Microphone active
                </span>
                <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Wifi className={cn("h-3.5 w-3.5", isOnline ? "text-success" : "text-error")} />
                  {isOnline ? "Connected" : "Connection lost â€” reconnectingâ€¦"}
                </span>
              </div>
              <p className="text-[11px] text-muted">
                Do not refresh or close this page during the interview.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
