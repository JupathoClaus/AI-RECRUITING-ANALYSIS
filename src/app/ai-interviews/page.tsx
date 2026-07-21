"use client"

import { useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ModalHeader } from "@/components/ui/modal-header"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  MagicStar,
  Play,
  DocumentText,
  Clock,
  DocumentDownload,
  Share,
  TrendUp,
  TickCircle,
  Calendar,
  Chart2,
  Flash,
  ArrowRight2,
  MessageCircle,
  Flag,
  People,
  Global,
  Speedometer,
} from "iconsax-react"

type InterviewStatus = "Scheduled" | "In Progress" | "Completed"
type InterviewType = "AI Screen" | "AI Technical" | "AI Behavioral"

interface AIInterview {
  id: string
  candidateName: string
  candidateAvatar?: string
  jobTitle: string
  type: InterviewType
  status: InterviewStatus
  date: Date
  duration?: number
  score?: number
  strengths?: string[]
  improvements?: string[]
  summary?: string
  scoreBreakdown?: { label: string; score: number }[]
  transcript?: { question: string; answer: string }[]
}

const aiInterviews: AIInterview[] = [
  {
    id: "ai1",
    candidateName: "Emily Chen",
    jobTitle: "Senior Frontend Engineer",
    type: "AI Technical",
    status: "Completed",
    date: new Date("2026-07-11T10:00:00"),
    duration: 32,
    score: 91,
    strengths: ["React Architecture", "TypeScript", "Performance Optimization"],
    improvements: ["System Design Depth", "Edge Case Handling"],
    summary:
      "Emily demonstrated exceptional frontend expertise during the AI technical assessment. She articulated complex React patterns clearly, showed strong understanding of performance optimization techniques including code splitting and memoization. Her TypeScript knowledge is advanced with clear understanding of generics and utility types. Minor gaps noted in system-level architecture discussions.",
    scoreBreakdown: [
      { label: "Technical Knowledge", score: 94 },
      { label: "Communication", score: 90 },
      { label: "Problem Solving", score: 88 },
      { label: "Code Quality", score: 92 },
    ],
    transcript: [
      { question: "How would you optimize a React app with 500+ components?", answer: "I would implement code splitting with React.lazy, use memo and useMemo strategically, and profile with React DevTools to identify bottlenecks. I've done this at my previous role reducing bundle size by 40%." },
      { question: "Explain the difference between ref and state for managing form inputs.", answer: "State triggers re-renders and is ideal for controlled components where UI should reflect the current value. Refs persist without causing re-renders, useful for storing previous values or managing uncontrolled inputs." },
      { question: "How do you approach testing a complex component tree?", answer: "I follow the testing pyramid: unit tests for logic, integration tests for component interactions, and snapshot tests for regression. I use React Testing Library with user-centric queries." },
    ],
  },
  {
    id: "ai2",
    candidateName: "David Park",
    jobTitle: "ML Engineer",
    type: "AI Behavioral",
    status: "Completed",
    date: new Date("2026-07-10T14:30:00"),
    duration: 28,
    score: 88,
    strengths: ["Team Leadership", "Research Background", "Cross-functional Collaboration"],
    improvements: ["Time Management", "Delegation Skills"],
    summary:
      "David showed strong leadership and collaboration skills during the behavioral assessment. His research background provides a unique perspective on problem-solving. He communicates technical concepts effectively to non-technical stakeholders. Areas for development include delegation and managing competing priorities across multiple projects.",
    scoreBreakdown: [
      { label: "Technical Knowledge", score: 86 },
      { label: "Communication", score: 92 },
      { label: "Problem Solving", score: 85 },
      { label: "Cultural Fit", score: 89 },
    ],
    transcript: [
      { question: "Tell me about a time you had to resolve a conflict within your team.", answer: "During a model deployment sprint, two engineers disagreed on the serving architecture. I facilitated a design review where both presented their approaches with benchmarks. We went with a hybrid approach that incorporated both perspectives." },
      { question: "How do you stay current with ML research while shipping products?", answer: "I dedicate Friday afternoons to reading papers and attending internal journal clubs. I also have a personal project pipeline where I prototype interesting techniques before they're needed for production." },
    ],
  },
  {
    id: "ai3",
    candidateName: "Tom Bradley",
    jobTitle: "Senior Frontend Engineer",
    type: "AI Screen",
    status: "Completed",
    date: new Date("2026-07-09T09:15:00"),
    duration: 25,
    score: 84,
    strengths: ["Deep JavaScript Expertise", "Performance Tuning", "Mentoring"],
    improvements: ["Modern Frameworks", "Cloud-native Patterns"],
    summary:
      "Tom brings extensive JavaScript knowledge with 12 years of experience. He shows strong fundamentals in web performance and has a proven track record of mentoring junior developers. While his vanilla JS skills are outstanding, areas for growth include modern framework patterns and cloud-native frontend architectures.",
    scoreBreakdown: [
      { label: "Technical Knowledge", score: 87 },
      { label: "Communication", score: 85 },
      { label: "Problem Solving", score: 82 },
      { label: "Cultural Fit", score: 81 },
    ],
    transcript: [
      { question: "How do you approach performance profiling in a web application?", answer: "I start with Lighthouse and Web Vitals to identify the top issues, then dive into Chrome DevTools Performance panel for CPU profiling and flame charts. I focus on the biggest wins first — typically LCP and CLS improvements." },
      { question: "What's your approach to mentoring junior developers?", answer: "I pair program regularly, assign stretch tasks with clear expectations, and create a safe space for asking questions. I've mentored 6 developers over my career, with 3 progressing to senior roles." },
    ],
  },
  {
    id: "ai4",
    candidateName: "Sarah Kim",
    jobTitle: "Product Manager",
    type: "AI Behavioral",
    status: "Completed",
    date: new Date("2026-07-08T11:00:00"),
    duration: 30,
    score: 90,
    strengths: ["Product Vision", "Data-Driven Decisions", "Stakeholder Management"],
    improvements: ["Technical Depth", "Market Analysis"],
    summary:
      "Sarah demonstrated exceptional product thinking and stakeholder management skills. She shows a clear ability to translate business goals into actionable product strategies backed by data. Her experience at a Series C startup gives her a strong startup mindset. Could benefit from deeper technical understanding of ML systems.",
    scoreBreakdown: [
      { label: "Technical Knowledge", score: 78 },
      { label: "Communication", score: 95 },
      { label: "Problem Solving", score: 92 },
      { label: "Cultural Fit", score: 94 },
    ],
    transcript: [
      { question: "How do you prioritize features in a resource-constrained environment?", answer: "I use a framework combining RICE scoring with strategic alignment. Each feature is evaluated on Reach, Impact, Confidence, and Effort, then mapped against quarterly OKRs. This creates transparency and data-driven decisions." },
      { question: "Describe a time when data contradicted your intuition.", answer: "I once pushed for a complex onboarding flow based on competitor analysis. A/B testing showed a 3-step simplified version had 23% higher completion rate. I learned to let data challenge assumptions early." },
    ],
  },
  {
    id: "ai5",
    candidateName: "Nina Zhao",
    jobTitle: "Product Manager",
    type: "AI Screen",
    status: "Scheduled",
    date: new Date("2026-07-15T16:00:00"),
  },
  {
    id: "ai6",
    candidateName: "Marcus Johnson",
    jobTitle: "Senior Frontend Engineer",
    type: "AI Technical",
    status: "Scheduled",
    date: new Date("2026-07-16T09:00:00"),
  },
  {
    id: "ai7",
    candidateName: "Aisha Mohammed",
    jobTitle: "Technical Writer",
    type: "AI Screen",
    status: "In Progress",
    date: new Date("2026-07-12T13:00:00"),
  },
  {
    id: "ai8",
    candidateName: "Carlos Mendez",
    jobTitle: "DevOps Engineer",
    type: "AI Technical",
    status: "Scheduled",
    date: new Date("2026-07-17T10:30:00"),
  },
]

const stats = [
  { label: "Total AI Interviews", value: "47", icon: MagicStar, change: "+12 this week", color: "text-primary", accent: "border-l-primary" },
  { label: "Average Score", value: "86", icon: Chart2, change: "+3 from last month", color: "text-success", accent: "border-l-success" },
  { label: "Completion Rate", value: "96%", icon: TickCircle, change: "Consistent", color: "text-info", accent: "border-l-info" },
  { label: "Avg Duration", value: "28 min", icon: Clock, change: "-2 min optimized", color: "text-warning", accent: "border-l-warning" },
]

const statusConfig: Record<InterviewStatus, { color: string; dotColor: string }> = {
  Scheduled: { color: "bg-surface", dotColor: "bg-warning" },
  "In Progress": { color: "bg-primary-subtle", dotColor: "bg-primary" },
  Completed: { color: "bg-surface", dotColor: "bg-success" },
}

const typeBadgeVariant: Record<InterviewType, "default" | "info" | "secondary"> = {
  "AI Screen": "info",
  "AI Technical": "default",
  "AI Behavioral": "secondary",
}

function scoreRingColor(score: number): string {
  if (score >= 90) return "ring-success"
  if (score >= 80) return "ring-primary"
  if (score >= 70) return "ring-warning"
  return "ring-error"
}

export default function AIInterviewsPage() {
  const [detailInterview, setDetailInterview] = useState<AIInterview | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [difficulty, setDifficulty] = useState(50)

  const completedInterviews = aiInterviews.filter((i) => i.status === "Completed")

  return (
    <AppLayout
      title="AI Interviews"
      description="Manage AI-powered interview sessions with intelligent scoring and analysis"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <MagicStar className="h-4 w-4 mr-2" />
              Create AI Interview
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px]">
            <ModalHeader>
              <DialogTitle className="flex items-center gap-2">
                <MagicStar className="h-5 w-5 text-primary" />
                Create AI Interview
              </DialogTitle>
              <DialogDescription>
                Configure an AI-powered interview session for a candidate.
              </DialogDescription>
            </ModalHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Candidate</label>
                <Select>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select a candidate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="c1">Emily Chen</SelectItem>
                    <SelectItem value="c2">Marcus Johnson</SelectItem>
                    <SelectItem value="c3">Sarah Kim</SelectItem>
                    <SelectItem value="c4">David Park</SelectItem>
                    <SelectItem value="c5">Lisa Wang</SelectItem>
                    <SelectItem value="c9">Nina Zhao</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Position</label>
                <Select>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select a position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="j1">Senior Frontend Engineer</SelectItem>
                    <SelectItem value="j2">Product Manager</SelectItem>
                    <SelectItem value="j3">ML Engineer</SelectItem>
                    <SelectItem value="j4">UX Designer</SelectItem>
                    <SelectItem value="j5">DevOps Engineer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Interview Type</label>
                  <Select defaultValue="ai-screen">
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai-screen">AI Screen</SelectItem>
                      <SelectItem value="ai-technical">AI Technical</SelectItem>
                      <SelectItem value="ai-behavioral">AI Behavioral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Language</label>
                  <Select defaultValue="en">
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Difficulty Level — <span className="text-primary">{difficulty}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-border accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted">
                  <span>Easy</span>
                  <span>Medium</span>
                  <span>Hard</span>
                </div>
              </div>
              <Separator className="bg-border" />
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Question Templates</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { icon: Flag, label: "Role-specific technical questions" },
                    { icon: MessageCircle, label: "Behavioral & situational questions" },
                    { icon: MagicStar, label: "Problem-solving & critical thinking" },
                    { icon: People, label: "Team collaboration scenarios" },
                  ].map((t) => (
                    <label
                      key={t.label}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <input
                        type="checkbox"
                        defaultChecked
                        className="h-4 w-4 rounded border-border bg-background accent-primary"
                      />
                      <t.icon className="h-4 w-4 text-muted" />
                      <span className="text-sm text-muted-foreground">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setCreateOpen(false)}>
                <MagicStar className="h-4 w-4 mr-2" />
                Create Interview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className={cn("border-l-4 transition-all duration-200", s.accent)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-1">{s.label}</p>
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted mt-1 flex items-center gap-1">
                    <TrendUp className="h-3 w-3 text-success" />
                    {s.change}
                  </p>
                </div>
                <div className={cn("shrink-0 transition-transform duration-200 hover:scale-110", s.color)}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Interview List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">AI Interview Sessions</h2>
        <div className="grid grid-cols-1 gap-4">
          {aiInterviews.map((interview) => {
            const st = statusConfig[interview.status]
            return (
              <Card
                key={interview.id}
                className={cn("transition-all duration-200", st.color)}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* AI Avatar */}
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12">
                        <div className="h-full w-full flex items-center justify-center bg-primary-muted rounded-full">
                          <MagicStar className="h-6 w-6 text-primary" />
                        </div>
                      </Avatar>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{interview.candidateName}</h3>
                        <Badge variant={typeBadgeVariant[interview.type]} className="text-[10px]">
                          {interview.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted">{interview.jobTitle}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                        <span className="flex items-center gap-1" suppressHydrationWarning>
                          <Calendar className="h-3 w-3" />
                          {interview.date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {interview.date.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {interview.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {interview.duration} min
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    {interview.score !== undefined && (
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "relative h-14 w-14 rounded-full flex items-center justify-center ring-4 ring-offset-2 ring-offset-background",
                            scoreRingColor(interview.score)
                          )}
                        >
                          <span className="text-lg font-bold text-foreground">{interview.score}</span>
                        </div>
                      </div>
                    )}

                    {/* Status + Actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", st.dotColor)} />
                        <span className="text-xs text-muted-foreground">{interview.status}</span>
                      </div>
                      <div className="flex gap-2">
                        {interview.status === "Scheduled" && (
                          <Button size="sm" className="h-8">
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                            Start
                          </Button>
                        )}
                        {interview.status === "Completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setDetailInterview(interview)}
                          >
                            <DocumentText className="h-3.5 w-3.5 mr-1.5" />
                            View Report
                          </Button>
                        )}
                        {interview.status === "In Progress" && (
                          <Button size="sm" variant="outline" className="h-8 border-primary/30 text-primary">
                            <Speedometer className="h-3.5 w-3.5 mr-1.5" />
                            Monitoring
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Strengths & Improvements */}
                  {interview.strengths && interview.improvements && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex flex-wrap gap-2">
                        {interview.strengths.map((s) => (
                          <Badge key={s} variant="success" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                        {interview.improvements.map((i) => (
                          <Badge key={i} variant="warning" className="text-[10px]">
                            {i}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailInterview} onOpenChange={(open) => !open && setDetailInterview(null)}>
          <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          {detailInterview && (
            <>
              <ModalHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MagicStar className="h-5 w-5 text-primary" />
                  AI Interview Report
                </DialogTitle>
                <DialogDescription>
                  {detailInterview.candidateName} — {detailInterview.jobTitle}
                </DialogDescription>
              </ModalHeader>

              <div className="space-y-6 py-2">
                {/* Overall Score */}
                <div className="flex items-center gap-5">
                  <div
                    className={cn(
                      "relative h-20 w-20 rounded-full flex items-center justify-center ring-4 ring-offset-2 ring-offset-background shrink-0",
                      scoreRingColor(detailInterview.score ?? 0)
                    )}
                  >
                    <span className="text-2xl font-bold text-foreground">{detailInterview.score}</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">Overall Assessment:</span>{" "}
                      {(detailInterview.score ?? 0) >= 85
                        ? "Strong candidate — recommended to proceed"
                        : "Moderate fit — review specific areas"}
                    </p>
                    <p className="text-xs text-muted" suppressHydrationWarning>
                      {detailInterview.type} · {detailInterview.duration} min ·{" "}
                      {detailInterview.date.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Summary */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">AI Summary</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed bg-surface-elevated rounded-lg p-4 border border-border">
                    {detailInterview.summary}
                  </p>
                </div>

                {/* Score Breakdown */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">Score Breakdown</h4>
                  <div className="space-y-3">
                    {detailInterview.scoreBreakdown?.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium text-foreground">{item.score}/100</span>
                        </div>
                        <Progress value={item.score} className="h-2 bg-border" />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Key Strengths</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailInterview.strengths?.map((s) => (
                        <Badge key={s} variant="success" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Areas for Improvement</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailInterview.improvements?.map((i) => (
                        <Badge key={i} variant="warning" className="text-xs">
                          {i}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Transcript */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">Transcript Preview</h4>
                  <div className="space-y-3">
                    {detailInterview.transcript?.map((t, idx) => (
                      <div key={idx} className="rounded-lg border border-border bg-surface-elevated overflow-hidden">
                        <div className="px-4 py-2.5 bg-primary-subtle border-b border-border">
                          <p className="text-xs font-medium text-primary">
                            Q{idx + 1}
                          </p>
                          <p className="text-sm text-foreground mt-0.5">{t.question}</p>
                        </div>
                        <div className="px-4 py-2.5">
                          <p className="text-xs font-medium text-muted mb-0.5">Candidate Response</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{t.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" className="sm:mr-auto">
                  <Share className="h-4 w-4 mr-2" />
                  Share with Team
                </Button>
                <Button>
                  <DocumentDownload className="h-4 w-4 mr-2" />
                  Download Report
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
