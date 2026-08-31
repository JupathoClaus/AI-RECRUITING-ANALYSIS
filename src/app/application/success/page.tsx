"use client"

import * as React from "react"
import Link from "next/link"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Mail, Search } from "lucide-react"
import { getPublicApplicationStatus } from "@/lib/api/public-careers.api"
import { Button } from "@/components/ui/button"

function StatusLine({ status }: { status: string | null }) {
  if (!status) return null
  const copy: Record<string, string> = {
    received: "Your application has been received and is awaiting review.",
    under_review: "Your application is currently being reviewed.",
    in_progress: "Your application has progressed to the next stage.",
  }
  const text = copy[status]
  if (!text) return null
  return <p className="mt-3 text-xs text-success">{text}</p>
}

export default function ApplicationSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-sm text-muted" role="status">Loading…</p>
        </main>
      }
    >
      <ApplicationSuccessContent />
    </Suspense>
  )
}

function ApplicationSuccessContent() {
  const searchParams = useSearchParams()
  const reference = searchParams.get("ref") ?? ""
  const applicationNumber = searchParams.get("applicationNumber") ?? ""
  const jobTitle = searchParams.get("job") ?? "the role"
  const firstName = searchParams.get("name") ?? ""
  const wasDuplicate = searchParams.get("duplicate") === "1"
  const [liveStatus, setLiveStatus] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!reference) return
    let active = true
    // Best-effort live status; the page is fully usable without it.
    getPublicApplicationStatus(reference)
      .then((result) => active && setLiveStatus(result.status))
      .catch(() => {})
    return () => { active = false }
  }, [reference])

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-2xl px-5 py-6">
          <Link href="/" className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ai-recruiter-logo.png" alt="AI Recruiter" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-base font-bold tracking-tight text-foreground">AI Recruiter</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 items-center px-5 py-12">
        <div className="w-full rounded-3xl border border-border bg-surface p-8 text-center shadow-xl sm:p-10">
          <CheckCircle2 aria-hidden="true" className="mx-auto h-14 w-14 text-success" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {wasDuplicate ? "You have already applied" : "Application Submitted"}
          </h1>

          <p className="mt-3 text-sm leading-7 text-muted">
            Thank you{firstName ? `, ${firstName}` : ""}. Your application for
          </p>
          <p className="text-lg font-semibold text-foreground">{jobTitle}</p>
          <p className="mt-1 text-sm text-muted">
            {wasDuplicate
              ? "was already submitted under your email address — nothing was duplicated."
              : "has been submitted successfully."}
          </p>
          <StatusLine status={liveStatus} />

          {(applicationNumber || reference) && (
            <div className="mt-7 rounded-2xl border border-border-subtle bg-surface-elevated p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Application Reference</p>
              <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                {applicationNumber || reference}
              </p>
              {!applicationNumber && reference && (
                <p className="mt-1 text-[11px] text-muted">Save this reference to check your application status.</p>
              )}
            </div>
          )}

          <div className="mt-8 space-y-3 text-left">
            <p className="flex items-start gap-2.5 text-sm text-muted">
              <Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              The recruitment team will review your application. If selected for the next stage, you may receive an
              email invitation.
            </p>
            <p className="flex items-start gap-2.5 text-sm text-muted">
              <Search aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Your CV will be read automatically to match you with suitable opportunities.
            </p>
          </div>

          <div className="mt-8">
            <Link href="/">
              <Button variant="outline" size="lg">View Other Jobs</Button>
            </Link>
          </div>
        </div>
      </div>

      <footer className="border-t border-border-subtle py-8">
        <p className="text-center text-xs text-muted-foreground">
          Powered by AI Recruiter — fair, structured and transparent hiring.
        </p>
      </footer>
    </main>
  )
}