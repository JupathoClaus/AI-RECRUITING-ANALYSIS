export interface ApiResponse<T> {
  statusCode: number
  message: string
  data: T
  meta?: PaginationMeta
  timestamp: string
  path: string
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  statusCode: number
  errorCode: string
  message: string
  timestamp: string
  path: string
  requestId: string
  stack?: string
}

export interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

export interface LoginResponse {
  tokens: {
    accessToken: string
    refreshToken: string
  }
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    status: string
    timezone: string | null
  }
  activeCompany: ActiveCompanyDto | null
  role: string
  permissions: string[]
  sessionId: string
}

export interface ActiveCompanyDto {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  status: string
}

export interface MeResponse {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    phone: string | null
    avatarUrl: string | null
    status: string
    timezone: string | null
    preferredLocale: string | null
    createdAt: string
    emailVerifiedAt: string | null
    lastLoginAt: string | null
    passwordChangedAt: string | null
  }
  company: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    status: string
  } | null
  role: string | null
  permissions: string[]
}

export interface RegisterCompanyRequest {
  companyName: string
  email: string
  firstName: string
  lastName: string
  password: string
  passwordConfirmation: string
  acceptTerms: boolean
}

export interface RegisterCompanyResponse {
  success: boolean
  message: string
  userId: string
  companyId: string
  membershipId: string
  verificationRequired: boolean
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export interface JobCompanyMembershipRef {
  id: string
  user: { id: string; firstName: string; lastName: string; email: string }
}

export interface JobDepartmentRef {
  id: string
  name: string
  code: string
}

export interface JobLocationRef {
  id: string
  name: string
  city: string
  countryCode: string
}

export interface JobListDto {
  id: string
  jobCode: string
  title: string
  slug: string
  department: JobDepartmentRef | null
  location: JobLocationRef | null
  employmentType: EmploymentType
  workplaceType: WorkplaceType
  experienceLevel: ExperienceLevel
  status: JobStatus
  visibility: string
  approvalStatus: string
  publicationStatus: string
  description: string
  responsibilities: string | null
  qualifications: string | null
  numberOfOpenings: number
  salaryCurrency: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryVisible: boolean
  applicationDeadline: string | null
  owner: JobCompanyMembershipRef | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  _count: { collaborators: number; screeningQuestions: number; skills: number }
}

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "TEMPORARY" | "INTERNSHIP" | "VOLUNTEER" | "FREELANCE" | "APPRENTICESHIP" | "OTHER"
export type WorkplaceType = "ON_SITE" | "REMOTE" | "HYBRID" | "FLEXIBLE"
export type ExperienceLevel = "ENTRY" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "MANAGER" | "DIRECTOR" | "EXECUTIVE" | "NOT_SPECIFIED"
export type JobStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "PAUSED" | "CLOSED" | "FILLED" | "CANCELLED" | "ARCHIVED"

export interface CompanyProfileResponse {
  id: string
  name: string
  slug: string
  status: string
  emailDomain: string | null
  logoUrl: string | null
  country: string | null
  timezone: string | null
  createdAt: string
  updatedAt: string
  legalName: string | null
  registrationNumber: string | null
  taxNumber: string | null
  industry: string | null
  companySize: string | null
  website: string | null
  phone: string | null
  supportEmail: string | null
  description: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  stateOrProvince: string | null
  postalCode: string | null
  countryCode: string | null
  defaultLanguage: string | null
  dateFormat: string | null
  timeFormat: string | null
  currencyCode: string | null
  recruitmentEmail: string | null
  onboardingCompletedAt: string | null
  primaryLocation: CompanyLocation | null
  memberCount: number
  departmentCount: number
  onboardingCompleted: boolean
}

export interface CompanyLocation {
  id: string
  name: string
  city: string
  stateOrProvince: string | null
  countryCode: string
  isPrimary: boolean
}

export interface CompanyMember {
  id: string
  userId: string
  companyId: string
  roleId: string
  status: string
  jobTitle: string | null
  invitedAt: string | null
  joinedAt: string | null
  lastActiveAt: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    status: string
  }
  role: {
    id: string
    code: string
    name: string
    description: string
    isSystem: boolean
  }
  departments: {
    id: string
    departmentId: string
    isPrimary: boolean
    department: {
      id: string
      name: string
      code: string
    }
  }[]
}

export interface DepartmentDto {
  id: string
  name: string
  code: string | null
  description: string | null
  parentDepartmentId: string | null
  managerMembershipId: string | null
  status: string
  sortOrder: number
  _count: { departmentMemberships: number }
  openPositions?: number
  parentDepartment: { id: string; name: string } | null
  managerMembership: {
    id: string
    user: { id: string; firstName: string; lastName: string; email: string }
  } | null
}
