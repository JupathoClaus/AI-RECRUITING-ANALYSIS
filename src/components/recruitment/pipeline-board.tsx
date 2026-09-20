"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { ApplicationStatusBadge, formatStatusLabel } from "@/components/recruitment/status-badge"
import { Badge } from "@/components/ui/badge"
import { fetchApplications, moveApplication, type ApplicationListResponse } from "@/lib/api/applications.api"
import type { PipelineStageDto } from "@/lib/api/jobs.api"

interface PipelineBoardProps {
  jobId: string
  stages: PipelineStageDto[]
}

interface StageData {
  response?: ApplicationListResponse
  error?: string
}

function applicationName(application: NonNullable<ApplicationListResponse["data"]>[number]) {
  return application.candidate?.displayName
    || [application.candidate?.firstName, application.candidate?.lastName].filter(Boolean).join(" ")
    || "Candidate unavailable"
}

export function PipelineBoard({ jobId, stages }: PipelineBoardProps) {
  const [columns, setColumns] = React.useState<Record<string, StageData>>({})
  const [loading, setLoading] = React.useState(true)
  const [movingId, setMovingId] = React.useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)

    Promise.all(stages.map(async (stage) => {
      try {
        const response = await fetchApplications({
          page: 1,
          limit: 6,
          jobId: [jobId],
          stageId: [stage.id],
          sortBy: "updatedAt",
          sortOrder: "desc",
        })
        return [stage.id, { response }] as const
      } catch (error) {
        return [stage.id, { error: error instanceof Error ? error.message : "Applications could not be loaded." }] as const
      }
    })).then((entries) => {
      if (!active) return
      setColumns(Object.fromEntries(entries))
      setLoading(false)
    })

    return () => { active = false }
  }, [jobId, refreshNonce, stages])

  const moveToStage = async (applicationId: string, version: number, targetStageId: string) => {
    if (!targetStageId) return
    setMovingId(applicationId)
    try {
      await moveApplication(applicationId, { expectedVersion: version, toStageId: targetStageId })
      setRefreshNonce((current) => current + 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : "This application could not be moved."
      setColumns((current) => ({
        ...current,
        [targetStageId]: { ...current[targetStageId], error: message },
      }))
    } finally {
      setMovingId(null)
    }
  }

  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        This job does not have an active pipeline configuration.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-max grid-flow-col auto-cols-[18rem] gap-4">
        {stages.map((stage) => {
          const column = columns[stage.id]
          const applications = column?.response?.data || []
          const total = column?.response?.meta.total || 0

          return (
            <section key={stage.id} className="rounded-xl border border-border bg-surface-elevated p-3" aria-label={`${stage.name} pipeline stage`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">{formatStatusLabel(stage.type)}</p>
                </div>
                <Badge variant="secondary">{loading ? "…" : total}</Badge>
              </div>

              {column?.error && <p className="mb-3 rounded-md bg-error-muted p-2 text-xs text-error">{column.error}</p>}

              <div className="space-y-2">
                {loading && Array.from({ length: 3 }, (_, index) => <div key={index} className="skeleton h-28 rounded-lg" />)}
                {!loading && applications.map((application) => {
                  const name = applicationName(application)
                  const isMoving = movingId === application.id

                  return (
                    <article key={application.id} className="rounded-lg border border-border bg-surface p-3 shadow-xs">
                      <Link href={`/applications/${application.id}`} className="block font-medium text-foreground hover:underline">
                        {name}
                      </Link>
                      <p className="mt-1 text-xs text-muted">Application #{application.applicationNumber}</p>
                      <div className="mt-3"><ApplicationStatusBadge status={application.status} /></div>
                      <label className="mt-3 block text-xs font-medium text-muted">
                        Move application
                        <select
                          value={stage.id}
                          onChange={(event) => moveToStage(application.id, application.version, event.target.value)}
                          disabled={isMoving}
                          className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-foreground disabled:cursor-wait disabled:opacity-60"
                          aria-label={`Move ${name} to another pipeline stage`}
                        >
                          {stages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </select>
                      </label>
                      {isMoving && <p className="mt-2 flex items-center gap-1 text-xs text-muted"><LoaderCircle className="h-3 w-3 animate-spin" /> Moving</p>}
                    </article>
                  )
                })}
                {!loading && applications.length === 0 && !column?.error && <p className="rounded-lg border border-dashed border-border bg-surface p-3 text-xs text-muted">No applications in this stage.</p>}
              </div>

              {!loading && total > applications.length && (
                <p className="mt-3 flex items-center gap-1 text-xs text-muted">Showing the latest {applications.length} of {total}. <ArrowRight className="h-3 w-3" /></p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
