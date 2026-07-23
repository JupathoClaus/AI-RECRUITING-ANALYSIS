"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { verifyEmail, resendVerification } from "@/lib/api/auth.api"

function useDerivedStatus(searchParams: URLSearchParams) {
  return React.useMemo(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const token = searchParams.get("token")

    if (success === "true") return { status: "success" as const, token: null }
    if (error === "expired") return { status: "expired" as const, token: null }
    if (error === "invalid") return { status: "invalid" as const, token: null }
    if (token) return { status: "verifying" as const, token }
    return { status: "invalid" as const, token: null }
  }, [searchParams])
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const { status: derivedStatus, token } = useDerivedStatus(searchParams)
  const [resolvedStatus, setResolvedStatus] = React.useState<"verifying" | "success" | "expired" | "invalid">(
    derivedStatus === "verifying" ? "verifying" : derivedStatus,
  )
  const [resending, setResending] = React.useState(false)
  const [resent, setResent] = React.useState(false)
  const [resendEmail, setResendEmail] = React.useState("")
  const [showResendForm, setShowResendForm] = React.useState(false)

  const displayStatus = derivedStatus === "verifying" ? resolvedStatus : derivedStatus

  React.useEffect(() => {
    if (derivedStatus !== "verifying" || !token) return

    let cancelled = false
    verifyEmail(token)
      .then(() => { if (!cancelled) setResolvedStatus("success") })
      .catch((err: { message?: string }) => {
        if (cancelled) return
        setResolvedStatus(err.message?.includes("expired") ? "expired" : "invalid")
      })
    return () => { cancelled = true }
  }, [derivedStatus, token])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resendEmail.trim()) return
    setResending(true)
    try {
      await resendVerification(resendEmail.trim())
      setResent(true)
    } catch {
      setResent(true)
    } finally {
      setResending(false)
    }
  }

  if (displayStatus === "verifying") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Verifying your email...</p>
        </div>
      </div>
    )
  }

  if (displayStatus === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-6">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-3">
            Email verified successfully
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            Your account has been verified. You can now sign in.
          </p>
          <Link href="/login">
            <Button className="w-full" size="lg">
              Go to Sign In
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (displayStatus === "expired") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 mb-6">
            <XCircle className="h-8 w-8 text-warning" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-3">
            Verification link expired
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            This verification link has expired. Please request a new one.
          </p>

          {resent ? (
            <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm text-success mb-6">
              If the email exists and requires verification, a new link has been sent.
            </div>
          ) : showResendForm ? (
            <form onSubmit={handleResend} className="space-y-4 mb-6">
              <input
                type="email"
                placeholder="Enter your email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button type="submit" className="w-full" disabled={resending}>
                {resending ? "Sending..." : "Resend Verification Email"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setShowResendForm(true)}>
                Resend Verification Email
              </Button>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Back to Sign In
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/10 mb-6">
          <XCircle className="h-8 w-8 text-error" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-3">
          Invalid verification link
        </h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          This verification link is invalid or has already been used.
        </p>
        <div className="space-y-3">
          <Link href="/login">
            <Button className="w-full">
              Back to Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="outline" className="w-full">
              Create New Account
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  )
}
