export interface CompanyWithRelations {
  id: string;
  name: string;
  slug: string;
  status: string;
  emailDomain?: string | null;
  logoUrl?: string | null;
  country?: string | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  legalName?: string | null;
  registrationNumber?: string | null;
  taxNumber?: string | null;
  industry?: string | null;
  companySize?: string | null;
  website?: string | null;
  phone?: string | null;
  supportEmail?: string | null;
  description?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateOrProvince?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  defaultLanguage: string;
  dateFormat: string;
  timeFormat: string;
  currencyCode?: string | null;
  recruitmentEmail?: string | null;
  logoFileId?: string | null;
  coverImageFileId?: string | null;
  onboardingCompletedAt?: Date | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  [key: string]: unknown;
}

export interface SettingsResponse {
  id: string;
  companyId: string;
  requireEmailVerification: boolean;
  allowCustomRoles: boolean;
  allowCandidateDataExport: boolean;
  defaultApplicationRetentionDays: number;
  defaultInterviewDurationMinutes: number;
  defaultInterviewTimezone: string;
  defaultInterviewLanguage: string;
  aiScreeningEnabled: boolean;
  aiInterviewEnabled: boolean;
  recruiterOverrideRequired: boolean;
  notifyRecruiterOnNewApplication: boolean;
  notifyCandidateOnStatusChange: boolean;
  emailSenderName?: string | null;
  emailReplyTo?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  dataRetentionEnabled: boolean;
  candidateDataRetentionDays?: number | null;
  interviewRecordingRetentionDays?: number | null;
  updatedByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipWithRelations {
  id: string;
  userId: string;
  companyId: string;
  roleId: string;
  status: string;
  jobTitle?: string | null;
  invitedByUserId?: string | null;
  invitedAt?: Date | null;
  joinedAt?: Date | null;
  lastActiveAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
    status: string;
  } | null;
  role?: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    isSystem: boolean;
  } | null;
  departmentMemberships?: Array<{
    id: string;
    departmentId: string;
    isPrimary: boolean;
    department: {
      id: string;
      name: string;
      code?: string | null;
    };
  }> | null;
}

export function toCompanyResponse(company: CompanyWithRelations) {
  const { deletedAt: _deletedAt, ...safe } = company;
  return safe;
}

export function toSettingsResponse(settings: SettingsResponse) {
  return settings;
}

export function toMemberResponse(membership: MembershipWithRelations) {
  return {
    id: membership.id,
    userId: membership.userId,
    companyId: membership.companyId,
    roleId: membership.roleId,
    status: membership.status,
    jobTitle: membership.jobTitle,
    invitedByUserId: membership.invitedByUserId,
    invitedAt: membership.invitedAt,
    joinedAt: membership.joinedAt,
    lastActiveAt: membership.lastActiveAt,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    user: membership.user
      ? {
          id: membership.user.id,
          email: membership.user.email,
          firstName: membership.user.firstName,
          lastName: membership.user.lastName,
          avatarUrl: membership.user.avatarUrl,
          status: membership.user.status,
        }
      : null,
    role: membership.role
      ? {
          id: membership.role.id,
          code: membership.role.code,
          name: membership.role.name,
          description: membership.role.description,
          isSystem: membership.role.isSystem,
        }
      : null,
    departments: membership.departmentMemberships
      ? membership.departmentMemberships.map((dm) => ({
          id: dm.id,
          departmentId: dm.departmentId,
          isPrimary: dm.isPrimary,
          department: dm.department,
        }))
      : [],
  };
}
