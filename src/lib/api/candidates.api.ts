import { apiRequest, ApiErrorResponse } from "./client"
import type { PaginationMeta } from "./types"
import type {
  Candidate,
  CandidateStatus,
  ApplicationStatus,
  DisplayApplicationStatus,
  CandidateCompanyProfile,
  CandidateApplicationSummary,
  CandidateApplicationInfo,
  CandidateScreeningSummary,
} from "@/types"

// ── Candidate API types (from GET /candidates) ─────────────────────

export interface CandidateApiSkill {
  id: string
  skillId: string
  name: string
  proficiencyLevel: string | null
}

export interface CandidateApiScreeningSummary {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null
  overallScore: number | null
  recommendation: "SHORTLIST" | "NOT_SHORTLIST" | "HUMAN_REVIEW" | null
  confidence: "LOW" | "MEDIUM" | "HIGH" | null
  resultId: string | null
  completedAt: string | null
  pendingRerun: boolean
  failedRerun: boolean
}

export interface CandidateApiListItem {
  id: string
  firstName: string
  lastName: string
  displayName: string
  city: string | null
  headline: string | null
  currentJobTitle: string | null
  currentEmployer: string | null
  totalExperienceYears: number | null
  status: string
  source: string
  skillSummary: CandidateApiSkill[]
  preferredInterviewLanguage: string | null
  screening?: CandidateApiScreeningSummary | null
  companyProfile?: { rating: number | null }
  email?: string
  phone?: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface CandidateListApiResponse {
  data: CandidateApiListItem[]
  meta: PaginationMeta
}

export interface CandidateApiEmployment {
  id: string
  type: string
  companyName: string
  jobTitle: string
  location: string | null
  startDate: string | null
  endDate: string | null
  currentlyWorking: boolean | null
  description: string | null
  sortOrder: number | null
}

export interface CandidateApiEducation {
  id: string
  institution: string
  level: string
  fieldOfStudy: string | null
  status: string
  startDate: string | null
  endDate: string | null
  grade: string | null
  sortOrder: number | null
}

export interface CandidateApiDetail {
  id: string
  firstName: string
  lastName: string
  displayName: string
  city: string | null
  headline: string | null
  summary: string | null
  currentJobTitle: string | null
  currentEmployer: string | null
  totalExperienceYears: number | null
  status: string
  source: string
  email?: string
  phone?: string
  skills: CandidateApiSkill[]
  employment: CandidateApiEmployment[]
  education: CandidateApiEducation[]
  languages: { id: string; languageCode: string; proficiency: string; preferredInterviewLanguage: boolean }[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface CandidateActivityItem {
  id: string
  eventType: string
  description: string | null
  occurredAt: string
}

export interface CandidateActivityResponse {
  data: CandidateActivityItem[]
  meta: PaginationMeta
}

// ── Simple query params ────────────────────────────────────────────

export interface CandidateQueryParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: "asc" | "desc"
  /** Filter to candidates whose current application is for this job. */
  jobId?: string
  /**
   * Filter to candidates whose current application status is in this list.
   * Mirrors the server's current-application selection rule.
   */
  applicationStatus?: ApplicationStatus[]
  /** Minimum company rating (1-5). */
  minRating?: number
  /** Exact company rating (1-5). */
  exactRating?: number
  /** Only candidates with no recorded company rating. */
  unrated?: boolean
}

// ── Candidate API functions ────────────────────────────────────────

export async function fetchCandidates(params?: CandidateQueryParams): Promise<CandidateListApiResponse> {
  return apiRequest<CandidateListApiResponse>("/candidates", {
    params: {
      page: params?.page,
      limit: params?.limit,
      search: params?.search,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
      jobId: params?.jobId,
      applicationStatus: params?.applicationStatus,
      minRating: params?.minRating,
      exactRating: params?.exactRating,
      unrated: params?.unrated ? "true" : undefined,
    } as Record<string, string | number | string[] | undefined>,
  })
}

export interface ScoreSummaryTopCandidate {
  candidateId: string
  displayName: string
  currentJobTitle: string | null
  jobTitle: string | null
  status: string | null
  overallScore: number
}

export interface CandidateAttentionCounts {
  newApplications: number
  awaitingScreening: number
  interviewsToday: number
}

export interface CandidateScoreSummary {
  totalCandidates: number
  scoredCandidates: number
  averageScore: number | null
  topCandidates: ScoreSummaryTopCandidate[]
  // Tenant-wide attention counts (whole company, not the paged candidate list).
  // Optional for backward compatibility with older responses.
  attention?: CandidateAttentionCounts
}

// Whole-company AI screening aggregate (GET /candidates/score-summary).
// The dashboard uses this instead of averaging only the first page of
// candidates, so the average and top candidates always cover the whole
// tenant without an unbounded browser list fetch.
export async function fetchCandidatesScoreSummary(): Promise<CandidateScoreSummary> {
  return apiRequest<CandidateScoreSummary>("/candidates/score-summary")
}

export async function fetchCandidateById(candidateId: string): Promise<CandidateApiDetail> {
  return apiRequest<CandidateApiDetail>(`/candidates/${candidateId}`)
}

export async function fetchCandidateActivity(candidateId: string, params?: { page?: number; limit?: number }): Promise<CandidateActivityResponse> {
  return apiRequest<CandidateActivityResponse>(`/candidates/${candidateId}/activity`, {
    params: params as Record<string, string | number | undefined>,
  })
}

export interface CreateCandidateRequest {
  firstName: string
  lastName: string
  email: string
  phone?: string
  source: string
  currentJobTitle?: string
  totalExperienceYears?: number
}

export async function createCandidate(dto: CreateCandidateRequest, idempotencyKey?: string): Promise<CandidateApiDetail> {
  return apiRequest<CandidateApiDetail>("/candidates", {
    method: "POST",
    body: dto,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  })
}

// ── Atomic recruiter Add-Candidate workflow ──────────────────────────────
// One request creates (or reuses) the candidate, creates the application,
// stores the resume and queues resume extraction. Idempotent under the
// Idempotency-Key header: retrying the exact same request is always safe.
export interface RecruiterWorkflowRequest {
  firstName: string
  lastName: string
  email: string
  phone?: string
  totalExperienceYears?: number
  jobId: string
}

export interface RecruiterWorkflowResult {
  candidateId: string
  candidateCreated: boolean
  applicationId: string
  applicationNumber: string
  applicationStatus: string
  stageId: string | null
  stageName: string | null
  jobId: string
  jobTitle: string
  storedFileId: string | null
  extraction: { id: string; status: string } | null
}

export async function createCandidateWorkflow(
  dto: RecruiterWorkflowRequest,
  resumeFile: File,
  idempotencyKey?: string,
): Promise<RecruiterWorkflowResult> {
  const formData = new FormData()
  formData.append("firstName", dto.firstName)
  formData.append("lastName", dto.lastName)
  formData.append("email", dto.email)
  if (dto.phone) formData.append("phone", dto.phone)
  if (dto.totalExperienceYears !== undefined) formData.append("totalExperienceYears", String(dto.totalExperienceYears))
  formData.append("jobId", dto.jobId)
  formData.append("file", resumeFile)
  return apiRequest<RecruiterWorkflowResult>("/candidates/recruiter-workflow", {
    method: "POST",
    body: formData,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    // Includes a binary resume upload through the dev proxy — needs more
    // headroom than a JSON create, but never blocks on extraction.
    timeoutMs: 120000,
  })
}

// ── Product-safe error messages for the Add Candidate workflow ──────────

export interface WorkflowErrorCopy {
  title: string
  detail: string
  retryable: boolean
}

export function describeWorkflowError(err: unknown): WorkflowErrorCopy {
  if (err instanceof ApiErrorResponse) {
    const code = err.errorCode
    const retryable = err.statusCode === 408 || err.statusCode === 429 || err.statusCode >= 500
    switch (code) {
      case "REQUEST_TIMEOUT":
        return {
          title: "The request took too long",
          detail: "Retrying is safe — nothing will be duplicated. If the candidate was already created, the retry will simply return the existing candidate.",
          retryable: true,
        }
      case "IDEMPOTENCY_IN_PROGRESS":
        return {
          title: "Still working",
          detail: "The previous request for this candidate is still being processed. Wait a moment, then retry.",
          retryable: true,
        }
      case "APPLICATION_DUPLICATE":
        return {
          title: "Already applied",
          detail: "This candidate already has an active application for this job. No duplicate was created.",
          retryable: false,
        }
      case "APPLICATION_JOB_NOT_ACCEPTING":
        return {
          title: "Job is not accepting applications",
          detail: "This job is no longer accepting applications. Pick another position.",
          retryable: false,
        }
      case "APPLICATION_DEADLINE_PASSED":
        return {
          title: "Application deadline passed",
          detail: "This job's application deadline has passed. Pick another position.",
          retryable: false,
        }
      case "APPLICATION_NOT_FOUND":
        return {
          title: "Job not found",
          detail: "The selected job could not be found. Pick another position.",
          retryable: false,
        }
      case "FILE_REQUIRED":
      case "FILE_EMPTY":
        return {
          title: "Resume file is missing",
          detail: "Select a resume file (PDF or DOCX) and try again.",
          retryable: true,
        }
      case "FILE_TOO_LARGE":
        return {
          title: "Resume file is too large",
          detail: "The maximum resume size is 10 MB. Use a smaller file and try again.",
          retryable: true,
        }
      case "FILE_EXTENSION_MISSING":
      case "FILE_EXTENSION_NOT_ALLOWED":
        return {
          title: "Unsupported file type",
          detail: "Only PDF and DOCX resumes are accepted.",
          retryable: true,
        }
      case "FILE_TYPE_NOT_ALLOWED":
        return {
          title: "Unsupported file format",
          detail: "The file's format does not match a PDF or DOCX resume.",
          retryable: true,
        }
      case "FILE_SIGNATURE_MISMATCH":
        return {
          title: "The file does not look like a valid document",
          detail: "The file may be corrupted or renamed. Use a real PDF or DOCX resume.",
          retryable: true,
        }
      case "FILE_TOO_SMALL":
        return {
          title: "The file is too small to be a resume",
          detail: "The selected file looks empty. Choose a valid resume file.",
          retryable: true,
        }
      default:
        return {
          title: "We couldn't finish adding this candidate",
          detail: retryable
            ? `${err.message} — Retrying is safe and will not create duplicates.`
            : err.message,
          retryable,
        }
    }
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return {
        title: "The request was cancelled",
        detail: "Retrying is safe — nothing will be duplicated.",
        retryable: true,
      }
    }
    if (/failed to fetch|networkerror|load failed|err_internet/i.test(err.message)) {
      return {
        title: "Network problem",
        detail: "We couldn't reach the server. Check your connection and retry — nothing will be duplicated.",
        retryable: true,
      }
    }
  }
  return {
    title: "We couldn't finish adding this candidate",
    detail: "Retrying is safe and will not create duplicates.",
    retryable: true,
  }
}

export interface DeleteCandidateRequest {
  expectedVersion: number
  reason?: string
}

export interface DeleteCandidateResponse {
  deleted: boolean
  status?: string
  version?: number
}

/** Soft-delete a candidate: removed from active UI, reports and metrics. */
export async function deleteCandidate(
  candidateId: string,
  dto: DeleteCandidateRequest,
): Promise<DeleteCandidateResponse> {
  return apiRequest<DeleteCandidateResponse>(`/candidates/${candidateId}/delete`, {
    method: "POST",
    body: dto,
  })
}

// ── Status mapping ─────────────────────────────────────────────────

const TERMINAL_STATUSES: ApplicationStatus[] = ["HIRED", "REJECTED", "WITHDRAWN", "DISQUALIFIED"]

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function isActiveStatus(status: ApplicationStatus): boolean {
  return !isTerminalStatus(status) && status !== "ARCHIVED"
}

const DISPLAY_STATUS_MAP: Record<ApplicationStatus, DisplayApplicationStatus> = {
  DRAFT: "Applied",
  SUBMITTED: "Applied",
  UNDER_REVIEW: "Screening",
  SCREENING: "Screening",
  SHORTLISTED: "Screening",
  ASSESSMENT: "Interview",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Rejected",
  DISQUALIFIED: "Rejected",
  ON_HOLD: "Applied",
  ARCHIVED: "Applied",
}

export function mapToDisplayStatus(status: ApplicationStatus): DisplayApplicationStatus {
  return DISPLAY_STATUS_MAP[status] || "Applied"
}

// Inverse of DISPLAY_STATUS_MAP, used to send a table "Status" filter to the
// server as the set of ApplicationStatus values it maps to. ARCHIVED is
// deliberately excluded from "Applied": the table's current application is
// always the newest active pipeline application, never an archived one.
const DISPLAY_STATUS_TO_APPLICATION_STATUSES: Record<DisplayApplicationStatus, ApplicationStatus[]> = {
  Applied: ["DRAFT", "SUBMITTED", "ON_HOLD"],
  Screening: ["UNDER_REVIEW", "SCREENING", "SHORTLISTED"],
  Interview: ["ASSESSMENT", "INTERVIEW"],
  Offer: ["OFFER"],
  Hired: ["HIRED"],
  Rejected: ["REJECTED", "WITHDRAWN", "DISQUALIFIED"],
}

export function displayStatusToApplicationStatuses(display: DisplayApplicationStatus): ApplicationStatus[] {
  return DISPLAY_STATUS_TO_APPLICATION_STATUSES[display] ?? []
}

// ── Application selection rules ────────────────────────────────────

interface RawApplicationInput {
  id: string
  candidateId: string
  jobId: string
  jobTitle: string
  status: ApplicationStatus
  version: number
  stageId?: string
  stageName?: string
  createdAt: string
  updatedAt: string
}

function parseDate(value: string): Date {
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date(0) : d
}

export function selectCurrentApplication(applications: RawApplicationInput[]): RawApplicationInput | undefined {
  if (applications.length === 0) return undefined

  const sorted = [...applications].sort((a, b) => {
    const aUpdated = parseDate(a.updatedAt).getTime()
    const bUpdated = parseDate(b.updatedAt).getTime()
    if (aUpdated !== bUpdated) return bUpdated - aUpdated
    const aCreated = parseDate(a.createdAt).getTime()
    const bCreated = parseDate(b.createdAt).getTime()
    if (aCreated !== bCreated) return bCreated - aCreated
    return b.id.localeCompare(a.id)
  })

  const activeApps = sorted.filter((app) => isActiveStatus(app.status))
  if (activeApps.length > 0) return activeApps[0]

  return sorted[0]
}

export function selectLatestApplication(applications: RawApplicationInput[]): RawApplicationInput | undefined {
  if (applications.length === 0) return undefined

  return [...applications].sort((a, b) => {
    const aUpdated = parseDate(a.updatedAt).getTime()
    const bUpdated = parseDate(b.updatedAt).getTime()
    if (aUpdated !== bUpdated) return bUpdated - aUpdated
    const aCreated = parseDate(a.createdAt).getTime()
    const bCreated = parseDate(b.createdAt).getTime()
    if (aCreated !== bCreated) return bCreated - aCreated
    return b.id.localeCompare(a.id)
  })[0]
}

// ── Application summary builder ────────────────────────────────────

export interface ApplicationInput {
  id: string
  candidateId: string
  status: ApplicationStatus
  version: number
  createdAt: string
  updatedAt: string
  job?: { id: string; title: string } | null
  currentStage?: { id: string; name: string; type: string } | null
}

function buildApplicationSummary(app: RawApplicationInput): CandidateApplicationSummary {
  return {
    id: app.id,
    candidateId: app.candidateId,
    jobId: app.jobId,
    jobTitle: app.jobTitle,
    status: app.status,
    displayStatus: mapToDisplayStatus(app.status),
    stageId: app.stageId,
    stageName: app.stageName,
    version: app.version,
    createdAt: parseDate(app.createdAt),
    updatedAt: parseDate(app.updatedAt),
  }
}

export function buildApplicationInfo(applications: RawApplicationInput[]): CandidateApplicationInfo {
  const total = applications.length
  const active = applications.filter((app) => isActiveStatus(app.status)).length

  if (total === 0) {
    return { total: 0, active: 0 }
  }

  const current = selectCurrentApplication(applications)
  const latest = selectLatestApplication(applications)

  return {
    total,
    active,
    current: current ? buildApplicationSummary(current) : undefined,
    latest: latest ? buildApplicationSummary(latest) : undefined,
  }
}

// ── Candidate mappers ──────────────────────────────────────────────

export function mapCandidateFromApi(
  api: CandidateApiListItem,
  appInfo?: CandidateApplicationInfo,
  companyProfile?: CandidateCompanyProfile,
): Candidate {
  return {
    id: api.id,
    firstName: api.firstName,
    lastName: api.lastName,
    displayName: api.displayName,
    email: api.email || "",
    phone: api.phone || "",
    headline: api.headline || undefined,
    currentJobTitle: api.currentJobTitle || undefined,
    currentEmployer: api.currentEmployer || undefined,
    totalExperienceYears: api.totalExperienceYears ?? 0,
    skills: (api.skillSummary || []).map((s) => ({
      id: s.id,
      skillId: s.skillId,
      name: s.name,
      proficiencyLevel: s.proficiencyLevel,
    })),
    aiScore: api.screening?.overallScore ?? null,
    status: mapCandidateApiStatus(api.status),
    source: api.source || undefined,
    version: api.version,
    createdAt: parseDate(api.createdAt),
    updatedAt: parseDate(api.updatedAt),
    companyProfile:
      companyProfile ??
      (api.companyProfile != null
        ? { rating: api.companyProfile.rating ?? 0 }
        : undefined),
    applicationSummary: appInfo,
    screening: api.screening ? mapScreeningSummary(api.screening) : undefined,
  }
}

function mapScreeningSummary(
  api: CandidateApiScreeningSummary
): CandidateScreeningSummary {
  return {
    status: api.status,
    overallScore: api.overallScore,
    recommendation: api.recommendation,
    confidence: api.confidence,
    resultId: api.resultId,
    completedAt: api.completedAt,
    pendingRerun: api.pendingRerun,
    failedRerun: api.failedRerun,
  }
}

function mapCandidateApiStatus(status: string): CandidateStatus {
  switch (status) {
    case "ACTIVE": return "ACTIVE"
    case "INACTIVE": return "INACTIVE"
    case "BLOCKED": return "BLOCKED"
    default: return "ACTIVE"
  }
}
