/**
 * Jobs default-view semantics: Active excludes CLOSED/FILLED/CANCELLED/
 * ARCHIVED; History shows only those; explicit filters override the scope.
 */

import { describe, it, expect } from "vitest"
import {
  resolveJobStatusFilter,
  JOB_ACTIVE_STATUSES,
  JOB_HISTORY_STATUSES,
} from "@/lib/jobs-view"

describe("resolveJobStatusFilter", () => {
  it("defaults to Active statuses that exclude closed/filled/cancelled/archived", () => {
    expect(resolveJobStatusFilter("active", null)).toEqual(JOB_ACTIVE_STATUSES)
    expect(JOB_ACTIVE_STATUSES).not.toContain("CLOSED")
    expect(JOB_ACTIVE_STATUSES).not.toContain("FILLED")
    expect(JOB_ACTIVE_STATUSES).not.toContain("CANCELLED")
    expect(JOB_ACTIVE_STATUSES).not.toContain("ARCHIVED")
  })

  it("history view filters to terminal statuses only", () => {
    expect(resolveJobStatusFilter("history", null)).toEqual(JOB_HISTORY_STATUSES)
  })

  it("an explicit status filter overrides the scope", () => {
    expect(resolveJobStatusFilter("active", "CLOSED")).toEqual(["CLOSED"])
    expect(resolveJobStatusFilter("history", "PUBLISHED")).toEqual(["PUBLISHED"])
  })

  it("treats 'all' as no explicit filter", () => {
    expect(resolveJobStatusFilter("active", "all")).toEqual(JOB_ACTIVE_STATUSES)
    expect(resolveJobStatusFilter("history", "all")).toEqual(JOB_HISTORY_STATUSES)
  })
})
