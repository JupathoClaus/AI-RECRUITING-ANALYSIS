"use client"

import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApplicationStatusBadge } from "@/components/recruitment/status-badge"
import type { ApplicationListItem } from "@/lib/api/applications.api"

export type ApplicationSortField = "createdAt" | "submittedAt" | "updatedAt" | "applicationNumber" | "status"

interface ApplicationTableProps {
  applications: ApplicationListItem[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  sortBy?: ApplicationSortField
  sortOrder?: "asc" | "desc"
  onSort?: (field: ApplicationSortField) => void
  showJob?: boolean
}

function formatDate(value: string | null) {
  if (!value) return "Not submitted"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unavailable"
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date)
}

function formatSource(source: string) {
  return source
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function SortButton({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
}: {
  field: ApplicationSortField
  label: string
  sortBy?: ApplicationSortField
  sortOrder?: "asc" | "desc"
  onSort?: (field: ApplicationSortField) => void
}) {
  const isActive = sortBy === field
  const Icon = !isActive ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown

  if (!onSort) return <>{label}</>

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded text-left hover:text-foreground focus-visible:outline-none"
      onClick={() => onSort(field)}
      aria-label={`Sort by ${label}`}
      aria-pressed={isActive}
    >
      {label}
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

export function ApplicationTable({
  applications,
  selectedIds = [],
  onSelectionChange,
  sortBy,
  sortOrder,
  onSort,
  showJob = true,
}: ApplicationTableProps) {
  const selectedSet = new Set(selectedIds)
  const allSelected = applications.length > 0 && applications.every((application) => selectedSet.has(application.id))

  const setSelected = (applicationId: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) next.add(applicationId)
    else next.delete(applicationId)
    onSelectionChange?.([...next])
  }

  const setAllSelected = (checked: boolean) => {
    if (!checked) {
      onSelectionChange?.(selectedIds.filter((id) => !applications.some((application) => application.id === id)))
      return
    }

    onSelectionChange?.([...new Set([...selectedIds, ...applications.map((application) => application.id)])])
  }

  return (
    <Table aria-label="Applications">
      <TableHeader>
        <TableRow>
          {onSelectionChange && (
            <TableHead className="w-11">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => setAllSelected(checked === true)}
                aria-label="Select all applications on this page"
              />
            </TableHead>
          )}
          <TableHead>Candidate</TableHead>
          {showJob && <TableHead className="hidden xl:table-cell">Job</TableHead>}
          <TableHead><SortButton field="status" label="Status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></TableHead>
          <TableHead className="hidden lg:table-cell">Pipeline stage</TableHead>
          <TableHead className="hidden 2xl:table-cell">Source</TableHead>
          <TableHead className="hidden md:table-cell"><SortButton field="submittedAt" label="Submitted" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></TableHead>
          <TableHead className="w-14"><span className="sr-only">Open application</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.map((application) => {
          const candidateName = application.candidate?.displayName
            || [application.candidate?.firstName, application.candidate?.lastName].filter(Boolean).join(" ")
            || "Candidate unavailable"

          return (
            <TableRow key={application.id} data-state={selectedSet.has(application.id) ? "selected" : undefined}>
              {onSelectionChange && (
                <TableCell>
                  <Checkbox
                    checked={selectedSet.has(application.id)}
                    onCheckedChange={(checked) => setSelected(application.id, checked === true)}
                    aria-label={`Select ${candidateName}`}
                  />
                </TableCell>
              )}
              <TableCell>
                <div className="min-w-40">
                  {application.candidate ? (
                    <Link href={`/candidates/${application.candidate.id}`} className="font-medium text-foreground hover:underline">
                      {candidateName}
                    </Link>
                  ) : (
                    <p className="font-medium text-foreground">{candidateName}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">Application #{application.applicationNumber}</p>
                </div>
              </TableCell>
              {showJob && (
                <TableCell className="hidden xl:table-cell">
                  {application.job ? (
                    <Link href={`/jobs/${application.job.id}`} className="text-sm font-medium text-foreground hover:underline">
                      {application.job.title}
                    </Link>
                  ) : (
                    <span className="text-muted">Unavailable</span>
                  )}
                </TableCell>
              )}
              <TableCell><ApplicationStatusBadge status={application.status} /></TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{application.currentStage?.name || "Not assigned"}</span>
                  {application.activeFlags.length > 0 && (
                    <Badge variant="warning" title="Active application flags">
                      {application.activeFlags.length} flag{application.activeFlags.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden 2xl:table-cell text-sm text-muted">{formatSource(application.source)}</TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted">{formatDate(application.submittedAt || application.createdAt)}</TableCell>
              <TableCell>
                <Link
                  href={`/applications/${application.id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label={`Open application for ${candidateName}`}
                  title="Open application"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
