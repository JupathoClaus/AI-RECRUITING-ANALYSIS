import { apiRequest } from "./client"
import type { JobListDto, PaginationMeta, EmploymentType, JobStatus, WorkplaceType, ExperienceLevel } from "./types"

export interface JobListParams {
  page?: number
  limit?: number
  search?: string
  status?: JobStatus[]
  employmentType?: EmploymentType[]
  departmentId?: string[]
  locationId?: string[]
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export interface JobListResponse {
  data: JobListDto[]
  meta: PaginationMeta
}

export interface CreateJobRequest {
  title: string
  employmentType: EmploymentType
  workplaceType: WorkplaceType
  experienceLevel: ExperienceLevel
  description: string
  departmentId?: string
  locationId?: string
  responsibilities?: string
  qualifications?: string
  numberOfOpenings?: number
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  visibility?: string
}

export async function getJobs(params?: JobListParams): Promise<JobListResponse> {
  return apiRequest<JobListResponse>("/jobs", {
    params: params as Record<string, string | number | undefined>,
  })
}

export async function getJobById(jobId: string): Promise<JobListDto> {
  return apiRequest<JobListDto>(`/jobs/${jobId}`)
}

export async function createJob(dto: CreateJobRequest): Promise<JobListDto> {
  return apiRequest<JobListDto>("/jobs", {
    method: "POST",
    body: dto,
  })
}

export interface UpdateJobRequest {
  title?: string
  description?: string
  employmentType?: EmploymentType
  workplaceType?: WorkplaceType
  experienceLevel?: ExperienceLevel
  departmentId?: string
  locationId?: string
  responsibilities?: string
  qualifications?: string
  numberOfOpenings?: number
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  visibility?: string
  expectedVersion?: number
}

export async function updateJob(jobId: string, dto: UpdateJobRequest): Promise<JobListDto> {
  return apiRequest<JobListDto>(`/jobs/${jobId}`, {
    method: "PATCH",
    body: dto,
  })
}

export async function publishJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/publish`, { method: "POST" })
}

export async function closeJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/close`, { method: "POST" })
}

export async function reopenJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/reopen`, { method: "POST" })
}

export async function pauseJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/pause`, { method: "POST" })
}

export async function resumeJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/resume`, { method: "POST" })
}

export async function archiveJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/archive`, { method: "POST" })
}

export async function deleteJob(jobId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}`, { method: "DELETE" })
}

export interface PipelineStageDto {
  id: string
  name: string
  type: string
  description: string | null
  sortOrder: number
  required: boolean
  autoAdvanceEnabled: boolean
  requiresRecruiterApproval: boolean
  slaHours: number | null
  interviewType: string | null
  assessmentTemplateId: string | null
  configuration: Record<string, unknown> | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface JobPipelineDto {
  id: string
  jobId: string
  stages: PipelineStageDto[]
}

export interface JobActivityItem {
  id: string
  eventType: string
  description: string | null
  occurredAt: string
  metadata: Record<string, unknown> | null
}

export interface JobActivityResponse {
  data: JobActivityItem[]
  meta: PaginationMeta
}

export interface CreatePipelineStageRequest {
  name: string
  type: string
  description?: string
  sortOrder: number
  required?: boolean
  autoAdvanceEnabled?: boolean
  requiresRecruiterApproval?: boolean
  slaHours?: number
  interviewType?: string
  assessmentTemplateId?: string
  configuration?: Record<string, unknown>
}

export interface UpdatePipelineStageRequest {
  name?: string
  type?: string
  description?: string
  sortOrder?: number
  required?: boolean
  autoAdvanceEnabled?: boolean
  requiresRecruiterApproval?: boolean
  slaHours?: number
  interviewType?: string
  assessmentTemplateId?: string
  configuration?: Record<string, unknown>
}

export interface ReorderStagesRequest {
  items: { id: string; sortOrder: number }[]
}

export async function getJobPipeline(jobId: string): Promise<JobPipelineDto> {
  return apiRequest<JobPipelineDto>(`/jobs/${jobId}/pipeline`)
}

export interface JobAnalyticsStageCount {
  stageId: string
  name: string
  count: number
}

export interface JobAnalyticsResponse {
  jobId: string
  numberOfOpenings: number
  applications: {
    total: number
    active: number
    byStatus: Record<string, number>
    byStage: JobAnalyticsStageCount[]
  }
  screening: {
    total: number
    completed: number
    failed: number
    pending: number
    scored: number
    averageScore: number | null
    byRecommendation: { SHORTLIST: number; NOT_SHORTLIST: number; HUMAN_REVIEW: number }
  }
  interviews: {
    total: number
    upcoming: number
    byStatus: Record<string, number>
    byResult: Record<string, number>
  }
  aiInterviews: {
    total: number
    byStatus: Record<string, number>
  }
  timeToHireDays: number | null
  generatedAt: string
}

export async function getJobAnalytics(jobId: string): Promise<JobAnalyticsResponse> {
  return apiRequest<JobAnalyticsResponse>(`/jobs/${jobId}/analytics`)
}

export async function getJobActivity(jobId: string, params?: { page?: number; limit?: number }): Promise<JobActivityResponse> {
  return apiRequest<JobActivityResponse>(`/jobs/${jobId}/activity`, {
    params: params as Record<string, string | number | undefined>,
  })
}

export async function createPipelineStage(jobId: string, dto: CreatePipelineStageRequest): Promise<PipelineStageDto> {
  return apiRequest<PipelineStageDto>(`/jobs/${jobId}/pipeline/stages`, { method: "POST", body: dto })
}

export async function updatePipelineStage(jobId: string, stageId: string, dto: UpdatePipelineStageRequest): Promise<PipelineStageDto> {
  return apiRequest<PipelineStageDto>(`/jobs/${jobId}/pipeline/stages/${stageId}`, { method: "PATCH", body: dto })
}

export async function deletePipelineStage(jobId: string, stageId: string): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/pipeline/stages/${stageId}`, { method: "DELETE" })
}

export async function reorderPipelineStages(jobId: string, dto: ReorderStagesRequest): Promise<void> {
  return apiRequest<void>(`/jobs/${jobId}/pipeline/reorder`, { method: "POST", body: dto })
}
