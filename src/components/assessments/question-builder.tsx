"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AssessmentQuestionDto, AssessmentQuestionType } from "@/lib/api/assessments.api"

const TYPES: { value: AssessmentQuestionType; label: string }[] = [
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "TRUE_FALSE", label: "True / False" },
]

function isChoice(type: AssessmentQuestionType) {
  return type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE"
}

function isText(type: AssessmentQuestionType) {
  return type === "SHORT_TEXT" || type === "LONG_TEXT"
}

export interface EditableQuestion extends AssessmentQuestionDto {
  _key: string
}

let keyCounter = 0
function nextKey() {
  keyCounter += 1
  return `q-${Date.now()}-${keyCounter}`;
}

export function toEditable(questions: AssessmentQuestionDto[]): EditableQuestion[] {
  return questions.map((q) => ({ ...q, _key: q.id || nextKey() }))
}

export function blankQuestion(sortOrder: number): EditableQuestion {
  return {
    id: "",
    _key: nextKey(),
    type: "SINGLE_CHOICE",
    prompt: "",
    instructions: null,
    sortOrder,
    required: true,
    points: 10,
    competency: null,
    aiEvaluated: false,
    aiApproved: true,
    options: [
      { id: "", label: "", sortOrder: 0, isCorrect: true },
      { id: "", label: "", sortOrder: 1, isCorrect: false },
    ],
    rubricCriteria: [],
  }
}

export function QuestionBuilder({ questions, onChange, disabled }: {
  questions: EditableQuestion[]
  onChange: (questions: EditableQuestion[]) => void
  disabled?: boolean
}) {
  const update = (key: string, patch: Partial<EditableQuestion>) => {
    onChange(questions.map((q) => (q._key === key ? { ...q, ...patch } : q)))
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    const reordered = [...questions]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    onChange(reordered.map((q, i) => ({ ...q, sortOrder: i })))
  }

  const duplicate = (index: number) => {
    const source = questions[index]
    const copy: EditableQuestion = {
      ...source,
      id: "",
      _key: nextKey(),
      prompt: `${source.prompt} (copy)`,
      options: source.options.map((o) => ({ ...o, id: "" })),
      rubricCriteria: source.rubricCriteria.map((c) => ({ ...c, id: "" })),
    }
    const next = [...questions]
    next.splice(index + 1, 0, copy)
    onChange(next.map((q, i) => ({ ...q, sortOrder: i })))
  }

  const changeType = (key: string, type: AssessmentQuestionType) => {
    const current = questions.find((q) => q._key === key)
    if (!current) return
    if (isChoice(type) && !isChoice(current.type)) {
      update(key, {
        type,
        points: current.points || 10,
        aiEvaluated: false,
        options: type === "TRUE_FALSE"
          ? [{ id: "", label: "True", sortOrder: 0, isCorrect: true }, { id: "", label: "False", sortOrder: 1, isCorrect: false }]
          : [{ id: "", label: "", sortOrder: 0, isCorrect: true }, { id: "", label: "", sortOrder: 1, isCorrect: false }],
        rubricCriteria: [],
      })
    } else if (isText(type) && !isText(current.type)) {
      update(key, { type, options: [], aiEvaluated: type === "LONG_TEXT" })
    } else {
      update(key, { type })
    }
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <Card key={question._key}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Question {index + 1}</span>
              {question.aiGenerated && <Badge variant={question.aiApproved ? "outline" : "error"}>{question.aiApproved ? "AI-approved" : "AI draft — needs approval"}</Badge>}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label="Move up">↑</Button>
                <Button variant="ghost" size="sm" disabled={disabled || index === questions.length - 1} onClick={() => move(index, 1)} aria-label="Move down">↓</Button>
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => duplicate(index)}>Duplicate</Button>
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(questions.filter((q) => q._key !== question._key).map((q, i) => ({ ...q, sortOrder: i })))}>Delete</Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <Select value={question.type} onValueChange={(value) => changeType(question._key, value as AssessmentQuestionType)} disabled={disabled}>
                <SelectTrigger aria-label="Question type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input
                value={question.prompt}
                disabled={disabled}
                onChange={(e) => update(question._key, { prompt: e.target.value })}
                placeholder="Write the question…"
                aria-label={`Question ${index + 1} prompt`}
              />
            </div>

            {isChoice(question.type) && (
              <div className="space-y-2">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input
                      type={question.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
                      name={`correct-${question._key}`}
                      checked={!!option.isCorrect}
                      disabled={disabled}
                      onChange={() => {
                        const nextOptions = question.type === "MULTIPLE_CHOICE"
                          ? question.options.map((o, i) => (i === optionIndex ? { ...o, isCorrect: !o.isCorrect } : o))
                          : question.options.map((o, i) => ({ ...o, isCorrect: i === optionIndex }))
                        update(question._key, { options: nextOptions })
                      }}
                      aria-label={`Mark option ${optionIndex + 1} correct`}
                    />
                    <Input
                      value={option.label}
                      disabled={disabled}
                      onChange={(e) => update(question._key, { options: question.options.map((o, i) => (i === optionIndex ? { ...o, label: e.target.value } : o)) })}
                      placeholder={`Option ${optionIndex + 1}`}
                      aria-label={`Option ${optionIndex + 1}`}
                    />
                    {question.options.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => update(question._key, { options: question.options.filter((_, i) => i !== optionIndex).map((o, i) => ({ ...o, sortOrder: i })) })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {question.type !== "TRUE_FALSE" && question.options.length < 10 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => update(question._key, { options: [...question.options, { id: "", label: "", sortOrder: question.options.length, isCorrect: false }] })}
                  >
                    + Add option
                  </Button>
                )}
              </div>
            )}

            {isText(question.type) && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={question.aiEvaluated} disabled={disabled} onCheckedChange={(checked) => update(question._key, { aiEvaluated: checked === true })} />
                Evaluate with AI against a rubric
              </label>
            )}

            {isText(question.type) && question.aiEvaluated && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Rubric (recruiter-owned)</p>
                {question.rubricCriteria.map((criterion, criterionIndex) => (
                  <div key={criterionIndex} className="grid gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
                    <Input
                      value={criterion.name}
                      disabled={disabled}
                      onChange={(e) => update(question._key, { rubricCriteria: question.rubricCriteria.map((c, i) => (i === criterionIndex ? { ...c, name: e.target.value } : c)) })}
                      placeholder="Criterion name"
                      aria-label="Criterion name"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={criterion.maxScore}
                      disabled={disabled}
                      onChange={(e) => update(question._key, { rubricCriteria: question.rubricCriteria.map((c, i) => (i === criterionIndex ? { ...c, maxScore: Number(e.target.value) || 1 } : c)) })}
                      aria-label="Max score"
                    />
                    <Input
                      value={criterion.guidance || ""}
                      disabled={disabled}
                      onChange={(e) => update(question._key, { rubricCriteria: question.rubricCriteria.map((c, i) => (i === criterionIndex ? { ...c, guidance: e.target.value } : c)) })}
                      placeholder="Guidance"
                      aria-label="Evaluation guidance"
                    />
                    <Button variant="ghost" size="sm" disabled={disabled} onClick={() => update(question._key, { rubricCriteria: question.rubricCriteria.filter((_, i) => i !== criterionIndex).map((c, i) => ({ ...c, sortOrder: i })) })}>Remove</Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => update(question._key, { rubricCriteria: [...question.rubricCriteria, { id: "", name: "", maxScore: 4, weight: 1, sortOrder: question.rubricCriteria.length }] })}
                >
                  + Add criterion
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm">Points
                <Input type="number" min={0} max={1000} value={question.points} disabled={disabled || (isText(question.type) && !question.aiEvaluated)} onChange={(e) => update(question._key, { points: Number(e.target.value) || 0 })} aria-label="Points" />
              </label>
              <label className="text-sm">Competency
                <Input value={question.competency || ""} disabled={disabled} onChange={(e) => update(question._key, { competency: e.target.value })} placeholder="e.g. Linux" aria-label="Competency" />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Checkbox checked={question.required} disabled={disabled} onCheckedChange={(checked) => update(question._key, { required: checked === true })} /> Required
              </label>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
