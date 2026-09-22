"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getErrorMessage } from "@/lib/utils"
import { verifyAssessmentCode, getCandidateAssessmentToken } from "@/lib/api/assessments.api"

export default function AssessmentStartPage() {
  const router = useRouter()
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (getCandidateAssessmentToken()) router.replace("/assessments/take")
  }, [router])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    verifyAssessmentCode(code.trim())
      .then(() => router.push("/assessments/take"))
      .catch((reason: unknown) => setError(getErrorMessage(reason, "This code is not valid. Check the code from your invitation email.")))
      .finally(() => setBusy(false))
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Complete your assessment</CardTitle>
          <p className="text-sm text-muted">Enter the access code from your invitation email to begin. Your answers save automatically as you go.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">Access code
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoComplete="off"
                aria-label="Assessment access code"
                className="mt-1 text-center text-lg tracking-[0.2em]"
              />
            </label>
            {error && <p className="text-sm text-error" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !code.trim()}>{busy ? "Verifying…" : "Continue"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
