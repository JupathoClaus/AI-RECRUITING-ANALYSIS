"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import type { Candidate, DisplayApplicationStatus } from "@/types"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/ui/empty-state"
import { cn, getInitials, timeAgo } from "@/lib/utils"
import { getJobPipeline, createPipelineStage, updatePipelineStage, deletePipelineStage, reorderPipelineStages } from "@/lib/api/jobs.api"
import { rejectApplication, moveApplication } from "@/lib/api/applications.api"
import type { PipelineStageDto, JobPipelineDto } from "@/lib/api/jobs.api"
import {
  SearchNormal,
  People,
  Briefcase,
  MagicStar,
  Star1,
  Message,
  Call,
  Document,
  ArrowLeft,
  ArrowRight,
  CloseSquare,
  Calendar,
  MessageSquare,
  Add,
  Trash,
  Edit2,
  TickCircle,
} from "iconsax-react"

function getDisplayStatus(c: Candidate): DisplayApplicationStatus | undefined {
  return c.applicationSummary?.current?.displayStatus
}

function getJobTitle(c: Candidate): string {
  return c.applicationSummary?.current?.jobTitle || c.currentJobTitle || ""
}

function getAppliedAt(c: Candidate): Date | undefined {
  return c.applicationSummary?.current?.createdAt
}

function getRating(c: Candidate): number {
  return c.companyProfile?.rating ?? 0
}

function getSkillNames(c: Candidate): string[] {
  return c.skills.map((s) => s.name).filter(Boolean)
}

interface PipelineStage {
  id: string
  label: string
  color: string
  colorClass: string
  bgClass: string
  textClass: string
  borderClass: string
}

const DEFAULT_STAGE_COLORS = [
  { colorClass: "bg-indigo-500", bgClass: "bg-indigo-500/10", textClass: "text-indigo-400", borderClass: "border-t-indigo-500" },
  { colorClass: "bg-amber-500", bgClass: "bg-amber-500/10", textClass: "text-amber-400", borderClass: "border-t-amber-500" },
  { colorClass: "bg-violet-500", bgClass: "bg-violet-500/10", textClass: "text-violet-400", borderClass: "border-t-violet-500" },
  { colorClass: "bg-emerald-500", bgClass: "bg-emerald-500/10", textClass: "text-emerald-400", borderClass: "border-t-emerald-500" },
  { colorClass: "bg-green-500", bgClass: "bg-green-500/10", textClass: "text-green-400", borderClass: "border-t-green-500" },
  { colorClass: "bg-red-500", bgClass: "bg-red-500/10", textClass: "text-red-400", borderClass: "border-t-red-500" },
  { colorClass: "bg-cyan-500", bgClass: "bg-cyan-500/10", textClass: "text-cyan-400", borderClass: "border-t-cyan-500" },
  { colorClass: "bg-orange-500", bgClass: "bg-orange-500/10", textClass: "text-orange-400", borderClass: "border-t-orange-500" },
  { colorClass: "bg-pink-500", bgClass: "bg-pink-500/10", textClass: "text-pink-400", borderClass: "border-t-pink-500" },
  { colorClass: "bg-teal-500", bgClass: "bg-teal-500/10", textClass: "text-teal-400", borderClass: "border-t-teal-500" },
]

function mapStageToPipeline(stage: PipelineStageDto, idx: number): PipelineStage {
  const c = DEFAULT_STAGE_COLORS[idx % DEFAULT_STAGE_COLORS.length]
  return {
    id: stage.id,
    label: stage.name,
    color: `#${c.colorClass.replace('bg-', '')}`,
    colorClass: c.colorClass,
    bgClass: c.bgClass,
    textClass: c.textClass,
    borderClass: c.borderClass,
  }
}

let defaultPipeline: PipelineStage[] = []

const statusBadgeVariant: Record<string, "default" | "success" | "warning" | "error" | "secondary" | "info"> = {
  Applied: "info",
  Screening: "warning",
  Interview: "default",
  Offer: "success",
  Hired: "success",
  Rejected: "error",
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-success"
  if (score >= 60) return "text-warning"
  return "text-error"
}

function getScoreBg(score: number) {
  if (score >= 80) return "bg-success-muted text-success"
  if (score >= 60) return "bg-warning-muted text-warning"
  return "bg-error-muted text-error"
}

function CandidateCard({
  candidate,
  stageIndex,
  stageCount,
  onMove,
  onOpenDetail,
}: {
  candidate: Candidate
  stageIndex: number
  stageCount: number
  onMove: (candidateId: Candidate, direction: "left" | "right") => void
  onOpenDetail: (candidate: Candidate) => void
}) {
  const skillNames = getSkillNames(candidate)
  return (
    <div
      className="group rounded-lg bg-surface-elevated p-3 transition-all duration-200 hover:border-primary/30 hover:shadow-md cursor-pointer"
      onClick={() => onOpenDetail(candidate)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0" fallback={getInitials(candidate.displayName)}>
          {candidate.avatar && <AvatarImage src={candidate.avatar} alt={candidate.displayName} />}
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{candidate.displayName}</p>
          <p className="text-xs text-muted truncate mt-0.5">{getJobTitle(candidate)}</p>
        </div>
        {candidate.aiScore > 0 && (
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", getScoreBg(candidate.aiScore))}>
            {candidate.aiScore}
          </span>
        )}
      </div>

      {skillNames.length > 0 && (
        <div className="flex gap-1 mt-2.5 flex-wrap">
          {skillNames.slice(0, 2).map((skill) => (
            <span
              key={skill}
              className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium"
            >
              {skill}
            </span>
          ))}
          {skillNames.length > 2 && (
            <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted font-medium">
              +{skillNames.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
        <span className="text-[10px] text-muted">{getAppliedAt(candidate) ? timeAgo(getAppliedAt(candidate)!) : "—"}</span>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted hover:text-foreground hover:bg-surface-hover opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={stageIndex <= 0}
            onClick={() => onMove(candidate, "left")}
          >
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-muted hover:text-foreground hover:bg-surface-hover opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={stageIndex >= stageCount - 1}
            onClick={() => onMove(candidate, "right")}
          >
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const { candidates, jobs, candidatesError } = useStore()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [jobFilter, setJobFilter] = React.useState<string>("all")
  const [selectedCandidate, setSelectedCandidate] = React.useState<Candidate | null>(null)
  const [pipeline, setPipeline] = React.useState<JobPipelineDto | null>(null)
  const [stages, setStages] = React.useState<PipelineStage[]>([])
  const [pipelineLoading, setPipelineLoading] = React.useState(false)

  const [showStageDialog, setShowStageDialog] = React.useState(false)
  const [editingStage, setEditingStage] = React.useState<PipelineStageDto | null>(null)
  const [stageForm, setStageForm] = React.useState({ name: "", description: "" })
  const [stageSaving, setStageSaving] = React.useState(false)

  React.useEffect(() => {
    if (jobFilter && jobFilter !== "all") {
      setPipelineLoading(true)
      getJobPipeline(jobFilter).then((p) => {
        setPipeline(p)
        setStages((p.stages || []).sort((a, b) => a.sortOrder - b.sortOrder).map((s, i) => mapStageToPipeline(s, i)))
      }).catch(() => {
        setPipeline(null)
        setStages([])
      }).finally(() => setPipelineLoading(false))
    } else {
      setPipeline(null)
      setStages([])
    }
  }, [jobFilter])

  const filteredCandidates = React.useMemo(() => {
    return candidates.filter((candidate) => {
      const matchesSearch =
        searchQuery === "" ||
        candidate.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getJobTitle(candidate).toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.email.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesJob = jobFilter === "all" || candidate.applicationSummary?.current?.jobId === jobFilter
      return matchesSearch && matchesJob
    })
  }, [candidates, searchQuery, jobFilter])

  const stageCandidates = React.useMemo(() => {
    const map: Record<string, Candidate[]> = {}
    for (const stage of stages) {
      map[stage.id] = []
    }
    for (const c of filteredCandidates) {
      const stageId = c.applicationSummary?.current?.stageId
      if (stageId && map[stageId]) {
        map[stageId].push(c)
      }
    }
    return map as Record<string, Candidate[]>
  }, [filteredCandidates, stages])

  const handleMove = React.useCallback(
    async (candidate: Candidate, direction: "left" | "right") => {
      const currentApp = candidate.applicationSummary?.current
      if (!currentApp || !currentApp.stageId || !currentApp.id) return
      const stageOrder = stages.map((s) => s.id)
      if (stageOrder.length === 0) return
      const currentIdx = stageOrder.indexOf(currentApp.stageId)
      if (currentIdx < 0) return
      const targetIdx = direction === "right" ? currentIdx + 1 : currentIdx - 1
      if (targetIdx < 0 || targetIdx >= stageOrder.length) return
      await moveApplication(currentApp.id, { toStageId: stageOrder[targetIdx], expectedVersion: currentApp.version })
      setSelectedCandidate(null)
    },
    [stages]
  )

  const handleSaveStage = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pipeline || !jobFilter) return
    setStageSaving(true)
    try {
      if (editingStage) {
        await updatePipelineStage(jobFilter, editingStage.id, stageForm)
      } else {
        const maxOrder = pipeline.stages.reduce((max, s) => Math.max(max, s.sortOrder), -1)
        await createPipelineStage(jobFilter, { name: stageForm.name, description: stageForm.description || undefined, sortOrder: maxOrder + 1, type: "CUSTOM" })
      }
      const updated = await getJobPipeline(jobFilter)
      setPipeline(updated)
      setStages(updated.stages.sort((a, b) => a.sortOrder - b.sortOrder).map((s, i) => mapStageToPipeline(s, i)))
      setShowStageDialog(false)
      setEditingStage(null)
      setStageForm({ name: "", description: "" })
    } catch {
      // handled
    } finally {
      setStageSaving(false)
    }
  }, [pipeline, jobFilter, editingStage, stageForm])

  const handleDeleteStage = React.useCallback(async (stageId: string) => {
    if (!jobFilter) return
    try {
      await deletePipelineStage(jobFilter, stageId)
      const updated = await getJobPipeline(jobFilter)
      setPipeline(updated)
      setStages(updated.stages.sort((a, b) => a.sortOrder - b.sortOrder).map((s, i) => mapStageToPipeline(s, i)))
    } catch {
      // handled
    }
  }, [jobFilter])

  const totalCandidates = filteredCandidates.length
  const inPipeline = filteredCandidates.filter((c) => {
    const ds = getDisplayStatus(c)
    return ds && ds !== "Hired" && ds !== "Rejected"
  }).length

  return (
    <AppLayout
      title="Pipeline"
      description={`${totalCandidates} candidates · ${inPipeline} in active pipeline`}
    >
        <div className="flex flex-col gap-4 mb-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <SearchNormal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                placeholder="Search candidates by name, email, or position..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={jobFilter} onValueChange={(v) => { setJobFilter(v); setStages([]); setPipeline(null) }}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pipeline && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditingStage(null); setStageForm({ name: "", description: "" }); setShowStageDialog(true) }}>
                <Add className="h-4 w-4 mr-1" />
                Add Stage
              </Button>
              <span className="text-xs text-muted">{pipeline.stages.length} stages</span>
            </div>
          )}
        </div>

      {candidatesError && (
        <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error mb-6 animate-fade-in">
          {candidatesError}
        </div>
      )}

      <div className="animate-fade-in">
        {totalCandidates === 0 && jobFilter === "all" ? (
          <EmptyState
            icon={<People className="h-8 w-8 text-muted" />}
            title="No candidates in pipeline"
            description={
              searchQuery || jobFilter !== "all"
                ? "Try adjusting your filters to see more results."
                : "Start adding candidates to see them appear in the pipeline."
            }
            action={
              searchQuery || jobFilter !== "all" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("")
                    setJobFilter("all")
                  }}
                >
                  Clear Filters
                </Button>
              ) : undefined
            }
          />
        ) : pipelineLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted">Loading pipeline...</p>
          </div>
        ) : stages.length === 0 && jobFilter !== "all" ? (
          <EmptyState
            icon={<People className="h-8 w-8 text-muted" />}
            title="No pipeline stages"
            description="This job has no pipeline stages configured yet. Add a stage to get started."
            action={
              <Button size="sm" onClick={() => { setEditingStage(null); setStageForm({ name: "", description: "" }); setShowStageDialog(true) }}>
                <Add className="h-4 w-4 mr-1" />
                Add Stage
              </Button>
            }
          />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory">
            {stages.map((stage, stageIdx) => {
              const stageCands = stageCandidates[stage.id] || []
              return (
                <div
                  key={stage.id}
                  className={cn(
                    "flex-shrink-0 w-[290px] flex flex-col rounded-xl bg-background overflow-hidden snap-start",
                    "border-t-[3px]",
                    stage.borderClass
                  )}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-2.5 w-2.5 rounded-full", stage.colorClass)} />
                      <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
                      <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-surface-hover px-1.5 text-[10px] font-medium text-muted-foreground">
                        {stageCands.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        const dto = pipeline?.stages.find((s) => s.id === stage.id)
                        if (dto) { setEditingStage(dto); setStageForm({ name: dto.name, description: dto.description || "" }); setShowStageDialog(true) }
                      }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-error" onClick={() => handleDeleteStage(stage.id)}>
                        <Trash className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5 min-h-[120px] max-h-[calc(100vh-320px)] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {stageCands.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="h-10 w-10 rounded-full bg-surface-hover flex items-center justify-center mb-2">
                          <People className="h-4 w-4 text-muted" />
                        </div>
                        <p className="text-xs text-muted">No candidates</p>
                      </div>
                    ) : (
                      stageCands.map((candidate) => (
                        <CandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          stageIndex={stageIdx}
                          stageCount={stages.length}
                          onMove={handleMove}
                          onOpenDetail={setSelectedCandidate}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selectedCandidate} onOpenChange={(open) => !open && setSelectedCandidate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCandidate && (() => {
            const s = selectedCandidate
            const displayStatus = getDisplayStatus(s)
            const jobTitle = getJobTitle(s)
            const appliedAt = getAppliedAt(s)
            const rating = getRating(s)
            const skillNames = getSkillNames(s)
            return (
            <>
              <ModalHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 shrink-0" fallback={getInitials(s.displayName)}>
                    {s.avatar && <AvatarImage src={s.avatar} alt={s.displayName} />}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl">{s.displayName}</DialogTitle>
                    <DialogDescription className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Message className="h-3 w-3" />
                        {s.email}
                      </span>
                      {s.phone && (
                        <span className="flex items-center gap-1">
                          <Call className="h-3 w-3" />
                          {s.phone}
                        </span>
                      )}
                    </DialogDescription>
                  </div>
                  {displayStatus ? (
                    <Badge variant={statusBadgeVariant[displayStatus]} className="shrink-0">
                      {displayStatus}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-muted">Pool</Badge>
                  )}
                </div>
              </ModalHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Briefcase className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Experience</p>
                    </div>
                    <p className="text-lg font-semibold text-foreground">
                      {s.totalExperienceYears}
                      <span className="text-sm font-normal text-muted ml-0.5">yr</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <MagicStar className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">AI Score</p>
                    </div>
                    <p className={cn("text-lg font-semibold", getScoreColor(s.aiScore))}>
                      {s.aiScore || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Star1 className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Rating</p>
                    </div>
                    <div className="flex justify-center mt-1 gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star1
                          key={i}
                          className={cn(
                            "h-3.5 w-3.5",
                            i < rating ? "text-amber-400 fill-amber-400" : "text-muted"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Calendar className="text-muted-foreground" size={14} />
                      <p className="text-xs text-muted">Applied</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{appliedAt ? timeAgo(appliedAt) : "—"}</p>
                  </div>
                </div>

                {jobTitle && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Position</h4>
                    </div>
                    <p className="text-sm text-muted-foreground ml-6">{jobTitle}</p>
                  </div>
                )}

                <Separator />

                {skillNames.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MagicStar className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Skills</h4>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-6">
                      {skillNames.map((skill) => (
                        <Badge key={skill} variant="outline">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {s.aiScore > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MagicStar className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">AI Assessment</h4>
                    </div>
                    <div className="ml-6">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {s.aiScore >= 80
                          ? "Excellent match — strong technical and cultural fit signals."
                          : s.aiScore >= 60
                          ? "Good match — meets core requirements with some gaps."
                          : "Moderate match — may need further evaluation."}
                      </p>
                    </div>
                  </div>
                )}

                {s.notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Document className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Notes</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed ml-6 whitespace-pre-wrap">
                      {s.notes}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <div className="flex items-center gap-2 w-full flex-wrap">
                  {(() => {
                    const currentApp = s.applicationSummary?.current
                    if (!currentApp || !currentApp.stageId || displayStatus === "Hired") return null
                    const idx = stages.findIndex((st) => st.id === currentApp.stageId)
                    return (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            await rejectApplication(currentApp.id, { expectedVersion: currentApp.version })
                            setSelectedCandidate(null)
                          }}
                        >
                          <CloseSquare className="h-4 w-4" />
                          Reject
                        </Button>
                        {idx >= 0 && idx < stages.length - 1 && (
                          <Button size="sm" onClick={async () => {
                            await moveApplication(currentApp.id, { toStageId: stages[idx + 1].id, expectedVersion: currentApp.version })
                            setSelectedCandidate(null)
                          }}>
                            <ArrowRight className="h-4 w-4" />
                            Move to {stages[idx + 1].label}
                          </Button>
                        )}
                      </>
                    )
                  })()}
                </div>
              </DialogFooter>
            </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Stage Management Dialog */}
      <Dialog open={showStageDialog} onOpenChange={(open) => { if (!open) { setShowStageDialog(false); setEditingStage(null); setStageForm({ name: "", description: "" }) } }}>
        <DialogContent className="max-w-md">
          <ModalHeader>
            <DialogTitle>{editingStage ? "Edit Stage" : "Add Stage"}</DialogTitle>
            <DialogDescription>
              {editingStage ? "Update the pipeline stage details." : "Create a new stage for this job pipeline."}
            </DialogDescription>
          </ModalHeader>
          <form onSubmit={handleSaveStage} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Stage Name *</label>
              <Input
                placeholder="e.g. Phone Screen"
                value={stageForm.name}
                onChange={(e) => setStageForm((f) => ({ ...f, name: e.target.value }))}
                required
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                placeholder="Optional description for this stage"
                value={stageForm.description}
                onChange={(e) => setStageForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowStageDialog(false); setEditingStage(null); setStageForm({ name: "", description: "" }) }}>Cancel</Button>
              <Button type="submit" disabled={stageSaving}>{stageSaving ? "Saving..." : editingStage ? "Save Changes" : "Add Stage"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
