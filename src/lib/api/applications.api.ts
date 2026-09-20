import { apiRequest } from "./client"
import type { PaginationMeta } from "./types"
import type { ApplicationStatus } from "@/types"

// ── Application API types ──────────────────────────────────────────

export interface ApplicationCandidateRef {
  id: string
  firstName: string
  lastName: string
  displayName: string
  headline: string | null
}

export interface ApplicationJobRef {
  id: string
  title: string
  jobCode: string
}

export interface ApplicationCurrentStage {
  id: string
  name: string
  type: string
}

export interface ApplicationActiveFlag {
  id: string
  type: string
  severity: string
}

export interface ApplicationListItem {
  id: string
  applicationNumber: string
  status: ApplicationStatus
  source: string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  candidate: ApplicationCandidateRef | null
  job: ApplicationJobRef | null
  currentStage: ApplicationCurrentStage | null
  activeFlags: ApplicationActiveFlag[]
  screeningAnswerCount: number
  version: number
}

export interface ApplicationListResponse {
  data: ApplicationListItem[]
  meta: PaginationMeta
}

export interface ApplicationCompanyCandidateRef {
  id: string
  status: string
  rating: number | null
  talentPoolEnabled: boolean
  doNotContact: boolean
  tags: { id: string; tagId: string; name: string; color: string | null; type: string }[]
  owner: { id: string; user: { id: string; firstName: string; lastName: string } } | null
}

export interface ApplicationNote {
  id: string
  content: string
  visibility: string
  authorMembershipId: string
  createdAt: string
  editedAt: string | null
}

export interface ApplicationStageHistoryEntry {
  id: string
  stageId: string
  name: string
  occurredAt: string
}

export interface ApplicationDetail {
  id: string
  applicationNumber: string
  status: ApplicationStatus
  source: string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  version: number
  candidate: {
    id: string
    firstName: string
    lastName: string
    displayName: string
    email?: string
    phone?: string
    headline: string | null
    currentJobTitle: string | null
    totalExperienceYears: number | null
    skills: { id: string; skillId: string; name: string; proficiencyLevel: string | null }[]
  } | null
  job: ApplicationJobRef | null
  currentStage: ApplicationCurrentStage | null
  companyCandidate: ApplicationCompanyCandidateRef | null
  notes: ApplicationNote[]
  stageHistory: ApplicationStageHistoryEntry[]
}

// ── Query params ───────────────────────────────────────────────────

export interface ApplicationQueryParams {
  page?: number
  limit?: number
  search?: string
  candidateId?: string[]
  jobId?: string[]
  status?: ApplicationStatus[]
  stageId?: string[]
  source?: string[]
  submittedFrom?: string
  submittedTo?: string
  hasActiveFlags?: boolean
  archived?: boolean
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

// ── Application DTOs ───────────────────────────────────────────────

export interface CreateApplicationRequest {
  candidateId: string
  jobId: string
  source: string
  sourceDetail?: string
  ownerMembershipId?: string
}

export interface MoveApplicationRequest {
  expectedVersion: number
  toStageId?: string
  reasonCode?: string
}

export interface RejectApplicationRequest {
  expectedVersion: number
  reasonCode?: string
  reasonDetails?: string
}

export interface StatusVersionRequest {
  expectedVersion: number
}

// ── Application API functions ──────────────────────────────────────

export async function fetchApplications(params?: ApplicationQueryParams): Promise<ApplicationListResponse> {
  return apiRequest<ApplicationListResponse>("/applications", {
    params: {
      page: params?.page,
      limit: params?.limit,
      search: params?.search,
      candidateId: params?.candidateId,
      jobId: params?.jobId,
      status: params?.status,
      stageId: params?.stageId,
      source: params?.source,
      submittedFrom: params?.submittedFrom,
      submittedTo: params?.submittedTo,
      hasActiveFlags: params?.hasActiveFlags,
      archived: params?.archived,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    } as Record<string, string | number | undefined>,
  })
}

export async function fetchApplicationById(id: string): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>(`/applications/${id}`)
}

export async function fetchApplicationsByCandidate(candidateId: string, params?: { page?: number; limit?: number }): Promise<ApplicationListResponse> {
  return fetchApplications({ candidateId: [candidateId], ...params })
}

export async function createApplication(dto: CreateApplicationRequest, idempotencyKey?: string): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>("/applications", {
    method: "POST",
    body: dto,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  })
}

export async function rejectApplication(applicationId: string, dto: RejectApplicationRequest): Promise<void> {
  return apiRequest<void>(`/applications/${applicationId}/reject`, {
    method: "POST",
    body: dto,
  })
}

export async function shortlistApplication(applicationId: string, dto: StatusVersionRequest): Promise<void> {
  return apiRequest<void>(`/applications/${applicationId}/shortlist`, {
    method: "POST",
    body: dto,
  })
}

export async function moveApplication(applicationId: string, dto: MoveApplicationRequest): Promise<void> {
  return apiRequest<void>(`/applications/${applicationId}/move`, {
    method: "POST",
    body: dto,
  })
}

export async function markApplicationHired(applicationId: string, dto: StatusVersionRequest): Promise<void> {
  return apiRequest<void>(`/applications/${applicationId}/mark-hired`, {
    method: "POST",
    body: dto,
  })
}

export async function submitApplication(applicationId: string, dto: StatusVersionRequest & { consentConfirmed?: boolean }): Promise<void> {
  return apiRequest<void>(`/applications/${applicationId}/submit`, {
    method: "POST",
    body: dto,
  })
}
