"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { ChevronLeft, ExternalLink, GraduationCap, Mail, MapPin, Phone, UserRound } from "lucide-react"
import { ApplicationStatusBadge } from "@/components/recruitment/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchCandidateActivity, fetchCandidateById } from "@/lib/api/candidates.api"
import { fetchApplicationsByCandidate, type ApplicationListItem } from "@/lib/api/applications.api"
import type { CandidateApiDetail, CandidateActivityItem, CandidateApiEducation } from "@/lib/api/candidates.api"

// ── Helpers ────────────────────────────────────────────────────────

function formatEducationDates(edu: CandidateApiEducation): string {
  const start = edu.startDate ? new Date(edu.startDate).getFullYear() : null
  const end = edu.endDate ? new Date(edu.endDate).getFullYear() : edu.status === "COMPLETED" ? null : "Present"
  if (start && end) return `${start} – ${end}`
  if (start) return `${start}`
  return ""
}

function formatEducationLevel(level: string): string {
  return level
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── CandidateProfile ───────────────────────────────────────────────

export function CandidateProfile() {
  const { candidateId } = useParams<{ candidateId: string }>()
  const searchParams = useSearchParams()
  const fromPath = searchParams?.get("from") ?? null

  const [candidate, setCandidate] = React.useState<CandidateApiDetail | null>(null)
  const [applications, setApplications] = React.useState<ApplicationListItem[]>([])
  const [activities, setActivities] = React.useState<CandidateActivityItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    Promise.all([
      fetchCandidateById(candidateId),
      fetchApplicationsByCandidate(candidateId, { page: 1, limit: 20 }),
      fetchCandidateActivity(candidateId, { page: 1, limit: 10 }).catch(() => null),
    ])
      .then(([detail, appResponse, activityResponse]) => {
        if (active) {
          setCandidate(detail)
          setApplications(appResponse.data)
          setActivities(activityResponse?.data ?? [])
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "This candidate profile could not be loaded.")
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [candidateId])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <EmptyState
        title="Candidate unavailable"
        description={error || "This candidate was not found."}
        action={
          <Link href="/candidates" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-hover">
            Back to candidates
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-xl border border-border bg-surface p-5 shadow-card">
        {/* Back navigation: prefer returning to the originating workspace */}
        <div className="flex flex-wrap items-center gap-3">
          {fromPath ? (
            <Link
              href={fromPath}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back to application
            </Link>
          ) : null}
          <Link
            href="/candidates"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Candidates
          </Link>
        </div>

        <div className="mt-4 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{candidate.displayName}</h1>
            <p className="mt-1 text-sm text-muted">
              {candidate.headline || candidate.currentJobTitle || "Candidate profile"}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {candidate.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {candidate.email}
                </span>
              )}
              {candidate.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {candidate.phone}
                </span>
              )}
              {candidate.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {candidate.city}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Profile overview */}
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted">
                {candidate.summary || "No professional summary is available."}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-muted">Current role</p>
                  <p className="mt-1 font-medium">
                    {candidate.currentJobTitle || "Unavailable"}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Experience</p>
                  <p className="mt-1 font-medium">
                    {candidate.totalExperienceYears == null
                      ? "Unavailable"
                      : `${candidate.totalExperienceYears} year${candidate.totalExperienceYears === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Applications */}
          <Card>
            <CardHeader>
              <CardTitle>Applications</CardTitle>
            </CardHeader>
            <CardContent>
              {applications.length ? (
                <div className="divide-y divide-border">
                  {applications.map((application) => (
                    <Link
                      key={application.id}
                      href={`/applications/${application.id}`}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 hover:bg-surface-elevated rounded-md px-1 -mx-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {application.job?.title || "Job unavailable"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          Application #{application.applicationNumber}
                          {application.currentStage?.name && ` · ${application.currentStage.name}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <ApplicationStatusBadge status={application.status} />
                        <ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No applications are available for this candidate.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Employment history */}
          <Card>
            <CardHeader>
              <CardTitle>Experience</CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.employment.length ? (
                <ol className="space-y-4">
                  {candidate.employment.map((job) => (
                    <li key={job.id} className="text-sm">
                      <p className="font-medium">{job.jobTitle}</p>
                      <p className="text-muted">
                        {job.companyName}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                      {(job.startDate || job.endDate) && (
                        <p className="text-xs text-muted mt-0.5">
                          {job.startDate ? new Date(job.startDate).getFullYear() : ""}
                          {" – "}
                          {job.currentlyWorking ? "Present" : job.endDate ? new Date(job.endDate).getFullYear() : ""}
                        </p>
                      )}
                      {job.description && (
                        <p className="mt-1 text-muted line-clamp-2">{job.description}</p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No employment history is available.</p>
              )}
            </CardContent>
          </Card>

          {/* Education */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                Education
              </CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.education.length ? (
                <ol className="space-y-4">
                  {candidate.education.map((edu) => {
                    const dates = formatEducationDates(edu)
                    return (
                      <li key={edu.id} className="text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{edu.institution}</p>
                            <p className="text-muted">
                              {formatEducationLevel(edu.level)}
                              {edu.fieldOfStudy && ` · ${edu.fieldOfStudy}`}
                            </p>
                            {dates && <p className="mt-0.5 text-xs text-muted">{dates}</p>}
                          </div>
                          {edu.grade && (
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              {edu.grade}
                            </Badge>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted">No education history is available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.skills.length ? (
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill) => (
                    <span
                      key={skill.id}
                      className="rounded-md bg-surface-elevated px-2 py-1 text-xs"
                    >
                      {skill.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No skills recorded.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length ? (
                <ol className="space-y-3">
                  {activities.map((activity) => (
                    <li key={activity.id} className="border-l-2 border-border pl-3 text-sm">
                      <p>{activity.description || activity.eventType}</p>
                      <p className="mt-1 text-xs text-muted">
                        {new Date(activity.occurredAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No activity history is available.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
