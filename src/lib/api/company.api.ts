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
  city?: string
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

// ── Member management ──

export interface UpdateCompanyMemberRequest {
  jobTitle?: string
  roleId?: string
}

export interface CompanyMemberListResponse {
  items: CompanyMember[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export async function updateCompanyMember(membershipId: string, dto: UpdateCompanyMemberRequest): Promise<CompanyMember> {
  return apiRequest<CompanyMember>(`/company/members/${membershipId}`, {
    method: "PATCH",
    body: dto,
  })
}

export async function suspendCompanyMember(membershipId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/company/members/${membershipId}/suspend`, {
    method: "POST",
  })
}

export async function reactivateCompanyMember(membershipId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/company/members/${membershipId}/reactivate`, {
    method: "POST",
  })
}

export async function removeCompanyMember(membershipId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/company/members/${membershipId}`, {
    method: "DELETE",
  })
}

// ── Invitations ──

export interface CreateInvitationRequest {
  email: string
  roleId: string
  departmentId?: string
  jobTitle?: string
  expiresInDays?: number
}

export interface CompanyInvitationResponse {
  id: string
  companyId: string
  email: string
  roleId: string
  departmentId: string | null
  jobTitle: string | null
  invitedByUserId: string
  status: string
  expiresAt: string
  lastSentAt: string
  sendCount: number
  createdAt: string
  updatedAt: string
  role: { id: string; code: string; name: string }
  department: { id: string; name: string } | null
  invitedBy: { id: string; firstName: string; lastName: string; email: string }
}

export async function createInvitation(dto: CreateInvitationRequest): Promise<CompanyInvitationResponse> {
  return apiRequest<CompanyInvitationResponse>("/company/invitations", {
    method: "POST",
    body: dto,
  })
}

export async function getInvitations(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
}): Promise<{ items: CompanyInvitationResponse[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  return apiRequest("/company/invitations", { params })
}

export async function resendInvitation(invitationId: string): Promise<CompanyInvitationResponse> {
  return apiRequest<CompanyInvitationResponse>(`/company/invitations/${invitationId}/resend`, {
    method: "POST",
  })
}

export async function revokeInvitation(invitationId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/company/invitations/${invitationId}/revoke`, {
    method: "POST",
  })
}

// ── Department management ──

export interface CreateDepartmentRequest {
  name: string
  code?: string
  description?: string
  parentDepartmentId?: string
  managerMembershipId?: string
  sortOrder?: number
}

export interface UpdateDepartmentRequest {
  name?: string
  code?: string
  description?: string
  parentDepartmentId?: string
  managerMembershipId?: string
  sortOrder?: number
}

export async function createDepartment(dto: CreateDepartmentRequest): Promise<DepartmentDto> {
  return apiRequest<DepartmentDto>("/departments", {
    method: "POST",
    body: dto,
  })
}

export async function updateDepartment(departmentId: string, dto: UpdateDepartmentRequest): Promise<DepartmentDto> {
  return apiRequest<DepartmentDto>(`/departments/${departmentId}`, {
    method: "PATCH",
    body: dto,
  })
}

export async function archiveDepartment(departmentId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/departments/${departmentId}/archive`, {
    method: "POST",
  })
}

export async function restoreDepartment(departmentId: string): Promise<DepartmentDto> {
  return apiRequest<DepartmentDto>(`/departments/${departmentId}/restore`, {
    method: "POST",
  })
}

export async function deleteDepartment(departmentId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/departments/${departmentId}`, {
    method: "DELETE",
  })
}

// ── Roles & Permissions ──

export interface CompanyRoleResponse {
  id: string
  code: string
  name: string
  description: string | null
  scope: string
  isSystem: boolean
  _count?: { memberships: number }
  permissions?: { id: string; code: string; name: string; resource: string; action: string }[]
}

export interface CompanyPermissionResponse {
  id: string
  code: string
  name: string
  description: string | null
  resource: string
  action: string
}

export async function getCompanyRoles(): Promise<CompanyRoleResponse[]> {
  return apiRequest<CompanyRoleResponse[]>("/company/roles")
}

export async function getCompanyPermissions(): Promise<CompanyPermissionResponse[]> {
  return apiRequest<CompanyPermissionResponse[]>("/company/permissions")
}
