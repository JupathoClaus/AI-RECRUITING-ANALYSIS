// Default Jobs view semantics: the Active view excludes closed/filled/
// cancelled/archived jobs; the History view shows only those terminal states.
// Server-derived counts stay accurate because the scope is expressed as an
// explicit status filter on the backend query.

export const JOB_ACTIVE_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "PAUSED",
]

export const JOB_HISTORY_STATUSES = ["CLOSED", "FILLED", "CANCELLED", "ARCHIVED"]

export type JobScope = "active" | "history"

export function resolveJobStatusFilter(
  scope: JobScope,
  explicitStatus: string | null
): string[] {
  if (explicitStatus && explicitStatus !== "all") return [explicitStatus]
  return scope === "history" ? JOB_HISTORY_STATUSES : JOB_ACTIVE_STATUSES
}
