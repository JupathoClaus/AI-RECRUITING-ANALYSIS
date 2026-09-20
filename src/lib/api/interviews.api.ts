import { apiRequest } from "./client"
import type { PaginationMeta } from "./types"

export type BackendInterviewType = "PHONE" | "VIDEO" | "ONSITE" | "TECHNICAL" | "HR" | "PANEL" | "FINAL" | "AI"
export type BackendInterviewStatus = "SCHEDULED" | "CONFIRMED" | "RESCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "EXPIRED"
export type BackendInterviewResult = "PASS" | "FAIL" | "HOLD" | "PENDING" | "NOT_RECORDED"
export type BackendParticipantRole = "INTERVIEWER" | "HIRING_MANAGER" | "RECRUITER" | "CANDIDATE" | "PANELIST" | "OBSERVER" | "NOTE_TAKER" | "COORDINATOR"
export type BackendParticipantStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "ATTENDED" | "NO_SHOW"

export interface InterviewParticipantRef {
  id: string
  role: BackendParticipantRole
  status: BackendParticipantStatus
  isRequired: boolean
  member: { id: string; name: string } | null
}

export interface InterviewStageRef {
  id: string
  name: string
  type: string
}

export interface InterviewListItem {
  id: string
  title: string
  type: BackendInterviewType
  status: BackendInterviewStatus
  result: BackendInterviewResult
  scheduledAt: string
  durationMinutes: number
  timezone: string
  location: string | null
  meetingProvider: string | null
  applicationId: string
  jobId: string
  stage: InterviewStageRef | null
  version: number
  participants: InterviewParticipantRef[]
  createdAt: string
  updatedAt: string
}

export interface InterviewListResponse {
  data: InterviewListItem[]
  meta: PaginationMeta
}

export interface InterviewApplicationRef {
  id: string
  applicationNumber: string
  status: string
  candidateId: string
}

export interface InterviewJobRef {
  id: string
  title: string
  jobCode: string
}

export interface InterviewHistoryEntry {
  id: string
  eventType: string
  description: string
  actorMembershipId: string | null
  occurredAt: string
}

export interface InterviewCreatorRef {
  id: string
  user: { id: string; firstName: string; lastName: string }
}

export interface InterviewDetail extends InterviewListItem {
  description: string | null
  notes: string | null
  privateNotes: string | null
  meetingLink: string | null
  meetingId: string | null
  completedAt: string | null
  cancelReason: string | null
  resultNotes: string | null
  resultReasonCode: string | null
  language: string
  application: InterviewApplicationRef | null
  job: InterviewJobRef | null
  history: InterviewHistoryEntry[]
  createdBy: InterviewCreatorRef | null
  updatedBy: InterviewCreatorRef | null
}

export interface InterviewQueryParams {
  page?: number
  limit?: number
  search?: string
  status?: BackendInterviewStatus[]
  type?: BackendInterviewType[]
  applicationId?: string
  jobId?: string
  stageId?: string
  scheduledFrom?: string
  scheduledTo?: string
  sortBy?: "scheduledAt" | "createdAt" | "updatedAt" | "status"
  sortOrder?: "asc" | "desc"
}

export interface CreateInterviewRequest {
  applicationId: string
  type: BackendInterviewType
  title: string
  scheduledAt: string
  durationMinutes: number
  timezone: string
  description?: string
  location?: string
  meetingProvider?: string
  meetingLink?: string
  meetingId?: string
  notes?: string
  privateNotes?: string
  language?: string
  jobPipelineStageId?: string
  participants?: {
    membershipId: string
    role: BackendParticipantRole
    isRequired?: boolean
    notes?: string
  }[]
}

export interface UpdateInterviewRequest {
  type?: BackendInterviewType
  title?: string
  description?: string
  location?: string
  meetingProvider?: string
  meetingLink?: string
  meetingId?: string
  notes?: string
  privateNotes?: string
  expectedVersion: number
}

export interface RescheduleInterviewRequest {
  scheduledAt: string
  durationMinutes?: number
  timezone?: string
  reason?: string
  location?: string
  meetingLink?: string
  meetingProvider?: string
  expectedVersion: number
}

export interface CancelInterviewRequest {
  reason?: string
  expectedVersion: number
}

export interface CompleteInterviewRequest {
  resultNotes?: string
  resultReasonCode?: string
  expectedVersion: number
}

export interface ConfirmInterviewRequest {
  expectedVersion: number
}

export interface RecordResultRequest {
  result: BackendInterviewResult
  resultNotes?: string
  expectedVersion: number
}

export async function fetchInterviews(params?: InterviewQueryParams): Promise<InterviewListResponse> {
  return apiRequest<InterviewListResponse>("/interviews", {
    params: {
      page: params?.page,
      limit: params?.limit,
      search: params?.search,
      status: params?.status,
      type: params?.type,
      applicationId: params?.applicationId,
      jobId: params?.jobId,
      stageId: params?.stageId,
      scheduledFrom: params?.scheduledFrom,
      scheduledTo: params?.scheduledTo,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    } as Record<string, string | number | undefined>,
  })
}

export async function fetchInterviewById(id: string): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}`)
}

export async function createInterview(dto: CreateInterviewRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>("/interviews", {
    method: "POST",
    body: dto,
  })
}

export async function updateInterview(id: string, dto: UpdateInterviewRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}`, {
    method: "PATCH",
    body: dto,
  })
}

export async function rescheduleInterview(id: string, dto: RescheduleInterviewRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}/reschedule`, {
    method: "POST",
    body: dto,
  })
}

export async function cancelInterview(id: string, dto: CancelInterviewRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}/cancel`, {
    method: "POST",
    body: dto,
  })
}

export async function completeInterview(id: string, dto: CompleteInterviewRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}/complete`, {
    method: "POST",
    body: dto,
  })
}

export async function startInterview(id: string, dto: { expectedVersion: number }): Promise<{ started: boolean }> {
  return apiRequest<{ started: boolean }>(`/interviews/${id}/start`, {
    method: "POST",
    body: dto,
  })
}

export async function confirmInterview(id: string, dto: ConfirmInterviewRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}/confirm`, {
    method: "POST",
    body: dto,
  })
}

export async function recordResult(id: string, dto: RecordResultRequest): Promise<InterviewDetail> {
  return apiRequest<InterviewDetail>(`/interviews/${id}/result`, {
    method: "POST",
    body: dto,
  })
}

export type FrontendInterviewStatus = "Scheduled" | "Completed" | "Cancelled"
export type FrontendInterviewType = "Video" | "Phone" | "On-site" | "AI" | "Technical"

const backendToFrontendStatus: Record<BackendInterviewStatus, FrontendInterviewStatus> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Scheduled",
  RESCHEDULED: "Scheduled",
  IN_PROGRESS: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Cancelled",
  EXPIRED: "Cancelled",
}

const backendToFrontendType: Record<BackendInterviewType, FrontendInterviewType> = {
  PHONE: "Phone",
  VIDEO: "Video",
  ONSITE: "On-site",
  TECHNICAL: "Technical",
  HR: "Video",
  PANEL: "On-site",
  FINAL: "Video",
  AI: "AI",
}

const frontendToBackendType: Record<FrontendInterviewType, BackendInterviewType> = {
  Video: "VIDEO",
  Phone: "PHONE",
  "On-site": "ONSITE",
  AI: "AI",
  Technical: "TECHNICAL",
}

// PASS/HOLD/FAIL is a recruiter-recorded outcome, not a numeric AI assessment.
// Never manufacture a score from it: downstream views use `undefined` to show
// the truthful outcome-only state until an assessment API exists.
function resultToScore(_result: BackendInterviewResult): number | undefined {
  return undefined
}

function extractCandidateName(participants: InterviewParticipantRef[]): string {
  const candidateParticipant = participants.find((p) => p.role === "CANDIDATE")
  if (candidateParticipant?.member?.name) return candidateParticipant.member.name
  return "Unknown Candidate"
}

export function mapInterviewListItem(
  item: InterviewListItem,
  jobsLookup: Map<string, string>,
): import("@/types").Interview {
  const jobTitle = jobsLookup.get(item.jobId) || ""
  return {
    id: item.id,
    candidateId: "",
    candidateName: extractCandidateName(item.participants),
    jobId: item.jobId,
    jobTitle,
    date: new Date(item.scheduledAt),
    scheduledAt: new Date(item.scheduledAt),
    duration: item.durationMinutes,
    status: backendToFrontendStatus[item.status],
    backendStatus: item.status,
    type: backendToFrontendType[item.type],
    result: item.result,
    score: resultToScore(item.result),
    version: item.version,
    applicationId: item.applicationId,
  }
}

export function mapFrontendToBackendType(type: FrontendInterviewType): BackendInterviewType {
  return frontendToBackendType[type]
}
