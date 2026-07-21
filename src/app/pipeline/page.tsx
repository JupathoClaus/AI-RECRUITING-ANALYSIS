"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import type { Candidate, CandidateStatus } from "@/types"
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
} from "iconsax-react"

interface PipelineStage {
  id: CandidateStatus
  label: string
  color: string
  colorClass: string
  bgClass: string
  textClass: string
  borderClass: string
}

const pipelineStages: PipelineStage[] = [
  {
    id: "Applied",
    label: "Applied",
    color: "#6366f1",
    colorClass: "bg-indigo-500",
    bgClass: "bg-indigo-500/10",
    textClass: "text-indigo-400",
    borderClass: "border-t-indigo-500",
  },
  {
    id: "Screening",
    label: "Screening",
    color: "#f59e0b",
    colorClass: "bg-amber-500",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-400",
    borderClass: "border-t-amber-500",
  },
  {
    id: "Interview",
    label: "Interview",
    color: "#8b5cf6",
    colorClass: "bg-violet-500",
    bgClass: "bg-violet-500/10",
    textClass: "text-violet-400",
    borderClass: "border-t-violet-500",
  },
  {
    id: "Offer",
    label: "Offer",
    color: "#10b981",
    colorClass: "bg-emerald-500",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-400",
    borderClass: "border-t-emerald-500",
  },
  {
    id: "Hired",
    label: "Hired",
    color: "#22c55e",
    colorClass: "bg-green-500",
    bgClass: "bg-green-500/10",
    textClass: "text-green-400",
    borderClass: "border-t-green-500",
  },
  {
    id: "Rejected",
    label: "Rejected",
    color: "#ef4444",
    colorClass: "bg-red-500",
    bgClass: "bg-red-500/10",
    textClass: "text-red-400",
    borderClass: "border-t-red-500",
  },
]

const statusBadgeVariant: Record<CandidateStatus, "default" | "success" | "warning" | "error" | "secondary" | "info"> = {
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
  onMove,
  onOpenDetail,
}: {
  candidate: Candidate
  stageIndex: number
  onMove: (candidateId: Candidate, direction: "left" | "right") => void
  onOpenDetail: (candidate: Candidate) => void
}) {
  return (
    <div
      className="group rounded-lg border border-border bg-surface-elevated p-3 transition-all duration-200 hover:border-primary/30 hover:shadow-md cursor-pointer"
      onClick={() => onOpenDetail(candidate)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0" fallback={getInitials(candidate.name)}>
          {candidate.avatar && <AvatarImage src={candidate.avatar} alt={candidate.name} />}
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
          <p className="text-xs text-muted truncate mt-0.5">{candidate.jobTitle}</p>
        </div>
        {candidate.aiScore > 0 && (
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", getScoreBg(candidate.aiScore))}>
            {candidate.aiScore}
          </span>
        )}
      </div>

      {candidate.skills.length > 0 && (
        <div className="flex gap-1 mt-2.5 flex-wrap">
          {candidate.skills.slice(0, 2).map((skill) => (
            <span
              key={skill}
              className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium"
            >
              {skill}
            </span>
          ))}
          {candidate.skills.length > 2 && (
            <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted font-medium">
              +{candidate.skills.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
        <span className="text-[10px] text-muted">{timeAgo(candidate.appliedAt)}</span>
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
            disabled={stageIndex >= pipelineStages.length - 1}
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
  const { candidates, jobs, updateCandidateStatus } = useStore()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [jobFilter, setJobFilter] = React.useState<string>("all")
  const [selectedCandidate, setSelectedCandidate] = React.useState<Candidate | null>(null)

  const filteredCandidates = React.useMemo(() => {
    return candidates.filter((candidate) => {
      const matchesSearch =
        searchQuery === "" ||
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.email.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesJob = jobFilter === "all" || candidate.jobId === jobFilter
      return matchesSearch && matchesJob
    })
  }, [candidates, searchQuery, jobFilter])

  const stageCandidates = React.useMemo(() => {
    const map: Record<CandidateStatus, Candidate[]> = {
      Applied: [],
      Screening: [],
      Interview: [],
      Offer: [],
      Hired: [],
      Rejected: [],
    }
    for (const c of filteredCandidates) {
      map[c.status].push(c)
    }
    return map
  }, [filteredCandidates])

  const handleMove = React.useCallback(
    (candidate: Candidate, direction: "left" | "right") => {
      const stageOrder: CandidateStatus[] = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]
      const currentIdx = stageOrder.indexOf(candidate.status)
      if (direction === "right" && currentIdx < stageOrder.length - 1) {
        updateCandidateStatus(candidate.id, stageOrder[currentIdx + 1])
      } else if (direction === "left" && currentIdx > 0) {
        updateCandidateStatus(candidate.id, stageOrder[currentIdx - 1])
      }
    },
    [updateCandidateStatus]
  )

  const totalCandidates = filteredCandidates.length
  const inPipeline = filteredCandidates.filter(
    (c) => c.status !== "Hired" && c.status !== "Rejected"
  ).length

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
          <Select value={jobFilter} onValueChange={setJobFilter}>
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
      </div>

      <div className="animate-fade-in">
        {totalCandidates === 0 ? (
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
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory">
            {pipelineStages.map((stage, stageIdx) => {
              const stageCands = stageCandidates[stage.id]
              return (
                <div
                  key={stage.id}
                  className={cn(
                    "flex-shrink-0 w-[290px] flex flex-col rounded-xl border border-border bg-background overflow-hidden snap-start",
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
          {selectedCandidate && (
            <>
              <ModalHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 shrink-0" fallback={getInitials(selectedCandidate.name)}>
                    {selectedCandidate.avatar && <AvatarImage src={selectedCandidate.avatar} alt={selectedCandidate.name} />}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl">{selectedCandidate.name}</DialogTitle>
                    <DialogDescription className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Message className="h-3 w-3" />
                        {selectedCandidate.email}
                      </span>
                      {selectedCandidate.phone && (
                        <span className="flex items-center gap-1">
                          <Call className="h-3 w-3" />
                          {selectedCandidate.phone}
                        </span>
                      )}
                    </DialogDescription>
                  </div>
                  <Badge variant={statusBadgeVariant[selectedCandidate.status]} className="shrink-0">
                    {selectedCandidate.status}
                  </Badge>
                </div>
              </ModalHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border bg-surface p-3 text-center">
                    <p className="text-xs text-muted mb-1">Experience</p>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedCandidate.experience}
                      <span className="text-sm font-normal text-muted ml-0.5">yr</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3 text-center">
                    <p className="text-xs text-muted mb-1">AI Score</p>
                    <p className={cn("text-lg font-semibold", getScoreColor(selectedCandidate.aiScore))}>
                      {selectedCandidate.aiScore || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3 text-center">
                    <p className="text-xs text-muted mb-1">Rating</p>
                    <div className="flex justify-center mt-1 gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star1
                          key={i}
                          className={cn(
                            "h-3.5 w-3.5",
                            i < selectedCandidate.rating ? "text-amber-400 fill-amber-400" : "text-muted"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3 text-center">
                    <p className="text-xs text-muted mb-1">Applied</p>
                    <p className="text-sm font-medium text-foreground">{timeAgo(selectedCandidate.appliedAt)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="h-4 w-4 text-muted" />
                    <h4 className="text-sm font-medium text-foreground">Position</h4>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">{selectedCandidate.jobTitle}</p>
                </div>

                <Separator />

                {selectedCandidate.skills.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MagicStar className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Skills</h4>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-6">
                      {selectedCandidate.skills.map((skill) => (
                        <Badge key={skill} variant="outline">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCandidate.aiScore > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MagicStar className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">AI Assessment</h4>
                    </div>
                    <div className="ml-6">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedCandidate.aiScore >= 80
                          ? "Excellent match — strong technical and cultural fit signals."
                          : selectedCandidate.aiScore >= 60
                          ? "Good match — meets core requirements with some gaps."
                          : "Moderate match — may need further evaluation."}
                      </p>
                    </div>
                  </div>
                )}

                {selectedCandidate.notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Document className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Notes</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed ml-6 whitespace-pre-wrap">
                      {selectedCandidate.notes}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <div className="flex items-center gap-2 w-full flex-wrap">
                  {selectedCandidate.status !== "Rejected" && selectedCandidate.status !== "Hired" && (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          updateCandidateStatus(selectedCandidate.id, "Rejected")
                          setSelectedCandidate(null)
                        }}
                      >
                        <CloseSquare className="h-4 w-4" />
                        Reject
                      </Button>
                      {selectedCandidate.status === "Applied" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateCandidateStatus(selectedCandidate.id, "Screening")
                            setSelectedCandidate(null)
                          }}
                        >
                          <SearchNormal className="h-4 w-4" />
                          Start Screening
                        </Button>
                      )}
                      {selectedCandidate.status === "Screening" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateCandidateStatus(selectedCandidate.id, "Interview")
                            setSelectedCandidate(null)
                          }}
                        >
                          <Calendar className="h-4 w-4" />
                          Move to Interview
                        </Button>
                      )}
                      {selectedCandidate.status === "Interview" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            updateCandidateStatus(selectedCandidate.id, "Offer")
                            setSelectedCandidate(null)
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                          Extend Offer
                        </Button>
                      )}
                    </>
                  )}
                  {selectedCandidate.status === "Offer" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        updateCandidateStatus(selectedCandidate.id, "Hired")
                        setSelectedCandidate(null)
                      }}
                    >
                      <People className="h-4 w-4" />
                      Mark as Hired
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
