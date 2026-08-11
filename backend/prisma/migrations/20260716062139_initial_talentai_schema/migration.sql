-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'LOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'COMPANY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'COMPANY_INVITATION', 'EMAIL_CHANGE');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_REGISTERED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'LOGOUT', 'LOGOUT_ALL', 'TOKEN_REFRESHED', 'REFRESH_TOKEN_REUSE_DETECTED', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'EMAIL_VERIFICATION_SENT', 'EMAIL_VERIFIED', 'SESSION_REVOKED', 'ROLE_ASSIGNED', 'PERMISSION_DENIED', 'COMPANY_SELECTED');

-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('HEAD_OFFICE', 'BRANCH', 'REMOTE', 'CLIENT_SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OrganizationAuditEventType" AS ENUM ('COMPANY_PROFILE_UPDATED', 'COMPANY_SETTINGS_UPDATED', 'DEPARTMENT_CREATED', 'DEPARTMENT_UPDATED', 'DEPARTMENT_ARCHIVED', 'DEPARTMENT_RESTORED', 'LOCATION_CREATED', 'LOCATION_UPDATED', 'LOCATION_ARCHIVED', 'LOCATION_RESTORED', 'MEMBER_INVITED', 'INVITATION_RESENT', 'INVITATION_REVOKED', 'INVITATION_ACCEPTED', 'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REMOVED', 'MEMBER_DEPARTMENT_ASSIGNED', 'MEMBER_DEPARTMENT_REMOVED', 'ONBOARDING_COMPLETED', 'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'PAUSED', 'CLOSED', 'FILLED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobVisibility" AS ENUM ('INTERNAL', 'PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'VOLUNTEER', 'FREELANCE', 'APPRENTICESHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkplaceType" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'EXECUTIVE', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('NONE', 'SECONDARY', 'CERTIFICATE', 'DIPLOMA', 'ASSOCIATE', 'BACHELORS', 'MASTERS', 'DOCTORATE', 'PROFESSIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RequirementImportance" AS ENUM ('REQUIRED', 'PREFERRED', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('TECHNICAL', 'SOFT', 'LANGUAGE', 'CERTIFICATION', 'TOOL', 'DOMAIN', 'OTHER');

-- CreateEnum
CREATE TYPE "ScreeningQuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO', 'NUMBER', 'DATE', 'FILE', 'VIDEO', 'AUDIO', 'URL');

-- CreateEnum
CREATE TYPE "JobApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "JobPublicationStatus" AS ENUM ('NOT_PUBLISHED', 'QUEUED', 'PUBLISHED', 'PARTIALLY_PUBLISHED', 'FAILED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "JobCollaboratorType" AS ENUM ('OWNER', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'REVIEWER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "PipelineStageType" AS ENUM ('APPLIED', 'SCREENING', 'ASSESSMENT', 'AI_INTERVIEW', 'RECRUITER_INTERVIEW', 'TECHNICAL_INTERVIEW', 'FINAL_INTERVIEW', 'REFERENCE_CHECK', 'OFFER', 'HIRED', 'REJECTED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExternalPostingProvider" AS ENUM ('COMPANY_CAREERS_PAGE', 'LINKEDIN', 'FACEBOOK', 'X', 'INDEED', 'GLASSDOOR', 'BRIGHTERMONDAY', 'JOBS_UGANDA', 'CUSTOM_WEBHOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "JobActivityEventType" AS ENUM ('JOB_CREATED', 'JOB_UPDATED', 'JOB_DUPLICATED', 'JOB_SUBMITTED_FOR_APPROVAL', 'JOB_APPROVED', 'JOB_REJECTED', 'JOB_CHANGES_REQUESTED', 'JOB_SCHEDULED', 'JOB_PUBLISHED', 'JOB_PUBLICATION_FAILED', 'JOB_PAUSED', 'JOB_RESUMED', 'JOB_CLOSED', 'JOB_FILLED', 'JOB_CANCELLED', 'JOB_ARCHIVED', 'JOB_RESTORED', 'COLLABORATOR_ADDED', 'COLLABORATOR_UPDATED', 'COLLABORATOR_REMOVED', 'SCREENING_CONFIG_UPDATED', 'PIPELINE_UPDATED', 'TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_ARCHIVED');

-- CreateTable
CREATE TABLE "SystemMetadata" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailDomain" TEXT,
    "logoUrl" TEXT,
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "legalName" TEXT,
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "industry" TEXT,
    "companySize" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "supportEmail" TEXT,
    "description" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateOrProvince" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "timeFormat" TEXT NOT NULL DEFAULT 'HH:mm',
    "currencyCode" TEXT,
    "recruitmentEmail" TEXT,
    "logoFileId" TEXT,
    "coverImageFileId" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "jobTitle" TEXT,
    "invitedByUserId" TEXT,
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeCompanyId" TEXT,
    "refreshTokenHash" TEXT NOT NULL,
    "refreshTokenFamilyId" TEXT NOT NULL,
    "previousRefreshTokenHash" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "sessionId" TEXT,
    "eventType" "AuditEventType" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "parentDepartmentId" TEXT,
    "managerMembershipId" TEXT,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'HEAD_OFFICE',
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateOrProvince" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "phone" TEXT,
    "email" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requireEmailVerification" BOOLEAN NOT NULL DEFAULT true,
    "allowCustomRoles" BOOLEAN NOT NULL DEFAULT false,
    "allowCandidateDataExport" BOOLEAN NOT NULL DEFAULT false,
    "defaultApplicationRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "defaultInterviewDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultInterviewTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultInterviewLanguage" TEXT NOT NULL DEFAULT 'en',
    "aiScreeningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiInterviewEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recruiterOverrideRequired" BOOLEAN NOT NULL DEFAULT false,
    "notifyRecruiterOnNewApplication" BOOLEAN NOT NULL DEFAULT true,
    "notifyCandidateOnStatusChange" BOOLEAN NOT NULL DEFAULT true,
    "emailSenderName" TEXT,
    "emailReplyTo" TEXT,
    "brandPrimaryColor" TEXT,
    "brandSecondaryColor" TEXT,
    "dataRetentionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "candidateDataRetentionDays" INTEGER,
    "interviewRecordingRetentionDays" INTEGER,
    "requireJobApproval" BOOLEAN NOT NULL DEFAULT true,
    "defaultJobApproverRole" TEXT,
    "recruitersCanPublish" BOOLEAN NOT NULL DEFAULT false,
    "defaultJobVisibility" "JobVisibility" NOT NULL DEFAULT 'INTERNAL',
    "defaultApplicationDeadlineDays" INTEGER,
    "defaultCurrency" TEXT,
    "salaryVisibilityDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowPublicSalaryRanges" BOOLEAN NOT NULL DEFAULT false,
    "jobCodePrefix" TEXT,
    "careersPageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "externalPostingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requireAccessibilityReview" BOOLEAN NOT NULL DEFAULT false,
    "requireScreeningFairnessReview" BOOLEAN NOT NULL DEFAULT true,
    "autoArchiveClosedJobsAfterDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyInvitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "jobTitle" TEXT,
    "invitedByUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "membershipId" TEXT,

    CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMembership" (
    "id" TEXT NOT NULL,
    "companyMembershipId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "eventType" "OrganizationAuditEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "locationId" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "workplaceType" "WorkplaceType" NOT NULL,
    "experienceLevel" "ExperienceLevel" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "JobVisibility" NOT NULL DEFAULT 'INTERNAL',
    "approvalStatus" "JobApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "publicationStatus" "JobPublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "description" TEXT NOT NULL,
    "responsibilities" TEXT,
    "qualifications" TEXT,
    "benefits" TEXT,
    "applicationInstructions" TEXT,
    "internalNotes" TEXT,
    "numberOfOpenings" INTEGER NOT NULL DEFAULT 1,
    "salaryMin" DECIMAL(65,30),
    "salaryMax" DECIMAL(65,30),
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryVisible" BOOLEAN NOT NULL DEFAULT false,
    "remoteCountryRestrictions" JSONB,
    "applicationDeadline" TIMESTAMP(3),
    "expectedStartDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "scheduledPublishAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT NOT NULL,
    "updatedByMembershipId" TEXT,
    "ownerMembershipId" TEXT NOT NULL,
    "templateId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "departmentId" TEXT,
    "employmentType" "EmploymentType",
    "workplaceType" "WorkplaceType",
    "experienceLevel" "ExperienceLevel",
    "titleTemplate" TEXT,
    "descriptionTemplate" TEXT NOT NULL,
    "responsibilitiesTemplate" TEXT,
    "qualificationsTemplate" TEXT,
    "benefitsTemplate" TEXT,
    "defaultPipelineTemplateId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByMembershipId" TEXT NOT NULL,
    "updatedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" "SkillType" NOT NULL,
    "description" TEXT,
    "aliases" JSONB,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "importance" "RequirementImportance" NOT NULL,
    "minimumYears" DECIMAL(65,30),
    "proficiencyLevel" TEXT,
    "weight" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEducationRequirement" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" "EducationLevel" NOT NULL,
    "fieldOfStudy" TEXT,
    "importance" "RequirementImportance" NOT NULL,
    "minimumGrade" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobEducationRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExperienceRequirement" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT,
    "domain" TEXT,
    "minimumYears" DECIMAL(65,30) NOT NULL,
    "maximumYears" DECIMAL(65,30),
    "importance" "RequirementImportance" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExperienceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLanguageRequirement" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "proficiency" TEXT NOT NULL,
    "importance" "RequirementImportance" NOT NULL,
    "interviewAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLanguageRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobScreeningQuestion" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "type" "ScreeningQuestionType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "disqualifying" BOOLEAN NOT NULL DEFAULT false,
    "expectedAnswer" JSONB,
    "minimumScore" DECIMAL(65,30),
    "maximumScore" DECIMAL(65,30),
    "weight" DECIMAL(65,30),
    "sortOrder" INTEGER NOT NULL,
    "aiEvaluationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobScreeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobScreeningConfiguration" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minimumOverallScore" DECIMAL(65,30),
    "automaticShortlistingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "automaticRejectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requireRecruiterApproval" BOOLEAN NOT NULL DEFAULT true,
    "cvWeight" DECIMAL(65,30),
    "screeningQuestionWeight" DECIMAL(65,30),
    "skillsWeight" DECIMAL(65,30),
    "experienceWeight" DECIMAL(65,30),
    "educationWeight" DECIMAL(65,30),
    "assessmentWeight" DECIMAL(65,30),
    "aiExplanationRequired" BOOLEAN NOT NULL DEFAULT true,
    "fairnessReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "disabledCandidateAccommodationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByMembershipId" TEXT,

    CONSTRAINT "JobScreeningConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAccessibilityConfiguration" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "accommodationsSupported" TEXT,
    "physicalRequirements" TEXT,
    "essentialFunctions" TEXT,
    "remoteAccommodationAvailable" BOOLEAN NOT NULL DEFAULT false,
    "signLanguageInterpreterAvailable" BOOLEAN NOT NULL DEFAULT false,
    "screenReaderCompatibleAssessmentRequired" BOOLEAN NOT NULL DEFAULT false,
    "extendedTimeAvailable" BOOLEAN NOT NULL DEFAULT false,
    "alternativeInterviewFormatAvailable" BOOLEAN NOT NULL DEFAULT false,
    "candidateDisclosureOptional" BOOLEAN NOT NULL DEFAULT true,
    "disabilityDataRestricted" BOOLEAN NOT NULL DEFAULT true,
    "notesVisibleToAuthorizedRecruitersOnly" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAccessibilityConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPipeline" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Pipeline',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" TEXT NOT NULL,
    "updatedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PipelineStageType" NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "autoAdvanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requiresRecruiterApproval" BOOLEAN NOT NULL DEFAULT false,
    "slaHours" INTEGER,
    "interviewType" TEXT,
    "assessmentTemplateId" TEXT,
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApproval" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestedByMembershipId" TEXT NOT NULL,
    "assignedApproverMembershipId" TEXT NOT NULL,
    "status" "JobApprovalStatus" NOT NULL,
    "message" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByMembershipId" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCollaborator" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyMembershipId" TEXT NOT NULL,
    "type" "JobCollaboratorType" NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canReviewCandidates" BOOLEAN NOT NULL DEFAULT false,
    "canScheduleInterviews" BOOLEAN NOT NULL DEFAULT false,
    "canViewSalary" BOOLEAN NOT NULL DEFAULT false,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "assignedByMembershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "JobCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPublication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" "ExternalPostingProvider" NOT NULL,
    "externalAccountId" TEXT,
    "externalPostingId" TEXT,
    "externalUrl" TEXT,
    "status" "JobPublicationStatus" NOT NULL,
    "publishRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "requestedByMembershipId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobActivityEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "eventType" "JobActivityEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "requestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemMetadata_key_key" ON "SystemMetadata"("key");

-- CreateIndex
CREATE INDEX "SystemMetadata_key_idx" ON "SystemMetadata"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_industry_idx" ON "Company"("industry");

-- CreateIndex
CREATE INDEX "Company_createdAt_idx" ON "Company"("createdAt");

-- CreateIndex
CREATE INDEX "Role_scope_idx" ON "Role"("scope");

-- CreateIndex
CREATE INDEX "Role_companyId_idx" ON "Role"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_scope_key" ON "Role"("code", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_idx" ON "CompanyMembership"("companyId");

-- CreateIndex
CREATE INDEX "CompanyMembership_roleId_idx" ON "CompanyMembership"("roleId");

-- CreateIndex
CREATE INDEX "CompanyMembership_status_idx" ON "CompanyMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_status_idx" ON "UserSession"("status");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_refreshTokenFamilyId_idx" ON "UserSession"("refreshTokenFamilyId");

-- CreateIndex
CREATE INDEX "VerificationToken_email_idx" ON "VerificationToken"("email");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- CreateIndex
CREATE INDEX "VerificationToken_type_idx" ON "VerificationToken"("type");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_userId_idx" ON "AuthAuditEvent"("userId");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_companyId_idx" ON "AuthAuditEvent"("companyId");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_eventType_idx" ON "AuthAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_occurredAt_idx" ON "AuthAuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_status_idx" ON "Department"("status");

-- CreateIndex
CREATE INDEX "Department_parentDepartmentId_idx" ON "Department"("parentDepartmentId");

-- CreateIndex
CREATE INDEX "Department_managerMembershipId_idx" ON "Department"("managerMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompanyLocation_companyId_idx" ON "CompanyLocation"("companyId");

-- CreateIndex
CREATE INDEX "CompanyLocation_status_idx" ON "CompanyLocation"("status");

-- CreateIndex
CREATE INDEX "CompanyLocation_countryCode_idx" ON "CompanyLocation"("countryCode");

-- CreateIndex
CREATE INDEX "CompanyLocation_isPrimary_idx" ON "CompanyLocation"("isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE INDEX "CompanyInvitation_companyId_idx" ON "CompanyInvitation"("companyId");

-- CreateIndex
CREATE INDEX "CompanyInvitation_normalizedEmail_idx" ON "CompanyInvitation"("normalizedEmail");

-- CreateIndex
CREATE INDEX "CompanyInvitation_status_idx" ON "CompanyInvitation"("status");

-- CreateIndex
CREATE INDEX "CompanyInvitation_expiresAt_idx" ON "CompanyInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "CompanyInvitation_invitedByUserId_idx" ON "CompanyInvitation"("invitedByUserId");

-- CreateIndex
CREATE INDEX "DepartmentMembership_companyMembershipId_idx" ON "DepartmentMembership"("companyMembershipId");

-- CreateIndex
CREATE INDEX "DepartmentMembership_departmentId_idx" ON "DepartmentMembership"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMembership_companyMembershipId_departmentId_key" ON "DepartmentMembership"("companyMembershipId", "departmentId");

-- CreateIndex
CREATE INDEX "OrganizationAuditEvent_companyId_idx" ON "OrganizationAuditEvent"("companyId");

-- CreateIndex
CREATE INDEX "OrganizationAuditEvent_eventType_idx" ON "OrganizationAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "OrganizationAuditEvent_entityType_idx" ON "OrganizationAuditEvent"("entityType");

-- CreateIndex
CREATE INDEX "OrganizationAuditEvent_entityId_idx" ON "OrganizationAuditEvent"("entityId");

-- CreateIndex
CREATE INDEX "OrganizationAuditEvent_occurredAt_idx" ON "OrganizationAuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_departmentId_idx" ON "Job"("departmentId");

-- CreateIndex
CREATE INDEX "Job_locationId_idx" ON "Job"("locationId");

-- CreateIndex
CREATE INDEX "Job_ownerMembershipId_idx" ON "Job"("ownerMembershipId");

-- CreateIndex
CREATE INDEX "Job_employmentType_idx" ON "Job"("employmentType");

-- CreateIndex
CREATE INDEX "Job_workplaceType_idx" ON "Job"("workplaceType");

-- CreateIndex
CREATE INDEX "Job_visibility_idx" ON "Job"("visibility");

-- CreateIndex
CREATE INDEX "Job_publicationStatus_idx" ON "Job"("publicationStatus");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "Job_applicationDeadline_idx" ON "Job"("applicationDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_jobCode_key" ON "Job"("companyId", "jobCode");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_slug_key" ON "Job"("companyId", "slug");

-- CreateIndex
CREATE INDEX "JobTemplate_companyId_idx" ON "JobTemplate"("companyId");

-- CreateIndex
CREATE INDEX "JobTemplate_isActive_idx" ON "JobTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "JobTemplate_companyId_name_key" ON "JobTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "Skill_normalizedName_idx" ON "Skill"("normalizedName");

-- CreateIndex
CREATE INDEX "Skill_type_idx" ON "Skill"("type");

-- CreateIndex
CREATE INDEX "Skill_companyId_idx" ON "Skill"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_normalizedName_type_companyId_key" ON "Skill"("normalizedName", "type", "companyId");

-- CreateIndex
CREATE INDEX "JobSkill_jobId_idx" ON "JobSkill"("jobId");

-- CreateIndex
CREATE INDEX "JobSkill_skillId_idx" ON "JobSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSkill_jobId_skillId_key" ON "JobSkill"("jobId", "skillId");

-- CreateIndex
CREATE INDEX "JobEducationRequirement_jobId_idx" ON "JobEducationRequirement"("jobId");

-- CreateIndex
CREATE INDEX "JobExperienceRequirement_jobId_idx" ON "JobExperienceRequirement"("jobId");

-- CreateIndex
CREATE INDEX "JobLanguageRequirement_jobId_idx" ON "JobLanguageRequirement"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobLanguageRequirement_jobId_languageCode_key" ON "JobLanguageRequirement"("jobId", "languageCode");

-- CreateIndex
CREATE INDEX "JobScreeningQuestion_jobId_idx" ON "JobScreeningQuestion"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobScreeningConfiguration_jobId_key" ON "JobScreeningConfiguration"("jobId");

-- CreateIndex
CREATE INDEX "JobScreeningConfiguration_jobId_idx" ON "JobScreeningConfiguration"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAccessibilityConfiguration_jobId_key" ON "JobAccessibilityConfiguration"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPipeline_jobId_key" ON "JobPipeline"("jobId");

-- CreateIndex
CREATE INDEX "JobPipeline_jobId_idx" ON "JobPipeline"("jobId");

-- CreateIndex
CREATE INDEX "JobPipelineStage_pipelineId_idx" ON "JobPipelineStage"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPipelineStage_pipelineId_sortOrder_key" ON "JobPipelineStage"("pipelineId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobApproval_jobId_idx" ON "JobApproval"("jobId");

-- CreateIndex
CREATE INDEX "JobApproval_status_idx" ON "JobApproval"("status");

-- CreateIndex
CREATE INDEX "JobCollaborator_jobId_idx" ON "JobCollaborator"("jobId");

-- CreateIndex
CREATE INDEX "JobCollaborator_companyMembershipId_idx" ON "JobCollaborator"("companyMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCollaborator_jobId_companyMembershipId_type_key" ON "JobCollaborator"("jobId", "companyMembershipId", "type");

-- CreateIndex
CREATE INDEX "JobPublication_jobId_idx" ON "JobPublication"("jobId");

-- CreateIndex
CREATE INDEX "JobPublication_provider_idx" ON "JobPublication"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "JobPublication_jobId_provider_key" ON "JobPublication"("jobId", "provider");

-- CreateIndex
CREATE INDEX "JobActivityEvent_companyId_idx" ON "JobActivityEvent"("companyId");

-- CreateIndex
CREATE INDEX "JobActivityEvent_jobId_idx" ON "JobActivityEvent"("jobId");

-- CreateIndex
CREATE INDEX "JobActivityEvent_eventType_idx" ON "JobActivityEvent"("eventType");

-- CreateIndex
CREATE INDEX "JobActivityEvent_occurredAt_idx" ON "JobActivityEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAuditEvent" ADD CONSTRAINT "AuthAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAuditEvent" ADD CONSTRAINT "AuthAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentDepartmentId_fkey" FOREIGN KEY ("parentDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerMembershipId_fkey" FOREIGN KEY ("managerMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocation" ADD CONSTRAINT "CompanyLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_companyMembershipId_fkey" FOREIGN KEY ("companyMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAuditEvent" ADD CONSTRAINT "OrganizationAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTemplate" ADD CONSTRAINT "JobTemplate_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEducationRequirement" ADD CONSTRAINT "JobEducationRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExperienceRequirement" ADD CONSTRAINT "JobExperienceRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLanguageRequirement" ADD CONSTRAINT "JobLanguageRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScreeningQuestion" ADD CONSTRAINT "JobScreeningQuestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScreeningConfiguration" ADD CONSTRAINT "JobScreeningConfiguration_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScreeningConfiguration" ADD CONSTRAINT "JobScreeningConfiguration_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAccessibilityConfiguration" ADD CONSTRAINT "JobAccessibilityConfiguration_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPipeline" ADD CONSTRAINT "JobPipeline_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPipeline" ADD CONSTRAINT "JobPipeline_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPipeline" ADD CONSTRAINT "JobPipeline_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPipelineStage" ADD CONSTRAINT "JobPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "JobPipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApproval" ADD CONSTRAINT "JobApproval_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApproval" ADD CONSTRAINT "JobApproval_requestedByMembershipId_fkey" FOREIGN KEY ("requestedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApproval" ADD CONSTRAINT "JobApproval_assignedApproverMembershipId_fkey" FOREIGN KEY ("assignedApproverMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApproval" ADD CONSTRAINT "JobApproval_reviewedByMembershipId_fkey" FOREIGN KEY ("reviewedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_companyMembershipId_fkey" FOREIGN KEY ("companyMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCollaborator" ADD CONSTRAINT "JobCollaborator_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPublication" ADD CONSTRAINT "JobPublication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPublication" ADD CONSTRAINT "JobPublication_requestedByMembershipId_fkey" FOREIGN KEY ("requestedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivityEvent" ADD CONSTRAINT "JobActivityEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivityEvent" ADD CONSTRAINT "JobActivityEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
