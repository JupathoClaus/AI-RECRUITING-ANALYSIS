"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function InterviewCompletePage() {
  const candidateName = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-candidate-name") || ""
    : ""
  const jobTitle = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-job-title") || ""
    : ""

  React.useEffect(() => {
    return () => {
      sessionStorage.removeItem("ai-interview-access-token")
      sessionStorage.removeItem("ai-interview-candidate-name")
      sessionStorage.removeItem("ai-interview-job-title")
      sessionStorage.removeItem("ai-interview-conversation-url")
      sessionStorage.removeItem("ai-interview-conversation-id")
      sessionStorage.removeItem("ai-interview-meeting-token")
      sessionStorage.removeItem("ai-interview-provider")
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img src="/ai-recruiter-logo.png" alt="TalentAI" className="h-12 w-12 object-contain" />
        <span className="text-xl font-bold text-foreground">TalentAI</span>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <CardTitle className="text-2xl">Interview submitted</CardTitle>
          <CardDescription>
            Thank you, {candidateName}. Your interview for {jobTitle} has been received.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted">
            Authorized recruitment staff will review your interview. You can safely close this page.
          </p>
          <Button variant="outline" className="w-full" onClick={() => window.close()}>
            Close page
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
