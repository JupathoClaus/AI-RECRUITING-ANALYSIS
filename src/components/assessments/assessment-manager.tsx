"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { getErrorMessage } from "@/lib/utils"
import {
  listAssessments,
  createAssessment,
  updateAssessment,
  createDraftVersion,
  getAssessmentVersion,
  saveAssessmentQuestions,
  validateAssessmentVersion,
  publishAssessmentVersion,
  approveAiContent,
  generateAssessmentQuestions,
  assignAssessment,
  getAssessmentSummary,
  type AssessmentDto,
  type AssessmentVersionDto,
  type AssessmentQuestionDto,
  type ValidationIssue,
} from "@/lib/api/assessments.api"
import { QuestionBuilder, toEditable, blankQuestion, type EditableQuestion } from "./question-builder"
import { AssessmentResultView } from "./assessment-result-view"

type BuilderTab = "details" | "questions" | "review"

function versionBadge(status: string) {
  return <Badge variant={status === "PUBLISHED" ? "default" : status === "DRAFT" ? "outline" : "error"}>{status}</Badge>
}

export function AssessmentManager({ jobId }: { jobId: string }) {
  const [assessments, setAssessments] = React.useState<AssessmentDto[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")

  const refresh = React.useCallback(() => {
    setLoading(true)
    listAssessments({ jobId, limit: 50 })
      .then((res) => {
        setAssessments(res.data)
        setError(null)
        if (!selectedId && res.data.length > 0) setSelectedId(res.data[0].id)
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason, "Assessments could not be loaded.")))
      .finally(() => setLoading(false))
  }, [jobId, selectedId])

  React.useEffect(() => { refresh() }, [refresh])

  const handleCreate = () => {
    if (!newName.trim()) return
    setCreating(true)
    createAssessment({ name: newName.trim(), jobId })
      .then((created) => {
        setNewName("")
        setAssessments((prev) => [created, ...prev])
        setSelectedId(created.id)
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason, "Assessment could not be created.")))
      .finally(() => setCreating(false))
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (error && assessments.length === 0) return <EmptyState title="Assessments unavailable" description={error} />

  const selected = assessments.find((a) => a.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Assessments</h3>
        <p className="text-sm text-muted">Recruiter-owned tests for this job. Publish a version, assign it to applications, and review results. Scores support decisions — they never hire or reject on their own.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New assessment name, e.g. Systems Administrator Technical Assessment" aria-label="New assessment name" />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>{creating ? "Creating…" : "Create assessment"}</Button>
        </CardContent>
      </Card>

      {assessments.length === 0 ? (
        <EmptyState title="No assessments yet" description="Create the first assessment for this job to get started." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {assessments.map((assessment) => (
              <button
                key={assessment.id}
                onClick={() => setSelectedId(assessment.id)}
                className={`w-full rounded-lg border p-3 text-left ${selectedId === assessment.id ? "border-foreground bg-surface" : "border-border hover:bg-surface-hover"}`}
              >
                <p className="text-sm font-medium">{assessment.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{assessment.status}</Badge>
                  <span className="text-xs text-muted">v{Math.max(...assessment.versions.map((v) => v.versionNumber), 1)}</span>
                </div>
              </button>
            ))}
          </div>
          {selected && <AssessmentDetail key={selected.id} assessment={selected} onChanged={refresh} />}
        </div>
      )}
    </div>
  )
}

function AssessmentDetail({ assessment, onChanged }: { assessment: AssessmentDto; onChanged: () => void }) {
  const [tab, setTab] = React.useState<BuilderTab>("details")
  const [draft, setDraft] = React.useState({ name: assessment.name, description: assessment.description || "", instructions: assessment.instructions || "", durationMinutes: assessment.durationMinutes ?? "", passingScore: assessment.passingScore ?? "" })
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState<(AssessmentVersionDto & { questions: AssessmentQuestionDto[] }) | null>(null)
  const [questions, setQuestions] = React.useState<EditableQuestion[]>([])
  const [issues, setIssues] = React.useState<ValidationIssue[]>([])
  const [summary, setSummary] = React.useState<Awaited<ReturnType<typeof getAssessmentSummary>> | null>(null)
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [resultSessionId, setResultSessionId] = React.useState<string | null>(null)

  const latestVersion = assessment.versions[0] ?? null
  const isDraft = latestVersion?.status === "DRAFT"

  const loadVersion = React.useCallback((versionId: string) => {
    getAssessmentVersion(versionId)
      .then((data) => { setVersion(data); setQuestions(toEditable(data.questions || [])) })
      .catch((reason: unknown) => setMessage(getErrorMessage(reason, "Version could not be loaded.")))
  }, [])

  React.useEffect(() => {
    if (latestVersion) loadVersion(latestVersion.id)
    getAssessmentSummary(assessment.id).then(setSummary).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id, latestVersion?.id])

  const saveDetails = () => {
    setSaving(true)
    updateAssessment(assessment.id, {
      name: draft.name,
      description: draft.description,
      instructions: draft.instructions,
      durationMinutes: draft.durationMinutes === "" ? null : Number(draft.durationMinutes),
      passingScore: draft.passingScore === "" ? null : Number(draft.passingScore),
    })
      .then(() => { setMessage("Details saved."); onChanged() })
      .catch((reason: unknown) => setMessage(getErrorMessage(reason, "Details could not be saved.")))
      .finally(() => setSaving(false))
  }

  const saveQuestions = () => {
    if (!version) return
    setSaving(true)
    saveAssessmentQuestions(version.id, questions.map((q, index) => ({
      id: q.id || undefined,
      type: q.type,
      prompt: q.prompt,
      instructions: q.instructions,
      sortOrder: index,
      required: q.required,
      points: q.points,
      competency: q.competency,
      aiEvaluated: q.aiEvaluated,
      aiApproved: q.aiApproved,
      options: q.options.map((o, i) => ({ id: o.id || undefined, label: o.label, sortOrder: i, isCorrect: !!o.isCorrect })),
      rubricCriteria: q.rubricCriteria.map((c, i) => ({ id: c.id || undefined, name: c.name, description: c.description, guidance: c.guidance, maxScore: c.maxScore, weight: c.weight, sortOrder: i })),
    })))
      .then((data) => { setMessage(`Draft saved (${data.questions.length} questions).`); loadVersion(version.id) })
      .catch((reason: unknown) => setMessage(getErrorMessage(reason, "Questions could not be saved.")))
      .finally(() => setSaving(false))
  }

  const runValidation = () => {
    if (!version) return
    validateAssessmentVersion(version.id)
      .then((res) => { setIssues(res.issues); setMessage(res.valid ? "Ready to publish." : `${res.issues.length} issue(s) must be fixed.`) })
      .catch((reason: unknown) => setMessage(getErrorMessage(reason, "Validation failed.")))
  }

  const publish = () => {
    if (!version) return
    setSaving(true)
    publishAssessmentVersion(version.id)
      .then(() => { setMessage("Published. This version is now immutable."); onChanged() })
      .catch((reason: unknown) => {
        const issues = (reason as { issues?: ValidationIssue[] })?.issues
        if (issues) setIssues(issues)
        setMessage(getErrorMessage(reason, "Publishing failed."))
      })
      .finally(() => setSaving(false))
  }

  const newDraft = () => {
    createDraftVersion(assessment.id)
      .then(() => { setMessage("New draft version created."); onChanged() })
      .catch((reason: unknown) => setMessage(getErrorMessage(reason, "Draft version could not be created.")))
  }

  const approveAll = () => {
    if (!version) return
    approveAiContent(version.id)
      .then(() => { setMessage("AI-generated content approved."); loadVersion(version.id); onChanged() })
      .catch((reason: unknown) => setMessage(getErrorMessage(reason, "Approval failed.")))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{assessment.name}</CardTitle>
            {latestVersion && versionBadge(latestVersion.status)}
            {latestVersion && <span className="text-sm text-muted">Version {latestVersion.versionNumber} · {latestVersion.questionCount} questions · {latestVersion.totalPoints} points</span>}
          </div>
        </CardHeader>
      </Card>

      {summary && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
            <div><p className="text-xs uppercase text-muted">Assigned</p><p className="text-xl font-semibold">{summary.assigned}</p></div>
            <div><p className="text-xs uppercase text-muted">Completed</p><p className="text-xl font-semibold">{summary.completed}</p></div>
            <div><p className="text-xs uppercase text-muted">Average score</p><p className="text-xl font-semibold">{summary.averageScore ?? "—"}</p></div>
            <div><p className="text-xs uppercase text-muted">Completion rate</p><p className="text-xl font-semibold">{summary.completionRate}%</p></div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as BuilderTab)}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="review">Review & publish</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-3">
          <Card><CardContent className="space-y-3 p-4">
            <label className="block text-sm">Name<Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Assessment name" /></label>
            <label className="block text-sm">Description<Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Description" /></label>
            <label className="block text-sm">Candidate instructions<Input value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} aria-label="Instructions" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Duration (minutes, empty = untimed)<Input type="number" value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })} aria-label="Duration minutes" /></label>
              <label className="block text-sm">Passing score 0–100 (decision support only)<Input type="number" value={draft.passingScore} onChange={(e) => setDraft({ ...draft, passingScore: e.target.value })} aria-label="Passing score" /></label>
            </div>
            <Button onClick={saveDetails} disabled={saving}>{saving ? "Saving…" : "Save details"}</Button>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-3">
          {!isDraft && (
            <Card><CardContent className="flex flex-wrap items-center gap-3 p-4">
              <p className="text-sm text-muted">The latest version is {latestVersion?.status}. Create a new draft to edit questions — published versions never change.</p>
              <Button variant="outline" size="sm" onClick={newDraft}>New draft version</Button>
            </CardContent></Card>
          )}
          {isDraft && version && (
            <>
              <QuestionBuilder questions={questions} onChange={setQuestions} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setQuestions([...questions, blankQuestion(questions.length)])}>+ Add question</Button>
                <Button onClick={saveQuestions} disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
                <Button variant="outline" onClick={() => setGenerateOpen(true)}>Generate questions with AI</Button>
                {questions.some((q) => q.aiGenerated && !q.aiApproved) && <Button variant="outline" onClick={approveAll}>Approve AI content</Button>}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="review" className="space-y-3">
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={runValidation}>Validate</Button>
              <Button onClick={publish} disabled={saving || !isDraft}>{saving ? "Publishing…" : "Publish version"}</Button>
              <Button variant="outline" onClick={() => setAssignOpen(true)} disabled={latestVersion?.status !== "PUBLISHED"}>Assign to applications</Button>
            </div>
            {issues.length > 0 && (
              <ul className="space-y-1 text-sm">
                {issues.map((issue, i) => <li key={i} className="rounded-md border border-error/30 bg-error/5 px-3 py-2"><span className="font-medium">{issue.code}</span>: {issue.message}{issue.questionSortOrder != null ? ` (question ${issue.questionSortOrder + 1})` : ""}</li>)}
              </ul>
            )}
            {issues.length === 0 && <p className="text-sm text-muted">Validation has not reported any issues yet. Only published versions can be assigned to candidates.</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {message && <p className="text-sm text-muted" role="status">{message}</p>}

      {resultSessionId && (
        <Dialog open onOpenChange={() => setResultSessionId(null)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader><DialogTitle>Assessment result</DialogTitle></DialogHeader>
            <AssessmentResultView sessionId={resultSessionId} />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign version {latestVersion?.versionNumber}</DialogTitle>
            <DialogDescription>Assign this published version to one application, or open the application to assign and review results.</DialogDescription>
          </DialogHeader>
          <AssignForm
            versionId={latestVersion?.id}
            onAssigned={(sessionId) => { setAssignOpen(false); setResultSessionId(null); setMessage("Assessment assigned. The candidate receives an access code by email."); if (sessionId) setResultSessionId(sessionId) }}
            onError={(message) => setMessage(message)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate questions with AI</DialogTitle>
            <DialogDescription>Drafts are added as unapproved AI content. Review, edit, and approve every question before publishing.</DialogDescription>
          </DialogHeader>
          <GenerateForm
            assessmentId={assessment.id}
            onDone={(generated, rejected) => {
              setGenerateOpen(false)
              setMessage(`${generated} draft question(s) generated${rejected ? `, ${rejected} rejected by quality checks` : ""}. Review and approve them in Questions.`)
              onChanged()
              if (latestVersion) loadVersion(latestVersion.id)
            }}
            onError={(message) => setMessage(message)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AssignForm({ versionId, onAssigned, onError }: { versionId?: string; onAssigned: (sessionId: string | null) => void; onError: (message: string) => void }) {
  const [applicationId, setApplicationId] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  if (!versionId) return null
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!applicationId.trim()) return
        setBusy(true)
        assignAssessment(versionId, { applicationId: applicationId.trim() })
          .then((res) => {
            if (res.code) setApplicationId("")
            onAssigned(res.session?.id ?? null)
          })
          .catch((reason: unknown) => onError(getErrorMessage(reason, "Assignment failed.")))
          .finally(() => setBusy(false))
      }}
    >
      <label className="block text-sm">Application ID
        <Input value={applicationId} onChange={(e) => setApplicationId(e.target.value)} placeholder="Paste the application ID" aria-label="Application ID" />
      </label>
      <Button type="submit" disabled={busy || !applicationId.trim()}>{busy ? "Assigning…" : "Assign assessment"}</Button>
    </form>
  )
}

function GenerateForm({ assessmentId, onDone, onError }: { assessmentId: string; onDone: (generated: number, rejected: number) => void; onError: (message: string) => void }) {
  const [count, setCount] = React.useState("5")
  const [focus, setFocus] = React.useState("")
  const [difficulty, setDifficulty] = React.useState("intermediate")
  const [busy, setBusy] = React.useState(false)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        generateAssessmentQuestions(assessmentId, {
          count: Math.max(1, Math.min(20, Number(count) || 5)),
          focusAreas: focus.split(",").map((s) => s.trim()).filter(Boolean),
          difficulty,
        })
          .then((res) => onDone(res.generated, res.rejected))
          .catch((reason: unknown) => onError(getErrorMessage(reason, "Generation failed.")))
          .finally(() => setBusy(false))
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Number (1–20)<Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} aria-label="Number of questions" /></label>
        <label className="block text-sm">Difficulty<Input value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty" /></label>
      </div>
      <label className="block text-sm">Focus areas (comma separated)<Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Linux, Networking, Troubleshooting" aria-label="Focus areas" /></label>
      <Button type="submit" disabled={busy}>{busy ? "Generating…" : "Generate drafts"}</Button>
    </form>
  )
}
