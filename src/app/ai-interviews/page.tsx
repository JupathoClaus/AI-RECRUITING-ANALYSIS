"use client"

import { useState } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
import {
  Sparkles,
  Target,
  MessageCircle,
  Brain,
  Users,
} from "lucide-react"

export default function AIInterviewsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [difficulty, setDifficulty] = useState(50)

  return (
    <AppLayout
      title="AI Interviews"
      description="Manage AI-powered interview sessions with intelligent scoring and analysis"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Sparkles className="h-4 w-4 mr-2" />
              Create AI Interview
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px]">
            <ModalHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
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
                    <SelectItem value="c1">No candidates available</SelectItem>
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
                    <SelectItem value="j1">No positions available</SelectItem>
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
                    { icon: Target, label: "Role-specific technical questions" },
                    { icon: MessageCircle, label: "Behavioral & situational questions" },
                    { icon: Brain, label: "Problem-solving & critical thinking" },
                    { icon: Users, label: "Team collaboration scenarios" },
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
                <Sparkles className="h-4 w-4 mr-2" />
                Create Interview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Empty State - No AI Interviews yet */}
      <div className="space-y-8">
        <div className="text-center py-16">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-primary-muted mb-6">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">No AI Interviews Yet</h2>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            Create your first AI-powered interview session to start evaluating candidates
            with intelligent scoring and automated analysis.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Getting Started</CardTitle>
            <CardDescription>
              AI Interviews automate candidate screening with role-specific questions,
              real-time scoring, and detailed transcripts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <Sparkles className="h-6 w-6 text-primary mb-2" />
                <h4 className="font-medium text-foreground">AI Screening</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Automated initial candidate evaluation with configurable question templates
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <Target className="h-6 w-6 text-success mb-2" />
                <h4 className="font-medium text-foreground">Technical Assessment</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Role-specific coding challenges and system design questions
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <MessageCircle className="h-6 w-6 text-warning mb-2" />
                <h4 className="font-medium text-foreground">Behavioral Evaluation</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Situational judgment and soft skill assessment via AI
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button size="lg" onClick={() => setCreateOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Create Your First AI Interview
          </Button>
        </div>
      </div>
    </AppLayout>
  )
}