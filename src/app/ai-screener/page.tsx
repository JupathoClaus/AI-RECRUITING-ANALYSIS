"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn, getInitials } from "@/lib/utils"
import {
  Upload,
  FileText,
  Brain,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  MapPin,
  GraduationCap,
  Briefcase,
  Zap,
  RotateCcw,
  Eye,
  Download,
  Filter,
} from "lucide-react"

interface ScreenerCandidate {
  id: string
  name: string
  email: string
  jobTitle: string
  matchScore: number
  skills: string[]
  recommendation: "Strong Match" | "Good Match" | "Possible Match" | "Poor Match"
  status: "screening" | "complete"
  progress: number
  education: string
  experience: string
  location: string
}

const screenerCandidates: ScreenerCandidate[] = [
  {
    id: "sc1",
    name: "Rachel Foster",
    email: "rachel.f@email.com",
    jobTitle: "Senior Frontend Engineer",
    matchScore: 94,
    skills: ["React", "TypeScript", "Next.js", "GraphQL", "CSS-in-JS"],
    recommendation: "Strong Match",
    status: "complete",
    progress: 100,
    education: "M.S. Computer Science, Stanford",
    experience: "8 years",
    location: "San Francisco, CA",
  },
  {
    id: "sc2",
    name: "Daniel Ortiz",
    email: "daniel.o@email.com",
    jobTitle: "ML Engineer",
    matchScore: 87,
    skills: ["Python", "PyTorch", "TensorFlow", "NLP", "MLOps"],
    recommendation: "Strong Match",
    status: "complete",
    progress: 100,
    education: "Ph.D. Machine Learning, MIT",
    experience: "6 years",
    location: "Remote",
  },
  {
    id: "sc3",
    name: "Olivia Chen",
    email: "olivia.c@email.com",
    jobTitle: "Product Manager",
    matchScore: 76,
    skills: ["Product Strategy", "Agile", "Data Analysis", "Roadmapping"],
    recommendation: "Good Match",
    status: "complete",
    progress: 100,
    education: "MBA, Wharton",
    experience: "5 years",
    location: "New York, NY",
  },
  {
    id: "sc4",
    name: "James Mitchell",
    email: "james.m@email.com",
    jobTitle: "DevOps Engineer",
    matchScore: 63,
    skills: ["AWS", "Docker", "Kubernetes", "Linux"],
    recommendation: "Possible Match",
    status: "complete",
    progress: 100,
    education: "B.S. Computer Engineering, Georgia Tech",
    experience: "3 years",
    location: "Austin, TX",
  },
  {
    id: "sc5",
    name: "Priya Sharma",
    email: "priya.s@email.com",
    jobTitle: "UX Designer",
    matchScore: 91,
    skills: ["Figma", "User Research", "Prototyping", "Design Systems", "Accessibility"],
    recommendation: "Strong Match",
    status: "complete",
    progress: 100,
    education: "M.FA Interaction Design, RISD",
    experience: "7 years",
    location: "San Francisco, CA",
  },
  {
    id: "sc6",
    name: "Kevin Blake",
    email: "kevin.b@email.com",
    jobTitle: "Backend Engineer",
    matchScore: 38,
    skills: ["JavaScript", "Node.js", "MongoDB"],
    recommendation: "Poor Match",
    status: "complete",
    progress: 100,
    education: "B.S. Information Technology, UT Austin",
    experience: "2 years",
    location: "Seattle, WA",
  },
]

const screeningCriteria = [
  { id: "education", label: "Education", description: "Degree level and field relevance", icon: GraduationCap, enabled: true },
  { id: "experience", label: "Experience", description: "Years of experience and role relevance", icon: Briefcase, enabled: true },
  { id: "skills", label: "Skills Match", description: "Technical and soft skill alignment", icon: Zap, enabled: true },
  { id: "location", label: "Location", description: "Geographic preference compatibility", icon: MapPin, enabled: false },
  { id: "culture", label: "Cultural Fit", description: "Values and work style alignment", icon: Shield, enabled: true },
]

const recommendationConfig: Record<string, { variant: "success" | "default" | "warning" | "error"; icon: React.ReactNode }> = {
  "Strong Match": { variant: "success", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  "Good Match": { variant: "default", icon: <Sparkles className="h-3.5 w-3.5" /> },
  "Possible Match": { variant: "warning", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  "Poor Match": { variant: "error", icon: <AlertCircle className="h-3.5 w-3.5" /> },
}

function getScoreColor(score: number): string {
  if (score >= 85) return "text-success"
  if (score >= 70) return "text-primary"
  if (score >= 50) return "text-warning"
  return "text-error"
}

function getScoreProgressColor(score: number): string {
  if (score >= 85) return "bg-success"
  if (score >= 70) return "bg-primary"
  if (score >= 50) return "bg-warning"
  return "bg-error"
}

export default function AIScreenerPage() {
  const { candidates } = useStore()
  const [criteria, setCriteria] = React.useState(
    screeningCriteria.map((c) => ({ ...c }))
  )
  const [activeTab, setActiveTab] = React.useState("results")
  const [isScreening, setIsScreening] = React.useState(false)
  const [screeningProgress, setScreeningProgress] = React.useState(0)

  const toggleCriteria = (id: string) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    )
  }

  const startScreening = () => {
    setIsScreening(true)
    setScreeningProgress(0)
    setActiveTab("queue")
    const interval = setInterval(() => {
      setScreeningProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsScreening(false)
          setActiveTab("results")
          return 100
        }
        return prev + 2
      })
    }, 60)
  }

  const screeningQueue = React.useMemo(
    () => screenerCandidates.filter((c) => c.status === "screening"),
    []
  )

  return (
    <AppLayout
      title="AI Resume Screener"
      description="AI-powered candidate screening and matching."
      actions={
        <Button size="sm" onClick={startScreening} disabled={isScreening}>
          {isScreening ? (
            <>
              <Clock className="h-4 w-4 animate-spin" />
              Screening...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Start Screening
            </>
          )}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Upload Area */}
        <Card className="animate-fade-in">
          <CardContent className="p-6">
            <div
              className={cn(
                "relative flex flex-col items-center justify-center rounded-xl bg-background p-10 text-center transition-all duration-200",
                "hover:bg-primary-subtle cursor-pointer"
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-muted mb-4">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">UPLOAD RESUMES</h3>
              <p className="text-sm text-muted max-w-md mb-4">
                Drag and drop resume files here, or click to browse. Supports PDF, DOCX, and TXT formats.
              </p>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline">
                  <FileText className="h-4 w-4" />
                  Browse Files
                </Button>
                <span className="text-xs text-muted">or drop files here</span>
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Max 10MB per file
                </span>
                <span>•</span>
                <span>Up to 50 resumes per batch</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Screening Criteria */}
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Screening Criteria</CardTitle>
                <CardDescription>Configure which factors the AI considers when evaluating candidates</CardDescription>
              </div>
              <Filter className="h-4 w-4 text-muted" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {criteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-lg p-4 text-center transition-all duration-200",
                    criterion.enabled
                      ? "bg-primary-subtle"
                      : "bg-background opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      criterion.enabled ? "bg-primary-muted text-primary" : "bg-surface-hover text-muted"
                    )}
                  >
                    <criterion.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{criterion.label}</p>
                    <p className="text-xs text-muted leading-relaxed">{criterion.description}</p>
                  </div>
                  <Switch
                    checked={criterion.enabled}
                    onCheckedChange={() => toggleCriteria(criterion.id)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Screening Queue */}
        {isScreening && (
          <Card className="animate-fade-in">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Screening in Progress</CardTitle>
                  <CardDescription>AI is analyzing {screenerCandidates.length} candidates resumes against your criteria</CardDescription>
                </div>
                <Clock className="h-4 w-4 text-primary animate-pulse" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Overall Progress</span>
                    <span className="text-foreground font-medium">{screeningProgress}%</span>
                  </div>
                  <Progress
                    value={screeningProgress}
                    className="h-2"
                    indicatorClassName="bg-primary"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {screenerCandidates.map((candidate, index) => {
                    const candidateProgress = Math.min(
                      100,
                      Math.max(0, screeningProgress - index * 12)
                    )
                    return (
                      <div
                        key={candidate.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg p-3 transition-all duration-200",
                          candidateProgress >= 100
                            ? "bg-success-muted"
                            : candidateProgress > 0
                            ? "bg-primary-subtle"
                            : "bg-surface"
                        )}
                      >
                        <div className="h-9 w-9 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-medium text-foreground shrink-0">
                          {getInitials(candidate.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
                          <p className="text-xs text-muted truncate">{candidate.jobTitle}</p>
                        </div>
                        <div className="shrink-0 w-16">
                          <Progress
                            value={candidateProgress}
                            className="h-1.5"
                            indicatorClassName={cn(
                              candidateProgress >= 100 ? "bg-success" : "bg-primary"
                            )}
                          />
                          <p className="text-[10px] text-muted text-right mt-1">
                            {candidateProgress >= 100 ? "Done" : `{candidateProgress}%`}
                          </p>
                        </div> 
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Tabs */}
        <div className="animate-fade-in">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="results" className="gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Results ({screenerCandidates.length})
                </TabsTrigger>
                <TabsTrigger value="queue" className="gap-1.5">
                  <Clock className="h-4 w-4" />
                  Queue
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Results Table */}
            <TabsContent value="results">
              <Card>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Candidate</TableHead>
                      <TableHead>Match Score</TableHead>
                      <TableHead className="hidden lg:table-cell">Key Skills</TableHead>
                      <TableHead>Recommendation</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {screenerCandidates.map((candidate) => (
                      <TableRow key={candidate.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-medium text-foreground shrink-0">
                              {getInitials(candidate.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{candidate.name}</p>
                              <p className="text-xs text-muted truncate">{candidate.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress
                              value={candidate.matchScore}
                              className="h-1.5 flex-1"
                              indicatorClassName={getScoreProgressColor(candidate.matchScore)}
                            />
                            <span className={cn("text-sm font-semibold tabular-nums w-10 text-right", getScoreColor(candidate.matchScore))}>
                              {candidate.matchScore}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {candidate.skills.slice(0, 3).map((skill) => (
                              <Badge key={skill} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {candidate.skills.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{candidate.skills.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={recommendationConfig[candidate.recommendation].variant} className="gap-1">
                            {recommendationConfig[candidate.recommendation].icon}
                            {candidate.recommendation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="h-4 w-4 text-muted" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Download className="h-4 w-4 text-muted" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </Card>
            </TabsContent>

            {/* Queue */}
            <TabsContent value="queue">
              {!isScreening ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="h-14 w-14 rounded-xl bg-surface-elevated flex items-center justify-center mb-4">
                      <Clock className="h-7 w-7 text-muted" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1">No Active Screening</h3>
                    <p className="text-sm text-muted mb-4">Upload resumes and start screening to see progress here.</p>
                    <Button size="sm" onClick={startScreening}>
                      <Sparkles className="h-4 w-4" />
                      Start Screening
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {screenerCandidates.map((candidate, index) => {
                    const candidateProgress = Math.min(
                      100,
                      Math.max(0, screeningProgress - index * 12)
                    )
                    return (
                      <Card key={candidate.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-surface-elevated flex items-center justify-center text-sm font-medium text-foreground shrink-0">
                              {getInitials(candidate.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground">{candidate.name}</p>
                              <p className="text-sm text-muted">{candidate.jobTitle}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="w-32">
                                <Progress
                                  value={candidateProgress}
                                  className="h-2"
                                  indicatorClassName={cn(
                                    candidateProgress >= 100 ? "bg-success" : "bg-primary"
                                  )}
                                />
                              </div>
                              <span className="text-sm font-medium text-foreground w-10 text-right">
                                {candidateProgress}%
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Detailed Results Cards */}
        <div className="animate-fade-in">
          <h3 className="text-sm font-medium text-muted mb-4">Detailed Evaluations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {screenerCandidates.map((candidate) => (
              <Card
                key={candidate.id}
                className="group transition-all duration-200"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-surface-elevated flex items-center justify-center text-sm font-medium text-foreground shrink-0">
                        {getInitials(candidate.name)}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm truncate">{candidate.name}</CardTitle>
                        <CardDescription className="text-xs truncate">{candidate.jobTitle}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={recommendationConfig[candidate.recommendation].variant} className="text-xs shrink-0">
                      {candidate.recommendation}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Match Score</span>
                      <span className={cn("font-semibold", getScoreColor(candidate.matchScore))}>
                        {candidate.matchScore}%
                      </span>
                    </div>
                    <Progress
                      value={candidate.matchScore}
                      className="h-2"
                      indicatorClassName={getScoreProgressColor(candidate.matchScore)}
                    />
                  </div>

                  <Separator className="bg-border" />

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-muted">
                      <GraduationCap className="h-3 w-3 shrink-0" />
                      <span className="truncate">{candidate.education}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <Briefcase className="h-3 w-3 shrink-0" />
                      <span>{candidate.experience}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{candidate.location}</span>
                    </div>
                  </div>

                  <Separator className="bg-border" />

                  <div className="flex flex-wrap gap-1">
                    {candidate.skills.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-[10px]">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
