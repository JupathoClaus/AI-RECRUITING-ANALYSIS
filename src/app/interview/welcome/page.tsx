"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function InterviewWelcomePage() {
  const router = useRouter()

  const candidateName = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-candidate-name") || "Candidate"
    : "Candidate"
  const jobTitle = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-job-title") || "the position"
    : "the position"
  const accessToken = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-access-token")
    : null

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
    }
  }, [accessToken, router])

  if (!accessToken) return null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img src="/ai-recruiter-logo.png" alt="TalentAI" className="h-12 w-12 object-contain" />
        <span className="text-xl font-bold text-foreground">TalentAI</span>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome, {candidateName}</CardTitle>
          <CardDescription>
            You are about to begin your AI-assisted interview for the {jobTitle} position.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-surface p-4 text-sm text-muted space-y-2">
            <p>
              The AI interviewer will speak with you naturally and may ask follow-up questions
              based on your responses.
            </p>
            <p>
              Answer as you would in a normal interview. Authorized recruitment staff will review
              your interview information.
            </p>
            <p>
              The interview typically takes about 30 minutes. Make sure you are in a quiet
              environment before proceeding.
            </p>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={() => router.push("/interview/preparation")}
          >
            Continue to preparation
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
