"use client"

import * as React from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, timeAgo, getErrorMessage } from "@/lib/utils"
import { ArrowLeft, People, InfoCircle, Warning2 } from "iconsax-react"
import {
  fetchCandidateById,
  mapToDisplayStatus,
  type CandidateApiDetail,
  type CandidateApiSkill,
} from "@/lib/api/candidates.api"
import { fetchApplicationsByCandidate } from "@/lib/api/applications.api"
import { getLatestAiScreening, type AiScreeningResultDto } from "@/lib/api/ai-screening.api"
import type { ApplicationStatus } from "@/types"
import { ApiErrorResponse } from "@/lib/api/client"

const MAX_COMPARE = 4

type ScreeningSummaryState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "failed"; message: string }
  | { status: "waiting"; phase: "PENDING" | "RUNNING" }
  | { status: "error"; message: string }
  | { status: "done"; result: AiScreeningResultDto }

interface CompareCandidate {
  candidateId: string
  loaded: boolean
  error?: string
  profile?: CandidateApiDetail
  jobTitle?: string | null
  applicationStatus?: ApplicationStatus
  appliedAt?: string
  screening: ScreeningSummaryState
}

const RECOMMENDATION_LABEL: Record<string, string> = {
  SHORTLIST: "Recommended for shortlist",
  NOT_SHORTLIST: "Not recommended",
  HUMAN_REVIEW: "Human review required",
}

const CONFIDENCE_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
}

function scoreTone(score: number): string {
  if (score >= 75) return "bg-success-muted text-success"
  if (score >= 60) return "bg-warning-muted text-warning"
  return "bg-error-muted text-error"
}

function Cell({ _current, children }: { _current?: unknown; children: React.ReactNode }) {
  return <td className="border-b border-border-subtle px-4 py-3 align-top text-sm text-foreground">{children}</td>
}

function DashCell() {
  return (
    <Cell _current="">
      <span className="text-muted">—</span>
    </Cell>
  )
}

function NoValueCell({ _current, reason }: { _current?: unknown; reason?: string }) {
  return (
    <Cell _current="">
      <span className="text-muted">{reason ?? "—"}</span>
    </Cell>
  )
}

interface CandidateColumnProps {
  candidate: CompareCandidate
  index: number
}

function CandidateColumn({ candidate, index }: CandidateColumnProps) {
  return (
    <th
      scope="col"
      className="border-b border-border px-4 py-3 text-left align-top"
      style={{ minWidth: 200, maxWidth: 260 }}
    >
      {candidate.loaded && candidate.profile ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{candidate.profile.displayName}</span>
            <span className="text-[11px] text-muted">#{index + 1}</span>
          </div>
          {candidate.profile.headline && (
            <p className="text-xs text-muted">{candidate.profile.headline}</p>
          )}
          <Link
            href={`/candidates/${candidate.candidateId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View profile
          </Link>
        </div>
      ) : candidate.error ? (
        <span className="text-xs text-error">{candidate.error}</span>
      ) : (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
    </th>
  )
}

interface ScreeningCellProps {
  state: ScreeningSummaryState
}

function ScreeningScoreCell({ state }: ScreeningCellProps) {
  if (state.status === "loading") return <Skeleton className="h-6 w-10" />
  if (state.status === "done" && state.result.overallScore != null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-1 text-sm font-semibold tabular-nums",
          scoreTone(state.result.overallScore),
        )}
      >
        {state.result.overallScore}
        <span className="ml-0.5 text-[11px] font-normal opacity-70">/100</span>
      </span>
    )
  }
  if (state.status === "none") return <span className="text-xs text-muted">Not screened</span>
  if (state.status === "waiting") return <span className="text-xs text-muted">AI screening {state.phase === "RUNNING" ? "running" : "queued"}…</span>
  if (state.status === "failed") return <span className="text-xs text-error">Screening failed</span>
  if (state.status === "error") return <span className="text-xs text-error">Unavailable</span>
  return <DashCell />
}

export default function CandidateComparePage() {
  const [ids, setIds] = React.useState<string[]>([])
  const [candidates, setCandidates] = React.useState<CompareCandidate[]>([])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const parsed = (params.getAll("ids") || [])
      .map((s) => s.trim())
      .filter((s) => /^[a-f0-9-]+$/i.test(s))
      .slice(0, MAX_COMPARE)
    setIds(parsed)
  }, [])

  React.useEffect(() => {
    if (ids.length === 0) return
    let active = true

    const loadOne = async (candidateId: string): Promise<CompareCandidate> => {
      const base: CompareCandidate = { candidateId, loaded: false, screening: { status: "loading" } }
      try {
        const profile = await fetchCandidateById(candidateId)

        let jobTitle: string | null = null
        let applicationStatus: ApplicationStatus | undefined = undefined
        let appliedAt: string | undefined = undefined
        let appId: string | null = null

        try {
          const apps = await fetchApplicationsByCandidate(candidateId, { page: 1, limit: 10 })
          if (apps.data.length > 0) {
            const latest = [...apps.data].sort((a, b) => {
              const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
              if (diff !== 0) return diff
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            })[0]
            appId = latest.id
            jobTitle = latest.job?.title ?? null
            applicationStatus = latest.status
            appliedAt = latest.submittedAt ?? latest.createdAt
          }
        } catch {
          // Application data unavailable — comparison still shows the profile.
        }

        let screening: ScreeningSummaryState = { status: "none" }
        if (appId) {
          screening = { status: "loading" }
          try {
            const result = await getLatestAiScreening(appId)
            if (result.status === "COMPLETED") {
              screening = { status: "done", result }
            } else if (result.status === "PENDING" || result.status === "RUNNING") {
              screening = { status: "waiting", phase: result.status }
            } else {
              screening = { status: "failed", message: "Screening did not complete." }
            }
          } catch (err) {
            if (err instanceof ApiErrorResponse && err.statusCode === 404) {
              screening = { status: "none" }
            } else if (err instanceof ApiErrorResponse && err.statusCode === 409) {
              screening = { status: "failed", message: getErrorMessage(err, "Screening did not complete.") }
            } else {
              screening = { status: "error", message: getErrorMessage(err, "Screening unavailable") }
            }
          }
        }

        return {
          candidateId,
          loaded: true,
          profile,
          jobTitle,
          applicationStatus,
          appliedAt,
          screening,
        }
      } catch (err) {
        return {
          candidateId,
          loaded: false,
          error: getErrorMessage(err, "Couldn't load candidate"),
          screening: { status: "error", message: "No profile data" },
        }
      }
    }

    Promise.allSettled(ids.map(loadOne)).then((results) => {
      if (!active) return
      const items = results.map((r, idx): CompareCandidate => {
        if (r.status === "fulfilled") return r.value
        return { candidateId: ids[idx], loaded: false, error: "Couldn't load candidate", screening: { status: "error", message: "No profile data" } }
      })
      setCandidates(items)
    })

    return () => {
      active = false
    }
  }, [ids])

  const loading = ids.length > 0 && candidates.length === 0

  // Union of criteria names across all completed screenings, in first-seen order.
  const criteriaRows = React.useMemo(() => {
    const seen = new Map<string, number>()
    for (const c of candidates) {
      if (c.screening.status !== "done") continue
      for (const cr of c.screening.result.criteriaScores ?? []) {
        if (!seen.has(cr.criterion)) seen.set(cr.criterion, seen.size + 1)
      }
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name)
  }, [candidates])

  const skillsOf = (profile?: CandidateApiDetail): CandidateApiSkill[] => profile?.skills ?? []

  return (
    <AppLayout
      title="Compare candidates"
      description="Side-by-side, evidence-based comparison. TalentAI doesn't select a winner — you decide."
      actions={
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" size={16} />
          Back to candidates
        </Link>
      }
    >
      {loading && (
        <div className="space-y-3" aria-label="Loading comparison">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!loading && ids.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <People className="h-10 w-10 text-muted" size={40} />
          <h2 className="text-sm font-semibold text-foreground">Nothing to compare yet</h2>
          <p className="max-w-md text-sm text-muted">
            Select 2–4 candidates on the Candidates page, then choose{" "}
            <span className="font-medium text-foreground">Compare</span> in the action bar to open a
            side-by-side view here.
          </p>
          <Link
            href="/candidates"
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Go to candidates
          </Link>
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
            role="note"
          >
            <InfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" size={16} />
            <p className="text-sm text-muted">
              This table only shows facts about each candidate and their latest completed AI screening.
              AI screening is decision <span className="font-medium text-foreground">support</span> —
              there is no automatic winner and nothing here overrides your judgement.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th scope="col" className="w-40 border-b border-border bg-surface-elevated px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    Candidate
                  </th>
                  {candidates.map((c, i) => (
                    <CandidateColumn key={c.candidateId} candidate={c} index={i} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* ── Basics ─────────────────────────────────────────── */}
                <tr className="bg-surface-elevated">
                  <th scope="row" className="bg-surface-elevated px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    Basics
                  </th>
                  {candidates.map((c) => (
                    <th scope="row" key={c.candidateId} className="bg-surface-elevated px-4 py-2.5 text-xs font-medium text-muted">
                      {c.loaded ? "Application details" : ""}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Job</th>
                  {candidates.map((c) =>
                    c.loaded ? (
                      <Cell key={c.candidateId} _current={c.jobTitle}>{c.jobTitle ? <span className="text-sm text-foreground">{c.jobTitle}</span> : <span className="text-muted">—</span>}</Cell>
                    ) : (
                      <DashCell key={c.candidateId} />
                    ),
                  )}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Application status</th>
                  {candidates.map((c) =>
                    c.loaded && c.applicationStatus ? (
                      <Cell key={c.candidateId} _current={c.applicationStatus}>{mapToDisplayStatus(c.applicationStatus)}</Cell>
                    ) : (
                      <NoValueCell key={c.candidateId} reason={c.loaded ? "No active application" : undefined} />
                    ),
                  )}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Applied</th>
                  {candidates.map((c) =>
                    c.loaded && c.appliedAt ? (
                      <Cell key={c.candidateId} _current={c.appliedAt}>{timeAgo(new Date(c.appliedAt))}</Cell>
                    ) : (
                      <DashCell key={c.candidateId} />
                    ),
                  )}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Location</th>
                  {candidates.map((c) =>
                    c.loaded && c.profile ? (
                      <Cell key={c.candidateId} _current={c.profile.city}>{c.profile.city ?? "—"}</Cell>
                    ) : (
                      <DashCell key={c.candidateId} />
                    ),
                  )}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Experience</th>
                  {candidates.map((c) =>
                    c.loaded && c.profile ? (
                      <Cell key={c.candidateId} _current={c.profile.totalExperienceYears}>
                        {c.profile.totalExperienceYears != null ? `${c.profile.totalExperienceYears} yr${c.profile.totalExperienceYears === 1 ? "" : "s"}` : "—"}
                      </Cell>
                    ) : (
                      <DashCell key={c.candidateId} />
                    ),
                  )}
                </tr>

                {/* ── AI screening ───────────────────────────────────── */}
                <tr className="bg-surface-elevated">
                  <th scope="row" className="bg-surface-elevated px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    AI Screening
                  </th>
                  {candidates.map((c) => (
                    <th scope="row" key={c.candidateId} className="bg-surface-elevated px-4 py-2.5 text-xs font-medium text-muted">
                      {c.loaded ? "Latest completed screening" : ""}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">AI score (0–100)</th>
                  {candidates.map((c) => (
                    <td key={c.candidateId} className="border-b border-border-subtle px-4 py-3 align-top text-sm text-foreground">
                      <ScreeningScoreCell state={c.screening} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Recommendation</th>
                  {candidates.map((c) => {
                    const s = c.screening
                    return (
                      <Cell key={c.candidateId} _current={s.status}>
                        {s.status === "done" ? (
                          s.result.recommendation ? (
                            <span className="text-sm text-foreground">{RECOMMENDATION_LABEL[s.result.recommendation] ?? s.result.recommendation}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Confidence</th>
                  {candidates.map((c) => {
                    const s = c.screening
                    return (
                      <Cell key={c.candidateId} _current={s.status}>
                        {s.status === "done" && s.result.confidence ? (
                          <span className="text-sm text-foreground">{CONFIDENCE_LABEL[s.result.confidence] ?? s.result.confidence}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>

                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Matched qualifications</th>
                  {candidates.map((c) => {
                    const s = c.screening
                    return (
                      <Cell key={c.candidateId} _current={s.status}>
                        {s.status === "done" && s.result.matchedQualifications?.length ? (
                          <ul className="space-y-1">
                            {s.result.matchedQualifications.slice(0, 6).map((q) => (
                              <li key={q} className="flex items-start gap-1.5 text-sm text-foreground">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" />
                                <span className="text-xs leading-relaxed">{q}</span>
                              </li>
                            ))}
                            {s.result.matchedQualifications.length > 6 && (
                              <li className="text-xs text-muted">+{s.result.matchedQualifications.length - 6} more</li>
                            )}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Missing qualifications</th>
                  {candidates.map((c) => {
                    const s = c.screening
                    return (
                      <Cell key={c.candidateId} _current={s.status}>
                        {s.status === "done" && s.result.missingQualifications?.length ? (
                          <ul className="space-y-1">
                            {s.result.missingQualifications.slice(0, 6).map((q) => (
                              <li key={q} className="flex items-start gap-1.5 text-sm text-foreground">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                                <span className="text-xs leading-relaxed">{q}</span>
                              </li>
                            ))}
                            {s.result.missingQualifications.length > 6 && (
                              <li className="text-xs text-muted">+{s.result.missingQualifications.length - 6} more</li>
                            )}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>

                {criteriaRows.length > 0 && (
                  <>
                    <tr>
                      <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Criteria scores</th>
                      {candidates.map((c) => (
                        <Cell key={c.candidateId} _current={c.screening.status}>
                          <span className="text-xs text-muted">of 100 each</span>
                        </Cell>
                      ))}
                    </tr>
                    {criteriaRows.map((criterion) => (
                      <tr key={criterion}>
                        <th scope="row" className="max-w-[220px] px-4 py-2.5 text-xs font-normal text-foreground">
                          {criterion}
                        </th>
                        {candidates.map((c) => {
                          const s = c.screening
                          const cr =
                            s.status === "done"
                              ? s.result.criteriaScores?.find((x) => x.criterion === criterion)
                              : undefined
                          return (
                            <Cell key={c.candidateId} _current={cr?.score}>
                              {cr ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", scoreTone(cr.score))}>
                                    {cr.score}
                                    <span className="ml-0.5 text-[10px] font-normal opacity-70">/ {cr.maximumScore}</span>
                                  </span>
                                  <span className="text-[11px] text-muted">w={cr.weight}</span>
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </Cell>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                )}

                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Uncertainties</th>
                  {candidates.map((c) => {
                    const s = c.screening
                    return (
                      <Cell key={c.candidateId} _current={s.status}>
                        {s.status === "done" && s.result.uncertainties?.length ? (
                          <ul className="space-y-1">
                            {s.result.uncertainties.slice(0, 4).map((u) => (
                              <li key={u} className="flex items-start gap-1.5 text-sm text-foreground">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                                <span className="text-xs leading-relaxed">{u}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Risk flags</th>
                  {candidates.map((c) => {
                    const s = c.screening
                    return (
                      <Cell key={c.candidateId} _current={s.status}>
                        {s.status === "done" && s.result.riskFlags?.length ? (
                          <ul className="space-y-1">
                            {s.result.riskFlags.slice(0, 4).map((r) => (
                              <li key={r} className="flex items-start gap-1.5 text-sm text-foreground">
                                <Warning2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" size={14} />
                                <span className="text-xs leading-relaxed">{r}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>

                {/* ── Profile ──────────────────────────────────────── */}
                <tr className="bg-surface-elevated">
                  <th scope="row" className="bg-surface-elevated px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    Profile
                  </th>
                  {candidates.map((c) => (
                    <th scope="row" key={c.candidateId} className="bg-surface-elevated px-4 py-2.5 text-xs font-medium text-muted">
                      {c.loaded ? "Skills from the candidate profile" : ""}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-foreground">Skills</th>
                  {candidates.map((c) => {
                    const skills = skillsOf(c.profile)
                    return (
                      <Cell key={c.candidateId} _current={skills.length}>
                        {skills.length > 0 ? (
                          <ul className="space-y-1">
                            {skills.slice(0, 8).map((s) => (
                              <li key={s.id} className="flex items-center gap-1.5 text-xs text-foreground">
                                <span className="truncate">{s.name}</span>
                                {s.proficiencyLevel && (
                                  <span className="shrink-0 text-[10px] text-muted">{s.proficiencyLevel}</span>
                                )}
                              </li>
                            ))}
                            {skills.length > 8 && <li className="text-xs text-muted">+{skills.length - 8} more</li>}
                          </ul>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Cell>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            Comparing {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}. Screening scores come from
            each candidate&apos;s latest completed AI screening for their selected application.
          </p>
        </div>
      )}
    </AppLayout>
  )
}