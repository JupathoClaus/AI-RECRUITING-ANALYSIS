"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import type { Candidate, CandidateStatus, Job } from "@/types"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn, getInitials, timeAgo } from "@/lib/utils"
import {
  Search,
  Plus,
  Users,
  Star,
  MoreHorizontal,
  Eye,
  Edit,
  Calendar,
  X,
  Phone,
  Mail,
  Briefcase,
  Brain,
  MessageSquare,
  FileText,
} from "lucide-react"

const statusConfig: Record<CandidateStatus, { label: string; variant: "default" | "success" | "warning" | "error" | "secondary" | "info" }> = {
  Applied: { label: "Applied", variant: "info" },
  Screening: { label: "Screening", variant: "warning" },
  Interview: { label: "Interview", variant: "default" },
  Offer: { label: "Offer", variant: "success" },
  Hired: { label: "Hired", variant: "success" },
  Rejected: { label: "Rejected", variant: "error" },
}

const candidateStatuses: CandidateStatus[] = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            "transition-colors",
            onChange ? "cursor-pointer hover:text-warning" : "cursor-default",
            i < rating ? "text-warning" : "text-muted"
          )}
          onClick={() => onChange?.(i + 1)}
        >
          <Star className={cn("h-4 w-4", i < rating && "fill-current")} />
        </button>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

export default function CandidatesPage() {
  const { candidates, jobs, addCandidate, updateCandidateStatus } = useStore()
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [jobFilter, setJobFilter] = React.useState<string>("all")
  const [ratingFilter, setRatingFilter] = React.useState<string>("all")
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [detailsCandidate, setDetailsCandidate] = React.useState<Candidate | null>(null)

  const [newCandidate, setNewCandidate] = React.useState({
    name: "",
    email: "",
    phone: "",
    jobId: "",
    experience: "",
    skills: "",
    rating: 0,
    notes: "",
  })

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  const filteredCandidates = React.useMemo(() => {
    return candidates.filter((candidate) => {
      const matchesSearch =
        searchQuery === "" ||
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.jobTitle.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === "all" || candidate.status === statusFilter
      const matchesJob = jobFilter === "all" || candidate.jobId === jobFilter
      const matchesRating =
        ratingFilter === "all" ||
        (ratingFilter === "5" && candidate.rating === 5) ||
        (ratingFilter === "4+" && candidate.rating >= 4) ||
        (ratingFilter === "3+" && candidate.rating >= 3) ||
        (ratingFilter === "unrated" && candidate.rating === 0)
      return matchesSearch && matchesStatus && matchesJob && matchesRating
    })
  }, [candidates, searchQuery, statusFilter, jobFilter, ratingFilter])

  const handleAddCandidate = () => {
    if (!newCandidate.name || !newCandidate.email || !newCandidate.jobId) return
    const job = jobs.find((j) => j.id === newCandidate.jobId)
    addCandidate({
      name: newCandidate.name,
      email: newCandidate.email,
      phone: newCandidate.phone,
      jobId: newCandidate.jobId,
      jobTitle: job?.title || "",
      experience: Number(newCandidate.experience) || 0,
      skills: newCandidate.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      aiScore: 0,
      rating: newCandidate.rating,
      status: "Applied",
      notes: newCandidate.notes,
    })
    setAddDialogOpen(false)
    setNewCandidate({ name: "", email: "", phone: "", jobId: "", experience: "", skills: "", rating: 0, notes: "" })
  }

  return (
    <AppLayout
      title="Candidates"
      description={`${filteredCandidates.length} candidates · ${candidates.filter((c) => c.status === "Applied").length} new · ${candidates.filter((c) => c.status === "Interview").length} in pipeline`}
      actions={
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Candidate
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Candidate</DialogTitle>
              <DialogDescription>Add a candidate to your talent pool.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Full Name *</label>
                  <Input
                    placeholder="e.g. John Smith"
                    value={newCandidate.name}
                    onChange={(e) => setNewCandidate((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email *</label>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    value={newCandidate.email}
                    onChange={(e) => setNewCandidate((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Phone</label>
                  <Input
                    type="tel"
                    placeholder="+1 555-0100"
                    value={newCandidate.phone}
                    onChange={(e) => setNewCandidate((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Years of Experience</label>
                  <Input
                    type="number"
                    placeholder="5"
                    min={0}
                    value={newCandidate.experience}
                    onChange={(e) => setNewCandidate((p) => ({ ...p, experience: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Applying For *</label>
                <Select value={newCandidate.jobId} onValueChange={(v) => setNewCandidate((p) => ({ ...p, jobId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a position" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.filter((j) => j.status === "Active").map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Skills (comma-separated)</label>
                <Input
                  placeholder="React, TypeScript, Node.js"
                  value={newCandidate.skills}
                  onChange={(e) => setNewCandidate((p) => ({ ...p, skills: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Rating</label>
                <StarRating
                  rating={newCandidate.rating}
                  onChange={(r) => setNewCandidate((p) => ({ ...p, rating: r }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Notes</label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  placeholder="Any notes about this candidate..."
                  value={newCandidate.notes}
                  onChange={(e) => setNewCandidate((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleAddCandidate}
                disabled={!newCandidate.name || !newCandidate.email || !newCandidate.jobId}
              >
                <Plus className="h-4 w-4" />
                Add Candidate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Search candidates by name, email, or position..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {candidateStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4+">4+ Stars</SelectItem>
                <SelectItem value="3+">3+ Stars</SelectItem>
                <SelectItem value="unrated">Unrated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Candidates Table */}
      <div className="animate-fade-in">
        {isLoading ? (
          <Card>
            <TableSkeleton />
          </Card>
        ) : filteredCandidates.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-muted" />}
            title="No candidates found"
            description={
              searchQuery || statusFilter !== "all" || jobFilter !== "all" || ratingFilter !== "all"
                ? "Try adjusting your filters to see more results."
                : "Start building your talent pool by adding candidates."
            }
            action={
              searchQuery || statusFilter !== "all" || jobFilter !== "all" || ratingFilter !== "all" ? (
                <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setJobFilter("all"); setRatingFilter("all") }}>
                  Clear Filters
                </Button>
              ) : (
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Candidate
                </Button>
              )
            }
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="hidden md:table-cell">Position</TableHead>
                    <TableHead className="hidden lg:table-cell">Experience</TableHead>
                    <TableHead>AI Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Rating</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => (
                    <TableRow
                      key={candidate.id}
                      className="cursor-pointer"
                      onClick={() => setDetailsCandidate(candidate)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9" fallback={getInitials(candidate.name)}>
                            {candidate.avatar && <AvatarImage src={candidate.avatar} alt={candidate.name} />}
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{candidate.name}</p>
                            <p className="text-xs text-muted truncate">{candidate.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
                        {candidate.jobTitle}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {candidate.experience} yr{candidate.experience !== 1 ? "s" : ""}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress
                            value={candidate.aiScore}
                            className="h-1.5 flex-1"
                            indicatorClassName={cn(
                              candidate.aiScore >= 80 ? "bg-success" :
                              candidate.aiScore >= 60 ? "bg-warning" :
                              candidate.aiScore > 0 ? "bg-error" : ""
                            )}
                          />
                          <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                            {candidate.aiScore || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[candidate.status].variant} className="text-xs">
                          {statusConfig[candidate.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StarRating rating={candidate.rating} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetailsCandidate(candidate) }}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Calendar className="h-4 w-4 mr-2" />
                              Schedule Interview
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-error"
                              onClick={(e) => { e.stopPropagation(); updateCandidateStatus(candidate.id, "Rejected") }}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>

      {/* Candidate Details Dialog */}
      <Dialog open={!!detailsCandidate} onOpenChange={(open) => !open && setDetailsCandidate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailsCandidate && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 shrink-0" fallback={getInitials(detailsCandidate.name)}>
                    {detailsCandidate.avatar && <AvatarImage src={detailsCandidate.avatar} alt={detailsCandidate.name} />}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl">{detailsCandidate.name}</DialogTitle>
                    <DialogDescription className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {detailsCandidate.email}
                      </span>
                      {detailsCandidate.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {detailsCandidate.phone}
                        </span>
                      )}
                    </DialogDescription>
                  </div>
                  <Badge variant={statusConfig[detailsCandidate.status].variant} className="shrink-0">
                    {statusConfig[detailsCandidate.status].label}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-xs text-muted mb-1">Experience</p>
                    <p className="text-lg font-semibold text-foreground">{detailsCandidate.experience}<span className="text-sm font-normal text-muted ml-0.5">yr</span></p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-xs text-muted mb-1">AI Score</p>
                    <p className={cn(
                      "text-lg font-semibold",
                      detailsCandidate.aiScore >= 80 ? "text-success" :
                      detailsCandidate.aiScore >= 60 ? "text-warning" :
                      "text-foreground"
                    )}>
                      {detailsCandidate.aiScore || "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-xs text-muted mb-1">Rating</p>
                    <div className="flex justify-center mt-1">
                      <StarRating rating={detailsCandidate.rating} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-center">
                    <p className="text-xs text-muted mb-1">Applied</p>
                    <p className="text-sm font-medium text-foreground">{timeAgo(detailsCandidate.appliedAt)}</p>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="h-4 w-4 text-muted" />
                    <h4 className="text-sm font-medium text-foreground">Position</h4>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">{detailsCandidate.jobTitle}</p>
                </div>

                <Separator />

                {/* Skills */}
                {detailsCandidate.skills.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Skills</h4>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-6">
                      {detailsCandidate.skills.map((skill) => (
                        <Badge key={skill} variant="outline">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Score Detail */}
                {detailsCandidate.aiScore > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">AI Score</h4>
                    </div>
                    <div className="ml-6 space-y-2">
                      <div className="flex items-center gap-3">
                        <Progress
                          value={detailsCandidate.aiScore}
                          className="h-2.5 flex-1"
                          indicatorClassName={cn(
                            detailsCandidate.aiScore >= 80 ? "bg-success" :
                            detailsCandidate.aiScore >= 60 ? "bg-warning" :
                            "bg-error"
                          )}
                        />
                        <span className="text-sm font-semibold text-foreground w-10 text-right">
                          {detailsCandidate.aiScore}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {detailsCandidate.aiScore >= 80
                          ? "Excellent match — strong technical and cultural fit signals."
                          : detailsCandidate.aiScore >= 60
                          ? "Good match — meets core requirements with some gaps."
                          : "Moderate match — may need further evaluation."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {detailsCandidate.notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-muted" />
                      <h4 className="text-sm font-medium text-foreground">Notes</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed ml-6 whitespace-pre-wrap">{detailsCandidate.notes}</p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <div className="flex items-center gap-2 w-full flex-wrap">
                  {detailsCandidate.status !== "Rejected" && detailsCandidate.status !== "Hired" && (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => { updateCandidateStatus(detailsCandidate.id, "Rejected"); setDetailsCandidate(null) }}
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                      {detailsCandidate.status === "Applied" && (
                        <Button
                          size="sm"
                          onClick={() => { updateCandidateStatus(detailsCandidate.id, "Screening"); setDetailsCandidate(null) }}
                        >
                          <Search className="h-4 w-4" />
                          Start Screening
                        </Button>
                      )}
                      {detailsCandidate.status === "Screening" && (
                        <Button
                          size="sm"
                          onClick={() => { updateCandidateStatus(detailsCandidate.id, "Interview"); setDetailsCandidate(null) }}
                        >
                          <Calendar className="h-4 w-4" />
                          Move to Interview
                        </Button>
                      )}
                      {detailsCandidate.status === "Interview" && (
                        <Button
                          size="sm"
                          onClick={() => { updateCandidateStatus(detailsCandidate.id, "Offer"); setDetailsCandidate(null) }}
                        >
                          <MessageSquare className="h-4 w-4" />
                          Extend Offer
                        </Button>
                      )}
                    </>
                  )}
                  {detailsCandidate.status === "Offer" && (
                    <Button
                      size="sm"
                      onClick={() => { updateCandidateStatus(detailsCandidate.id, "Hired"); setDetailsCandidate(null) }}
                    >
                      <Users className="h-4 w-4" />
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
