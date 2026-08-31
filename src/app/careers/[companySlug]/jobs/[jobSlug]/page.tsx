"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Briefcase, CalendarClock, Clock3, GraduationCap, MapPin, Wallet, Users } from "lucide-react"
import { getPublicJob, type PublicJob } from "@/lib/api/public-careers.api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

function formatEmploymentType(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSalary(job: PublicJob): string | null {
  if (!job.salaryMin && !job.salaryMax) return null
  const currency = job.salaryCurrency || ""
  if (job.salaryMin && job.salaryMax) return `${currency}${job.salaryMin.toLocaleString()} – ${currency}${job.salaryMax.toLocaleString()}`
  const value = job.salaryMin || job.salaryMax
  return `${currency}${value?.toLocaleString()}+`
}

export default function PublicJobPage({ params }: { params: Promise<{ companySlug: string; jobSlug: string }> }) {
  const { companySlug, jobSlug } = React.use(params)
  const companyName = React.useMemo(() => companySlug.replace(/-/g, " "), [companySlug])
  const [job, setJob] = React.useState<PublicJob | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    getPublicJob(companySlug, jobSlug)
      .then((result) => active && setJob(result))
      .catch((cause: unknown) =>
        active && setError(cause instanceof Error ? cause.message : "This role is no longer available."),
      )
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [companySlug, jobSlug])

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-5 py-16" role="status" aria-live="polite">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-surface" />
          <div className="mt-6 h-40 w-full animate-pulse rounded-2xl bg-surface" />
        </div>
      </main>
    )
  }

  if (!job) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-5 text-center">
        <Briefcase className="h-10 w-10 text-muted" />
        <h1 className="text-xl font-semibold text-foreground">Role not available</h1>
        <p className="max-w-md text-sm text-muted">{error || "This role may have been closed or filled."}</p>
        <Link href={`/careers/${encodeURIComponent(companySlug)}`}>
          <Button variant="outline">Browse all open roles</Button>
        </Link>
      </main>
    )
  }

  const salary = formatSalary(job)

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <Link
            href={`/careers/${encodeURIComponent(companySlug)}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover"
          >
            <ArrowLeft className="h-4 w-4" />All open roles
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-10">
        {/* Title block */}
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <p className="flex items-center gap-2 text-sm font-medium capitalize text-primary">
            <Briefcase className="h-4 w-4" />{companyName}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">{job.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            {job.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />{job.location.city || job.location.name}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />{formatEmploymentType(job.employmentType)}
            </span>
            <span>{formatEmploymentType(job.workplaceType)}</span>
            {job.experienceLevel && <Badge variant="secondary">{job.experienceLevel}</Badge>}
          </div>

          {(salary || job.applicationDeadline || job.numberOfOpenings) && (
            <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border-subtle pt-6 sm:grid-cols-3">
              {salary && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Salary</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Wallet className="h-4 w-4 text-muted" />{salary}
                  </dd>
                </div>
              )}
              {job.numberOfOpenings ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Openings</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Users className="h-4 w-4 text-muted" />
                    {job.numberOfOpenings} position{job.numberOfOpenings === 1 ? "" : "s"}
                  </dd>
                </div>
              ) : null}
              {job.applicationDeadline ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Apply before</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CalendarClock className="h-4 w-4 text-muted" />
                    {new Date(job.applicationDeadline).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}

          <div className="mt-8">
            <Link href={`/careers/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(job.slug)}/apply`}>
              <Button size="lg" className="w-full sm:w-auto sm:px-10">Apply for this Job</Button>
            </Link>
            <p className="mt-3 text-xs text-muted">
              Takes a few minutes — you will upload your CV and answer a short set of questions.
            </p>
          </div>
        </div>

        {/* Description sections */}
        <div className="mt-8 space-y-8 rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <JobSection title="About the Role" value={job.description} />
          <JobSection title="Responsibilities" value={job.responsibilities} />
          <JobSection title="Qualifications" value={job.qualifications} />
          <JobSection title="Benefits" value={job.benefits} />

          {!job.responsibilities && !job.qualifications && !job.benefits && (
            <p className="text-sm text-muted">
              The full description is listed above. Apply to receive the complete role brief.
            </p>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 rounded-3xl border border-primary/20 bg-primary-subtle p-6 text-center sm:p-8">
          <GraduationCap className="mx-auto h-6 w-6 text-primary" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Ready to apply?</h2>
          <p className="mt-1 text-sm text-muted">Your application goes directly to the hiring team.</p>
          <Link href={`/careers/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(job.slug)}/apply`} className="mt-4 inline-block">
            <Button size="lg" className="sm:px-12">Apply for this Job</Button>
          </Link>
        </div>
      </article>

      <footer className="border-t border-border-subtle py-8">
        <p className="text-center text-xs text-muted-foreground">
          Powered by AI Recruiter — fair, structured and transparent hiring.
        </p>
      </footer>
    </main>
  )
}

function JobSection({ title, value }: { title: string; value: string | null }) {
  if (!value?.trim()) return null
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-foreground/80">{value}</p>
    </section>
  )
}