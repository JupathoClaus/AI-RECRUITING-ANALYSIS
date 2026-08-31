"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { Briefcase, Building2, Clock3, MapPin, Search, Wallet } from "lucide-react"
import { getPublicJobs, type PublicJob } from "@/lib/api/public-careers.api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

export default function CareersPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = React.use(params)
  console.log('[CareersPage] Rendering with companySlug:', companySlug)
  const companyName = React.useMemo(() => companySlug.replace(/-/g, " "), [companySlug])
  const [jobs, setJobs] = React.useState<PublicJob[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [employmentFilter, setEmploymentFilter] = React.useState("all")
  const [locationFilter, setLocationFilter] = React.useState("all")

  React.useEffect(() => {
    console.log('[CareersPage] jobs state changed:', jobs.length, jobs)
  }, [jobs])

  React.useEffect(() => {
    let active = true
    if (!companySlug) {
      setError('Company not found');
      setLoading(false);
      return;
    }
    console.log('[CareersPage] Fetching jobs for companySlug:', companySlug)
    getPublicJobs(companySlug)
      .then((result) => {
        console.log('[CareersPage] getPublicJobs result:', result)
        active && setJobs(result.data)
      })
      .catch((cause: unknown) =>
        active && setError(cause instanceof Error ? cause.message : "Unable to load open roles right now. Please try again shortly."),
      )
      .finally(() => active && setLoading(false));
    return () => { active = false }
  }, [companySlug])

  const employmentTypes = React.useMemo(
    () => Array.from(new Set(jobs.map((job) => job.employmentType))),
    [jobs],
  )
  const locations = React.useMemo(
    () =>
      Array.from(
        new Set(jobs.map((job) => job.location?.city || job.location?.name).filter((v): v is string => !!v)),
      ),
    [jobs],
  )

  const filteredJobs = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return jobs.filter((job) => {
      const matchesSearch =
        query === "" ||
        job.title.toLowerCase().includes(query) ||
        (job.department?.name ?? "").toLowerCase().includes(query) ||
        (job.location?.city || job.location?.name || "").toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query)
      const matchesEmployment = employmentFilter === "all" || job.employmentType === employmentFilter
      const jobLocation = job.location?.city || job.location?.name || ""
      const matchesLocation = locationFilter === "all" || jobLocation === locationFilter
      return matchesSearch && matchesEmployment && matchesLocation
    })
  }, [jobs, search, employmentFilter, locationFilter])

  const hasFilters = search !== "" || employmentFilter !== "all" || locationFilter !== "all"

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="flex items-center gap-3">
            <Image
              src="/ai-recruiter-logo.png"
              alt="AI Recruiter"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-contain"
              priority
            />
            <span className="text-base font-bold tracking-tight text-foreground">AI Recruiter</span>
          </div>
          <div className="mt-8 flex items-center gap-2 text-sm font-medium capitalize text-primary">
            <Building2 className="h-4 w-4" />
            {companyName}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Open opportunities
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Explore current roles and apply securely with your CV. Every application is reviewed by the hiring team.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8">
        {/* Search + filters */}
        {!loading && !error && jobs.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                aria-label="Search roles"
                placeholder="Search by title, team or keyword…"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={employmentFilter} onValueChange={setEmploymentFilter}>
              <SelectTrigger aria-label="Filter by employment type" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Employment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employment types</SelectItem>
                {employmentTypes.map((type) => (
                  <SelectItem key={type} value={type}>{formatEmploymentType(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger aria-label="Filter by location" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location} value={location}>{location}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading && (
          <div className="space-y-4" role="status" aria-live="polite">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-error" role="alert">{error}</div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-12 text-center shadow-sm">
            <Briefcase className="mx-auto h-8 w-8 text-muted" />
            <h2 className="mt-4 font-semibold text-foreground">No open roles right now</h2>
            <p className="mt-1 text-sm text-muted">Please check back again soon.</p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-12 text-center shadow-sm">
            <Briefcase className="mx-auto h-8 w-8 text-muted" />
            <h2 className="mt-4 font-semibold text-foreground">No roles match your filters</h2>
            <p className="mt-1 text-sm text-muted">Try a different keyword or clear the filters.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => { setSearch(""); setEmploymentFilter("all"); setLocationFilter("all") }}
            >
              Clear filters
            </Button>
          </div>
        )}

        <div className="grid gap-4">
          {filteredJobs.map((job) => (
            <article key={job.id} className="group rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    <Link
                      href={`/careers/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(job.slug)}`}
                      className="hover:text-primary"
                    >
                      {job.title}
                    </Link>
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                    {job.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />{job.location.city || job.location.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="h-4 w-4" />{formatEmploymentType(job.employmentType)}
                    </span>
                    {job.department && <Badge variant="secondary">{job.department.name}</Badge>}
                    {formatSalary(job) && (
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-4 w-4" />{formatSalary(job)}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/careers/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(job.slug)}`}
                  className="shrink-0"
                >
                  <Button>View Job</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>

        {!loading && !error && jobs.length > 0 && (
          <p className="mt-6 text-center text-xs text-muted" role="status">
            Showing {filteredJobs.length} of {jobs.length} open role{jobs.length === 1 ? "" : "s"}
            {hasFilters ? " (filtered)" : ""}
          </p>
        )}
      </section>

      <footer className="border-t border-border-subtle py-8">
        <p className="text-center text-xs text-muted-foreground">
          Powered by AI Recruiter — fair, structured and transparent hiring.
        </p>
      </footer>
    </main>
  )
}