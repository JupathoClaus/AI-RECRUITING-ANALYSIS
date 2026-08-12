"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, FileText, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getPublicJob,
  submitPublicApplication,
  uploadPublicResume,
  type PublicJob,
} from "@/lib/api/public-careers.api"

export default function PublicJobPage({ params }: { params: Promise<{ companySlug: string; jobSlug: string }> }) {
  const { companySlug, jobSlug } = React.use(params)
  const [job, setJob] = React.useState<PublicJob | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [reference, setReference] = React.useState<string | null>(null)
  const [resumePending, setResumePending] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)

  React.useEffect(() => {
    getPublicJob(companySlug, jobSlug)
      .then(setJob)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load this role."))
      .finally(() => setLoading(false))
  }, [companySlug, jobSlug])

  const uploadResumeFor = async (publicReference: string, resume: File) => {
    await uploadPublicResume(publicReference, resume)
    setResumePending(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) { setError("Please select a PDF or DOCX CV."); return }
    setSubmitting(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const result = await submitPublicApplication(companySlug, jobSlug, {
        idempotencyKey: crypto.randomUUID(),
        firstName: String(form.get("firstName") || ""),
        lastName: String(form.get("lastName") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || "") || undefined,
        coverLetter: String(form.get("coverLetter") || "") || undefined,
        preferredLanguage: "en",
        consentConfirmed: form.get("consentConfirmed") === "on",
      })
      setReference(result.publicReference)
      setResumePending(true)
      await uploadResumeFor(result.publicReference, file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Application could not be submitted.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <main className="min-h-screen p-10 text-muted">Loading role…</main>
  if (!job) return <main className="min-h-screen p-10 text-error">{error || "Role not found."}</main>

  if (reference && !resumePending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-5 text-2xl font-bold text-foreground">Application received</h1>
          <p className="mt-2 text-muted">Your application and CV were submitted successfully.</p>
          <div className="mt-5 rounded-xl bg-surface-elevated p-3 font-mono text-sm text-foreground">{reference}</div>
          <p className="mt-2 text-xs text-muted">Save this reference to check your application status.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section>
          <Link href={`/careers/${encodeURIComponent(companySlug)}`} className="inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft className="h-4 w-4" />All roles</Link>
          <h1 className="mt-6 text-3xl font-bold text-foreground">{job.title}</h1>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
            {job.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location.city || job.location.name}</span>}
            <span>{job.employmentType.replace(/_/g, " ")}</span><span>{job.workplaceType.replace(/_/g, " ")}</span>
          </div>
          <div className="mt-8 space-y-7 text-sm leading-7 text-foreground/80">
            <JobSection title="About the role" value={job.description} />
            <JobSection title="Responsibilities" value={job.responsibilities} />
            <JobSection title="Qualifications" value={job.qualifications} />
            <JobSection title="Benefits" value={job.benefits} />
          </div>
        </section>

        <aside className="h-fit rounded-3xl border border-border bg-surface p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-foreground">Apply for this role</h2>
          <p className="mt-1 text-sm text-muted">Fields marked required must be completed.</p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3"><Field name="firstName" label="First name" /><Field name="lastName" label="Last name" /></div>
            <Field name="email" label="Email" type="email" />
            <Field name="phone" label="Phone" required={false} />
            <label className="block text-sm font-medium text-foreground">Cover letter<textarea name="coverLetter" rows={5} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="block text-sm font-medium text-foreground">CV (PDF or DOCX, max 10MB)
              <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-dashed border-border bg-background p-3"><FileText className="h-5 w-5 text-primary" /><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={(e) => setFile(e.target.files?.[0] || null)} /></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-muted"><input name="consentConfirmed" type="checkbox" required className="mt-1" /><span>I consent to the processing of my application data for recruitment.</span></label>
            {error && <div className="rounded-xl border border-error/20 bg-error/5 p-3 text-sm text-error">{error}</div>}
            {reference && resumePending && file && (
              <Button type="button" variant="outline" className="w-full" onClick={() => uploadResumeFor(reference, file).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "CV upload failed."))}>Retry CV upload</Button>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
          </form>
        </aside>
      </div>
    </main>
  )
}

function JobSection({ title, value }: { title: string; value: string | null }) {
  if (!value) return null
  return <section><h2 className="text-lg font-semibold text-foreground">{title}</h2><p className="mt-2 whitespace-pre-line">{value}</p></section>
}

function Field({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-foreground">{label}<input name={name} type={type} required={required} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
}
