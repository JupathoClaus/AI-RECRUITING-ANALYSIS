"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, UploadCloud, X, Loader2 } from "lucide-react"
import {
  getPublicJob,
  submitPublicApplication,
  type PublicJob,
} from "@/lib/api/public-careers.api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CareersHeader } from "@/components/careers/careers-header"

const ACCEPTED_FORMATS = ".pdf,.docx"
const MAX_SIZE_MB = 10

type SubmitError = { title: string; detail: string }

function describeSubmitError(cause: unknown): SubmitError {
  const message = cause instanceof Error ? cause.message : ""
  if (/already has an active application/i.test(message)) {
    return {
      title: "You have already applied",
      detail: "We found an existing application for this role under your email address. Nothing was duplicated.",
    }
  }
  if (/consent/i.test(message)) {
    return { title: "Consent required", detail: "Please confirm the data-processing consent below before submitting." }
  }
  if (/FILE_TOO_LARGE/i.test(message)) {
    return { title: "CV file is too large", detail: `The maximum CV size is ${MAX_SIZE_MB} MB. Please use a smaller file.` }
  }
  if (/FILE_EXTENSION_NOT_ALLOWED|FILE_TYPE_NOT_ALLOWED|FILE_EXTENSION_MISSING/i.test(message)) {
    return { title: "Unsupported CV format", detail: "Only PDF and DOCX files are accepted." }
  }
  if (/FILE_SIGNATURE_MISMATCH|FILE_TOO_SMALL/i.test(message)) {
    return { title: "This file does not look like a valid document", detail: "The file may be corrupted or renamed. Please attach a real PDF or DOCX CV." }
  }
  if (/no longer accepting|not accepting/i.test(message) || /not found/i.test(message)) {
    return { title: "This role is no longer accepting applications", detail: "Browse our other open roles to find a match." }
  }
  if (/failed to fetch|network|internet/i.test(message)) {
    return {
      title: "Network problem",
      detail: "We couldn't reach the server. Check your connection and submit again — your application will not be duplicated.",
    }
  }
  return {
    title: "We couldn't submit your application",
    detail: `${message || "Please try again."} If the problem continues, nothing was duplicated — it is safe to retry.`,
  }
}

export default function ApplyPage({ params }: { params: Promise<{ companySlug: string; jobSlug: string }> }) {
  const { companySlug, jobSlug } = React.use(params)
  const router = useRouter()
  const companyName = React.useMemo(() => companySlug.replace(/-/g, " "), [companySlug])

  const [job, setJob] = React.useState<PublicJob | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [resumeFile, setResumeFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<SubmitError | null>(null)

  React.useEffect(() => {
    let active = true
    getPublicJob(companySlug, jobSlug)
      .then((jobResult) => {
        if (!active) return
        setJob(jobResult)
      })
      .catch((cause: unknown) =>
        active && setLoadError(cause instanceof Error ? cause.message : "This role is no longer available."),
      )
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [companySlug, jobSlug])

  const validateResume = (file: File): string | null => {
    const extension = file.name.split(".").pop()?.toLowerCase()
    if (!extension || !["pdf", "docx"].includes(extension)) return "Only PDF and DOCX files are accepted."
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return `The file exceeds the ${MAX_SIZE_MB} MB limit.`
    return null
  }

  const handleFileChange = (file: File | undefined) => {
    if (!file) return
    const validationError = validateResume(file)
    if (validationError) {
      setFileError(validationError)
      setResumeFile(null)
      return
    }
    setFileError(null)
    setResumeFile(file)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || !resumeFile || !job) return

    const form = event.currentTarget
    const data = new FormData(form)

    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitPublicApplication(
        companySlug,
        jobSlug,
        {
          firstName: String(data.get("firstName") || "").trim(),
          lastName: String(data.get("lastName") || "").trim(),
          email: String(data.get("email") || "").trim(),
          phone: String(data.get("phone") || "").trim() || undefined,
          currentJobTitle: String(data.get("currentJobTitle") || "").trim() || undefined,
          totalExperienceYears: data.get("totalExperienceYears")
            ? Number(data.get("totalExperienceYears"))
            : undefined,
          linkedInUrl: String(data.get("linkedInUrl") || "").trim() || undefined,
          portfolioUrl: String(data.get("portfolioUrl") || "").trim() || undefined,
          coverLetter: String(data.get("coverLetter") || "").trim() || undefined,
          preferredLanguage: "en",
          consentConfirmed: data.get("consentConfirmed") === "on",
          websiteUrl: String(data.get("websiteUrl") || ""),
        },
        resumeFile,
      )

      const successQuery = new URLSearchParams({
        ref: result.publicReference,
        applicationNumber: result.applicationNumber ?? "",
        job: job.title,
        name: String(data.get("firstName") || "").trim(),
        duplicate: result.status === "pending_review" ? "1" : "",
      })
      router.push(`/application/success?${successQuery.toString()}`)
    } catch (cause) {
      setSubmitError(describeSubmitError(cause))
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <CareersHeader companySlug={companySlug} companyName={companyName} />
        <div className="mx-auto max-w-3xl px-5 py-16" role="status" aria-live="polite">
          <div className="h-10 w-72 animate-pulse rounded-lg bg-surface" />
          <div className="mt-8 h-96 w-full animate-pulse rounded-2xl bg-surface" />
        </div>
      </main>
    )
  }

  if (!job) {
    return (
      <main className="min-h-screen bg-background">
        <CareersHeader />
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-5 py-24 text-center">
          <h1 className="text-xl font-semibold text-foreground">Role not available</h1>
          <p className="text-sm text-muted">{loadError || "This role may have been closed or filled."}</p>
          <Link href={`/careers/${encodeURIComponent(companySlug)}`}>
            <Button variant="outline">Browse all open roles</Button>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <CareersHeader companySlug={companySlug} companyName={companyName} />

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
        {/* Role summary */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">You are applying for</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{job.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm capitalize text-muted">
            <span>{companyName}</span>
            {job.location && <><span aria-hidden>·</span><span>{job.location.city || job.location.name}</span></>}
            <span aria-hidden>·</span>
            <span>{job.employmentType.replace(/_/g, " ").toLowerCase()}</span>
          </p>
        </section>

        {/* Submission error */}
        {submitError && (
          <div className="mt-5 rounded-xl border border-error/25 bg-error/5 p-4" role="alert">
            <p className="text-sm font-semibold text-error">{submitError.title}</p>
            <p className="mt-1 text-sm text-error/90">{submitError.detail}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate={false}>
          {/* Personal Information */}
          <fieldset className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <legend className="px-1 text-base font-semibold text-foreground">Personal Information</legend>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LabeledInput label="First Name" name="firstName" required autoComplete="given-name" placeholder="Jordan" />
              <LabeledInput label="Last Name" name="lastName" required autoComplete="family-name" placeholder="Lee" />
              <LabeledInput label="Email Address" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              <LabeledInput label="Phone Number" name="phone" type="tel" required={false} autoComplete="tel" placeholder="+1 555 0100" />
            </div>
          </fieldset>

          {/* Resume */}
          <fieldset className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <legend className="px-1 text-base font-semibold text-foreground">CV / Resume</legend>
            <label
              htmlFor="resume-input"
              className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary-subtle focus-within:border-primary"
            >
              <UploadCloud className="h-8 w-8 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">
                Drag & drop or <span className="text-primary underline underline-offset-2">browse</span>
              </span>
              <span className="text-xs text-muted">PDF or DOCX · Max {MAX_SIZE_MB} MB</span>
              <input
                id="resume-input"
                type="file"
                accept={ACCEPTED_FORMATS}
                className="sr-only"
                required
                onChange={(event) => handleFileChange(event.target.files?.[0])}
              />
            </label>
            {fileError && <p className="mt-2 text-sm text-error" role="alert">{fileError}</p>}
            {resumeFile && !fileError && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <FileText className="h-8 w-8 shrink-0 text-blue-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{resumeFile.name}</p>
                  <p className="text-xs text-muted">{(resumeFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${resumeFile.name}`}
                  className="rounded-full p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
                  onClick={() => setResumeFile(null)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </fieldset>

          {/* Cover letter */}
          <fieldset className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <legend className="px-1 text-base font-semibold text-foreground">Additional Information</legend>
            <label htmlFor="coverLetter" className="mt-4 block text-sm font-medium text-foreground">
              Cover Letter / Motivation <span className="font-normal text-muted">(optional)</span>
              <textarea
                id="coverLetter"
                name="coverLetter"
                rows={5}
                maxLength={5000}
                placeholder="Tell us why this role fits you…"
                className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </fieldset>

          {/* Consent */}
          <fieldset className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <legend className="px-1 text-base font-semibold text-foreground">Consent</legend>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-foreground">
              <input
                name="consentConfirmed"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
              />
              <span>
                I confirm that the information provided is accurate and I consent to{" "}
                <span className="font-medium capitalize">{companyName}</span> processing my application data for
                recruitment purposes.
              </span>
            </label>
          </fieldset>

          {/* Honeypot — visually hidden, humans never fill this */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="websiteUrl">Website</label>
            <input id="websiteUrl" name="websiteUrl" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {/* Submit */}
          <div className="sticky bottom-0 mt-6 border-t border-border bg-background/95 py-4 backdrop-blur">
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:px-12" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Application"
              )}
            </Button>
            <p className="mt-2 text-xs text-muted">
              {submitting
                ? "Storing your application and CV securely…"
                : "Your CV is read automatically to match you with the right roles."}
            </p>
          </div>
        </form>
      </div>

      <footer className="border-t border-border-subtle py-8">
        <p className="text-center text-xs text-muted-foreground">
          Powered by AI Recruiter — fair, structured and transparent hiring.
        </p>
      </footer>
    </main>
  )
}

function LabeledInput({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder,
  min,
  max,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  autoComplete?: string
  placeholder?: string
  min?: number
  max?: number
}) {
  return (
    <label htmlFor={`field-${name}`} className="block text-sm font-medium text-foreground">
      {label}
      {required && <span aria-hidden="true" className="ml-0.5 text-error">*</span>}
      <Input
        id={`field-${name}`}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        min={min}
        max={max}
        className="mt-1.5"
      />
    </label>
  )
}