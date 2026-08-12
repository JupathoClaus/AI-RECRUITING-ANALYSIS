"use client"

import * as React from "react"
import Link from "next/link"
import { Briefcase, Building2, Clock3, MapPin } from "lucide-react"
import { getPublicJobs, type PublicJob } from "@/lib/api/public-careers.api"
import { Button } from "@/components/ui/button"

export default function CareersPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = React.use(params)
  const [jobs, setJobs] = React.useState<PublicJob[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    getPublicJobs(companySlug)
      .then((result) => active && setJobs(result.data))
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load jobs."))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [companySlug])

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="flex items-center gap-3 text-primary">
            <Building2 className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-wider">{companySlug.replace(/-/g, " ")}</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold text-foreground">Open opportunities</h1>
          <p className="mt-2 max-w-2xl text-muted">Explore current roles and apply securely with your CV.</p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-10">
        {loading && <p className="text-muted">Loading opportunities…</p>}
        {error && <div className="rounded-xl border border-error/20 bg-error/5 p-4 text-error">{error}</div>}
        {!loading && !error && jobs.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-muted" />
            <h2 className="mt-4 font-semibold text-foreground">No open roles right now</h2>
            <p className="mt-1 text-sm text-muted">Please check back again soon.</p>
          </div>
        )}
        <div className="grid gap-4">
          {jobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{job.title}</h2>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
                    {job.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location.city || job.location.name}</span>}
                    <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{job.employmentType.replace(/_/g, " ")}</span>
                    {job.department && <span>{job.department.name}</span>}
                  </div>
                </div>
                <Link href={`/careers/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(job.slug)}`}>
                  <Button>View role</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
