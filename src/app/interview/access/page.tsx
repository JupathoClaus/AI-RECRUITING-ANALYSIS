"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { verifyInterviewCode } from "@/lib/api/ai-interviews.api"

export default function InterviewAccessPage() {
  const router = useRouter()

  const [code, setCode] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError("")

    try {
      const result = await verifyInterviewCode(code.trim())
      sessionStorage.setItem("ai-interview-access-token", result.accessToken)
      sessionStorage.setItem("ai-interview-candidate-name", result.candidateName)
      sessionStorage.setItem("ai-interview-job-title", result.jobTitle)
      router.push("/interview/welcome")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "We could not verify this interview code."
      if (message.includes("expired") || message.includes("no longer")) {
        setError("This interview is no longer available.")
      } else {
        setError(message || "We could not verify this interview code.")
      }
    } finally {
      setLoading(false)
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
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img src="/ai-recruiter-logo.png" alt="TalentAI" className="h-12 w-12 object-contain" />
        <span className="text-xl font-bold text-foreground">TalentAI</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to your AI interview</CardTitle>
          <CardDescription>
            Enter your interview code to begin. The code was sent to you by email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="code" className="sr-only">Interview code</label>
              <Input
                id="code"
                type="text"
                placeholder="ABCD-EFGH"
                value={code}
                onChange={handleChange}
                className="text-center text-lg font-mono tracking-widest"
                disabled={loading}
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-error text-center" role="alert">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading || code.trim().length < 5}>
              {loading ? "Verifying..." : "Continue"}
            </Button>

            <p className="text-xs text-muted text-center">
              Need help? Contact the recruitment team that invited you.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
