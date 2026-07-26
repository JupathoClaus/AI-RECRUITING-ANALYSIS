"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { completeAiInterview } from "@/lib/api/ai-interviews.api"

export default function InterviewSessionPage() {
  const router = useRouter()
  const accessToken = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-access-token")
    : null
  const conversationUrl = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-conversation-url")
    : null
  const provider = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-provider")
    : null
  const candidateName = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-candidate-name") || "Candidate"
    : "Candidate"
  const jobTitle = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-job-title") || ""
    : ""

  const [loading, setLoading] = React.useState(true)

  const sessionError = !conversationUrl ? "Interview session not initialized. Please go back and try again." : ""

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
      return
    }
    setLoading(false)
  }, [accessToken, router])

  const handleLeave = async () => {
    try {
      if (accessToken) {
        await completeAiInterview(accessToken)
      }
    } catch {
      // Continue to completion page even if API call fails
    }
    router.push("/interview/complete")
  }

  if (!accessToken) return null

  if (sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <p className="text-error">{sessionError}</p>
          <Button onClick={handleLeave}>Return to start</Button>
        </Card>
      </div>
    )
  }

  const isValidUrl = conversationUrl && (conversationUrl.startsWith("https://") || conversationUrl.startsWith("http://localhost"))

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <img src="/ai-recruiter-logo.png" alt="TalentAI" className="h-8 w-8 object-contain" />
          <span className="font-bold text-foreground">TalentAI</span>
          {jobTitle && (
            <>
              <span className="hidden sm:inline text-sm text-muted">|</span>
              <span className="hidden sm:inline text-sm text-muted">{jobTitle}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success">Live</Badge>
          <Button variant="outline" size="sm" onClick={handleLeave}>
            Leave Interview
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 bg-surface">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted">Connecting to interview...</p>
          </div>
        ) : provider === "MOCK" ? (
          <div className="w-full max-w-2xl text-center space-y-6">
            <div className="aspect-video rounded-lg bg-background flex items-center justify-center">
              <div className="space-y-3">
                <p className="text-xl font-semibold text-foreground">AI Interview Simulation</p>
                <p className="text-muted">This is a mock interview session.</p>
                <p className="text-sm text-muted">In production, the Tavus AI interviewer will appear here.</p>
              </div>
            </div>
            <Button onClick={handleLeave}>Complete interview</Button>
          </div>
        ) : isValidUrl ? (
          <div className="w-full max-w-4xl aspect-video rounded-lg overflow-hidden">
            <iframe
              src={conversationUrl}
              className="h-full w-full border-0"
              allow="camera; microphone; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="AI Interview"
            />
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-muted">Unable to load the interview session.</p>
            <Button onClick={handleLeave}>Return to completion</Button>
          </div>
        )}

        <p className="mt-4 text-xs text-muted text-center">
          {candidateName} — Do not refresh or close this page during the interview.
        </p>
      </main>
    </div>
  )
}
