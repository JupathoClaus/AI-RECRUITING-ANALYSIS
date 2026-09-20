"use client"

import * as React from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { JobListDto } from "@/lib/api/types"
import type { PipelineStageDto } from "@/lib/api/jobs.api"

export interface ApplicationFilterValues {
  search: string
  jobSearch: string
  jobId: string
  status: string
  source: string
  stageId: string
  submittedFrom: string
  submittedTo: string
}

interface ApplicationFiltersProps {
  values: ApplicationFilterValues
  jobs: JobListDto[]
  stages: PipelineStageDto[]
  onChange: (next: ApplicationFilterValues) => void
  onJobSearch: (value: string) => void
  onClear: () => void
}

const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "SCREENING",
  "SHORTLISTED",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
  "DISQUALIFIED",
  "ON_HOLD",
  "ARCHIVED",
]

const SOURCES = ["CAREERS_PAGE", "RECRUITER_CREATED", "REFERRAL", "LINKEDIN", "FACEBOOK", "JOB_BOARD", "AGENCY", "IMPORT", "EVENT", "INTERNAL", "OTHER"]

function labelFor(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

export function ApplicationFilters({ values, jobs, stages, onChange, onJobSearch, onClear }: ApplicationFiltersProps) {
  const [showMore, setShowMore] = React.useState(false)
  const hasFilters = Object.values(values).some(Boolean)

  const update = (key: keyof ApplicationFilterValues, value: string) => {
    const next = { ...values, [key]: value }
    if (key === "jobId") next.stageId = ""
    onChange(next)
  }

  return (
    <div className="space-y-3 border-b border-border p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(15rem,1fr)_11rem_11rem_auto]">
        <label className="relative block">
          <span className="sr-only">Search applications</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={values.search}
            onChange={(event) => update("search", event.target.value)}
            className="pl-9"
            placeholder="Search candidates or application numbers"
          />
        </label>
        <label className="relative block">
          <span className="sr-only">Find a job to filter applications</span>
          <Input
            value={values.jobSearch}
            onChange={(event) => {
              update("jobSearch", event.target.value)
              onJobSearch(event.target.value)
            }}
            placeholder="Find a job to filter"
          />
          {jobs.length > 0 && !values.jobId && (
            <select
              value=""
              onChange={(event) => update("jobId", event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-xs text-muted"
              aria-label="Choose a job"
            >
              <option value="">Choose a matching job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          )}
          {values.jobId && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-hover hover:text-foreground"
              onClick={() => onChange({ ...values, jobId: "", jobSearch: "", stageId: "" })}
              aria-label="Clear selected job"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <label>
          <span className="sr-only">Filter by application status</span>
          <select value={values.status} onChange={(event) => update("status", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground">
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{labelFor(status)}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by application source</span>
          <select value={values.source} onChange={(event) => update("source", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground">
            <option value="">All sources</option>
            {SOURCES.map((source) => <option key={source} value={source}>{labelFor(source)}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="button" size="icon" variant="outline" onClick={() => setShowMore((current) => !current)} aria-label="Toggle additional filters" aria-pressed={showMore}>
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          {hasFilters && (
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>
      {showMore && (
        <div className="grid gap-3 border-t border-border-subtle pt-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Pipeline stage</span>
            <select value={values.stageId} onChange={(event) => update("stageId", event.target.value)} disabled={!values.jobId} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <option value="">All stages</option>
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Submitted after</span>
            <Input type="date" value={values.submittedFrom} onChange={(event) => update("submittedFrom", event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Submitted before</span>
            <Input type="date" value={values.submittedTo} onChange={(event) => update("submittedTo", event.target.value)} />
          </label>
        </div>
      )}
    </div>
  )
}
