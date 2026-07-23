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
