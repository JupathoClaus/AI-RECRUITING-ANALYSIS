import { apiRequest } from "./client"
import type { CompanyProfileResponse, CompanyMember, DepartmentDto } from "./types"

export async function getCompanyProfile(): Promise<CompanyProfileResponse> {
  return apiRequest<CompanyProfileResponse>("/company")
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
