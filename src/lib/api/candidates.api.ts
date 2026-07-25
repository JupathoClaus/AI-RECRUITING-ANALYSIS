import { apiRequest } from "./client"
import type { PaginationMeta } from "./types"
import type {
  Candidate,
  CandidateStatus,
  ApplicationStatus,
  DisplayApplicationStatus,
  CandidateCompanyProfile,
  CandidateApplicationSummary,
  CandidateApplicationInfo,
} from "@/types"

// ── Candidate API types (from GET /candidates) ─────────────────────

export interface CandidateApiSkill {
  id: string
  skillId: string
  name: string
  proficiencyLevel: string | null
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

// ── Simple query params ────────────────────────────────────────────

export interface CandidateQueryParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: "asc" | "desc"
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
    } as Record<string, string | number | undefined>,
  })
}

export async function fetchCandidateById(candidateId: string): Promise<CandidateApiDetail> {
  return apiRequest<CandidateApiDetail>(`/candidates/${candidateId}`)
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

export async function createCandidate(dto: CreateCandidateRequest): Promise<CandidateApiDetail> {
  return apiRequest<CandidateApiDetail>("/candidates", {
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
    aiScore: 0,
    status: mapCandidateApiStatus(api.status),
    source: api.source || undefined,
    createdAt: parseDate(api.createdAt),
    updatedAt: parseDate(api.updatedAt),
    companyProfile,
    applicationSummary: appInfo,
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
