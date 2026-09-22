import { apiRequest, ApiErrorResponse } from './client'

export type AssessmentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED'
export type AssessmentQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_TEXT' | 'LONG_TEXT' | 'TRUE_FALSE'
export type AssessmentAssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'CANCELLED' | 'EVALUATED'
export type AssessmentSessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'CANCELLED' | 'EVALUATING' | 'EVALUATED'

export interface AssessmentOptionDto {
  id: string
  label: string
  sortOrder: number
  isCorrect?: boolean
  selected?: boolean
}

export interface AssessmentRubricDto {
  id: string
  name: string
  description?: string | null
  guidance?: string | null
  maxScore: number
  weight: number
  sortOrder: number
}

export interface AssessmentQuestionDto {
  id: string
  type: AssessmentQuestionType
  prompt: string
  instructions?: string | null
  sortOrder: number
  required: boolean
  points: number
  competency?: string | null
  aiEvaluated: boolean
  aiGenerated?: boolean
  aiApproved?: boolean
  options: AssessmentOptionDto[]
  rubricCriteria: AssessmentRubricDto[]
}

export interface AssessmentVersionDto {
  id: string
  versionNumber: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  publishedAt?: string | null
  questionCount: number
  totalPoints: number
  questions?: AssessmentQuestionDto[]
}

export interface AssessmentDto {
  id: string
  jobId?: string | null
  name: string
  description?: string | null
  instructions?: string | null
  status: AssessmentStatus
  durationMinutes?: number | null
  passingScore?: number | null
  maxAttempts: number
  aiGenerated: boolean
  aiApproved: boolean
  createdAt: string
  updatedAt: string
  versions: AssessmentVersionDto[]
}

export interface PagedResponse<T> {
  data: T[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface ValidationIssue {
  code: string
  message: string
  questionSortOrder?: number
}

export interface AssessmentResultDto {
  session: { id: string; status: AssessmentSessionStatus; attemptNumber: number; startedAt?: string | null; submittedAt?: string | null; expiresAt?: string | null }
  assessment: { id: string; name: string; passingScore?: number | null; durationMinutes?: number | null; versionNumber: number; versionId: string }
  application: { id: string; status: string; job: { id: string; title: string }; candidate: { id: string; firstName: string; lastName: string; email?: string | null } }
  questions: (AssessmentQuestionDto & {
    response: { textAnswer?: string | null; selectedOptionIds: string[]; deterministicScore?: number | null; deterministicMax?: number | null; updatedAt: string } | null
  })[]
  evaluations: { id: string; attempt: number; status: string; provider?: string | null; model?: string | null; promptVersion?: string | null; schemaVersion?: string | null; latencyMs?: number | null; failureCode?: string | null; failureMessageSafe?: string | null; output?: unknown }[]
  latestEvaluation: { id: string; attempt: number; status: string } | null
  result: {
    totalScore: number
    deterministicScore: number
    deterministicMax: number
    aiScore?: number | null
    aiMax?: number | null
    questionBreakdown?: unknown
    competencyBreakdown?: { competency: string; score: number; max: number }[]
    strengths?: string[]
    gaps?: string[]
    uncertainties?: string[]
    evaluatedAt?: string | null
    threshold?: { passingScore: number; meetsThreshold: boolean } | null
  } | null
}

// ── Recruiter ────────────────────────────────────────────────────

export async function listAssessments(params: { jobId?: string; status?: AssessmentStatus; page?: number; limit?: number } = {}) {
  return apiRequest<PagedResponse<AssessmentDto>>('/assessments', { params: params as Record<string, string | number | undefined> })
}

export async function createAssessment(input: { name: string; jobId?: string; description?: string; instructions?: string; durationMinutes?: number | null; passingScore?: number | null; maxAttempts?: number }) {
  return apiRequest<AssessmentDto>('/assessments', {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}

export async function updateAssessment(id: string, input: Partial<{ name: string; description: string; instructions: string; durationMinutes: number | null; passingScore: number | null; maxAttempts: number; aiApproved: boolean }>) {
  return apiRequest<AssessmentDto>(`/assessments/${id}`, { method: 'PATCH', body: input })
}

export async function archiveAssessment(id: string) {
  return apiRequest<AssessmentDto>(`/assessments/${id}/archive`, { method: 'POST' })
}

export async function getAssessmentSummary(id: string) {
  return apiRequest<{
    assessment: { id: string; name: string; status: string }
    versions: AssessmentVersionDto[]
    assigned: number
    byStatus: Record<string, number>
    completed: number
    completionRate: number
    averageScore: number | null
    avgCompletionMs: number | null
    questionPerformance: { questionId: string; averageScore: number | null; responseCount: number }[]
  }>(`/assessments/${id}/summary`)
}

export async function createDraftVersion(assessmentId: string) {
  return apiRequest<AssessmentVersionDto & { questions: AssessmentQuestionDto[] }>(`/assessments/${assessmentId}/draft-version`, { method: 'POST' })
}

export async function getAssessmentVersion(versionId: string) {
  return apiRequest<AssessmentVersionDto & { questions: AssessmentQuestionDto[] }>(`/assessments/versions/${versionId}`)
}

export interface AssessmentQuestionInput {
  id?: string
  type: AssessmentQuestionType
  prompt: string
  instructions?: string | null
  sortOrder: number
  required?: boolean
  points?: number
  competency?: string | null
  aiEvaluated?: boolean
  aiApproved?: boolean
  options?: { id?: string; label: string; sortOrder: number; isCorrect?: boolean; points?: number | null }[]
  rubricCriteria?: { id?: string; name: string; description?: string | null; guidance?: string | null; maxScore: number; weight?: number; sortOrder: number }[]
}

export async function saveAssessmentQuestions(versionId: string, questions: AssessmentQuestionInput[]) {
  return apiRequest<AssessmentVersionDto & { questions: AssessmentQuestionDto[] }>(`/assessments/versions/${versionId}/questions`, { method: 'POST', body: { questions } })
}

export async function validateAssessmentVersion(versionId: string) {
  return apiRequest<{ valid: boolean; issues: ValidationIssue[] }>(`/assessments/versions/${versionId}/validate`, { method: 'POST' })
}

export async function publishAssessmentVersion(versionId: string) {
  return apiRequest<AssessmentVersionDto & { questions: AssessmentQuestionDto[] }>(`/assessments/versions/${versionId}/publish`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}

export async function approveAiContent(versionId: string, questionIds?: string[]) {
  return apiRequest<AssessmentVersionDto & { questions: AssessmentQuestionDto[] }>(`/assessments/versions/${versionId}/approve-ai`, { method: 'POST', body: { questionIds } })
}

export async function generateAssessmentQuestions(assessmentId: string, input: { count: number; focusAreas?: string[]; difficulty?: string; instructions?: string; questionTypes?: string[] }) {
  return apiRequest<{ versionId: string; generated: number; rejected: number; questions: AssessmentQuestionDto[] }>(`/assessments/${assessmentId}/generate-questions`, { method: 'POST', body: input })
}

export async function assignAssessment(versionId: string, input: { applicationId: string; dueAt?: string | null }) {
  return apiRequest<{ id: string; status: string; code?: string; session: { id: string; status: string } | null }>(`/assessments/versions/${versionId}/assignments`, { method: 'POST', body: input })
}

export async function bulkAssignAssessment(versionId: string, input: { applicationIds: string[]; dueAt?: string | null }) {
  return apiRequest<{ jobId: string; state: string; deduplicated: boolean }>(`/assessments/versions/${versionId}/bulk-assignments`, { method: 'POST', body: input })
}

export async function getBulkAssignJob(jobId: string) {
  return apiRequest<{ jobId: string; state: string; progress?: unknown; result?: { assigned: number; skipped: number; failed: number } | null }>(`/assessments/bulk-jobs/${encodeURIComponent(jobId)}`)
}

export async function listAssessmentAssignments(params: { assessmentId?: string; applicationId?: string; status?: AssessmentAssignmentStatus; page?: number; limit?: number } = {}) {
  return apiRequest<PagedResponse<{ id: string; status: string; dueAt?: string | null; version: { id: string; versionNumber: number; assessment: { id: string; name: string } }; application: unknown; session: { id: string; status: string; codeDisplayHint?: string | null } | null }>>('/assessments/assignments', { params: params as Record<string, string | number | undefined> })
}

export async function retakeAssessment(assignmentId: string) {
  return apiRequest<{ sessionId: string; attemptNumber: number; code: string }>(`/assessments/assignments/${assignmentId}/retake`, { method: 'POST' })
}

export async function getAssessmentResult(sessionId: string) {
  return apiRequest<AssessmentResultDto>(`/assessments/sessions/${sessionId}/result`)
}

export async function retryAssessmentEvaluation(sessionId: string) {
  return apiRequest<{ id: string; attempt: number; status: string }>(`/assessments/sessions/${sessionId}/retry-evaluation`, { method: 'POST' })
}

export async function getApplicationAssessmentState(applicationId: string) {
  return apiRequest<{
    applicationId: string
    assignments: {
      id: string
      status: AssessmentAssignmentStatus
      dueAt?: string | null
      assessment: { id: string; name: string; passingScore?: number | null; durationMinutes?: number | null; versionNumber: number; versionId: string }
      latestSession: { id: string; status: AssessmentSessionStatus; attemptNumber: number; startedAt?: string | null; submittedAt?: string | null; expiresAt?: string | null; result?: { totalScore: number; evaluatedAt?: string | null } | null } | null
    }[]
  }>(`/assessments/applications/${applicationId}/state`)
}

// ── Candidate (code → short-lived token in sessionStorage) ───────

const CANDIDATE_TOKEN_KEY = 'ai-recruiter-assessment-token'

export function getCandidateAssessmentToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(CANDIDATE_TOKEN_KEY)
}

export function setCandidateAssessmentToken(token: string): void {
  sessionStorage.setItem(CANDIDATE_TOKEN_KEY, token)
}

export function clearCandidateAssessmentToken(): void {
  sessionStorage.removeItem(CANDIDATE_TOKEN_KEY)
}

async function candidateRequest<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const token = options.token ?? getCandidateAssessmentToken()
  const res = await candidateRaw(path, { ...options, token: token ?? undefined });
  return res as T;
}

async function candidateRaw(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<unknown> {
  // Candidate endpoints use their own Authorization (assessment token), never the recruiter JWT.
  const base = (process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '/api/v1' : 'http://localhost:3000/api/v1'));
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  const data = (json as { data?: unknown }).data ?? json;
  if (!response.ok) {
    throw new ApiErrorResponse(response.status, (json as { errorCode?: string }).errorCode ?? 'REQUEST_FAILED', (json as { message?: string }).message ?? 'Request failed');
  }
  return data;
}

export interface CandidateQuestion {
  id: string
  type: AssessmentQuestionType
  prompt: string
  instructions?: string | null
  position: number
  required: boolean
  points: number
  options: { id: string; label: string; sortOrder: number }[]
}

export interface CandidateSessionView {
  sessionId: string
  status: AssessmentSessionStatus
  attemptNumber: number
  assessment: { name: string; description?: string | null; instructions?: string | null; durationMinutes?: number | null; versionNumber: number; questionCount: number }
  questions: CandidateQuestion[]
  responses: { id: string; questionId: string; selectedOptionIds: string[]; textAnswer?: string | null; updatedAt: string }[]
  serverNow: string
  startedAt?: string | null
  expiresAt?: string | null
  remainingSeconds?: number | null
}

export async function verifyAssessmentCode(code: string) {
  const data = await candidateRequest<{ token: string; session: { sessionId: string; status: string; assessmentName: string } }>('/public/assessments/verify-code', { method: 'POST', body: { code } });
  setCandidateAssessmentToken(data.token);
  return data;
}

export async function getCandidateSession(token?: string) {
  return candidateRequest<CandidateSessionView>('/public/assessments/session', { token });
}

export async function startCandidateSession(token?: string) {
  return candidateRequest<CandidateSessionView>('/public/assessments/start', { method: 'POST', token });
}

export async function saveCandidateResponse(input: { questionId: string; selectedOptionIds?: string[]; textAnswer?: string; baseUpdatedAt?: string }, token?: string) {
  return candidateRequest<{ saved: boolean; response: { id: string; questionId: string; selectedOptionIds: string[]; textAnswer?: string | null; updatedAt: string } }>('/public/assessments/responses', { method: 'PUT', body: input, token });
}

export async function submitCandidateSession(token?: string) {
  return candidateRequest<{ submitted: boolean; deduplicated: boolean; session: { id: string; status: string; submittedAt?: string | null } }>('/public/assessments/submit', { method: 'POST', token });
}

export async function getCandidateStatus(token?: string) {
  return candidateRequest<{ sessionId: string; status: AssessmentSessionStatus; startedAt?: string | null; submittedAt?: string | null; expiresAt?: string | null; serverNow: string; remainingSeconds?: number | null }>('/public/assessments/status', { token });
}
