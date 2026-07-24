import { apiRequest } from "./client"
import type { CompanyProfileResponse, CompanyMember, DepartmentDto } from "./types"

export async function getCompanyProfile(): Promise<CompanyProfileResponse> {
  return apiRequest<CompanyProfileResponse>("/company")
}

export interface UpdateCompanyProfileRequest {
  name?: string
  website?: string
  description?: string
  industry?: string
  companySize?: string
  size?: string
  city?: string
  location?: string
  logo?: string
}

export async function updateCompanyProfile(dto: UpdateCompanyProfileRequest): Promise<CompanyProfileResponse> {
  return apiRequest<CompanyProfileResponse>("/company", {
    method: "PATCH",
    body: dto,
  })
}

export interface CompanySettingsResponse {
  id: string
  companyId: string
  requireEmailVerification: boolean
  allowCustomRoles: boolean
  allowCandidateDataExport: boolean
  defaultApplicationRetentionDays: number
  defaultInterviewDurationMinutes: number
  defaultInterviewTimezone: string
  defaultInterviewLanguage: string
  aiScreeningEnabled: boolean
  aiInterviewEnabled: boolean
  recruiterOverrideRequired: boolean
  notifyRecruiterOnNewApplication: boolean
  notifyCandidateOnStatusChange: boolean
  emailSenderName: string | null
  emailReplyTo: string | null
  brandPrimaryColor: string | null
  brandSecondaryColor: string | null
  dataRetentionEnabled: boolean
  candidateDataRetentionDays: number | null
  interviewRecordingRetentionDays: number | null
  createdAt: string
  updatedAt: string
}

export async function getCompanySettings(): Promise<CompanySettingsResponse> {
  return apiRequest<CompanySettingsResponse>("/company/settings")
}

export interface UpdateCompanySettingsRequest {
  requireEmailVerification?: boolean
  allowCustomRoles?: boolean
  allowCandidateDataExport?: boolean
  defaultApplicationRetentionDays?: number
  defaultInterviewDurationMinutes?: number
  defaultInterviewTimezone?: string
  defaultInterviewLanguage?: string
  aiScreeningEnabled?: boolean
  aiInterviewEnabled?: boolean
  recruiterOverrideRequired?: boolean
  notifyRecruiterOnNewApplication?: boolean
  notifyCandidateOnStatusChange?: boolean
  emailSenderName?: string | null
  emailReplyTo?: string | null
  brandPrimaryColor?: string | null
  brandSecondaryColor?: string | null
  dataRetentionEnabled?: boolean
  candidateDataRetentionDays?: number | null
  interviewRecordingRetentionDays?: number | null
}

export async function updateCompanySettings(dto: UpdateCompanySettingsRequest): Promise<CompanySettingsResponse> {
  return apiRequest<CompanySettingsResponse>("/company/settings", {
    method: "PATCH",
    body: dto,
  })
}

export async function getCompanyMembers(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
}): Promise<{ items: CompanyMember[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  return apiRequest("/company/members", { params })
}

export async function getDepartments(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
}): Promise<{ data: DepartmentDto[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  return apiRequest("/departments", { params })
}
