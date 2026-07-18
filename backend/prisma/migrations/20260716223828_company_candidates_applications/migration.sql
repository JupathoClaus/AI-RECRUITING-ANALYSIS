-- CreateEnum
CREATE TYPE "CompanyCandidateStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DO_NOT_CONTACT', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CandidateTagType" AS ENUM ('GENERAL', 'SKILL', 'PRIORITY', 'SOURCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CandidateNoteVisibility" AS ENUM ('PRIVATE', 'HIRING_TEAM', 'COMPANY');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'ON_HOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationActorType" AS ENUM ('CANDIDATE', 'RECRUITER', 'SYSTEM', 'AI', 'IMPORT', 'API');

-- CreateEnum
CREATE TYPE "ApplicationAssignmentType" AS ENUM ('OWNER', 'RECRUITER', 'HIRING_MANAGER', 'REVIEWER');

-- CreateEnum
CREATE TYPE "ApplicationDecisionType" AS ENUM ('NONE', 'SHORTLIST', 'REJECT', 'HOLD', 'ADVANCE', 'OFFER', 'HIRE', 'DISQUALIFY', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "ApplicationFlagType" AS ENUM ('DUPLICATE', 'MISSING_INFORMATION', 'INCOMPLETE_RESUME', 'SCREENING_CONCERN', 'INTEGRITY_REVIEW', 'ACCOMMODATION_REQUIRED', 'MANUAL_REVIEW', 'FUTURE_AI_FLAG', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationFlagSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApplicationAuditEventType" AS ENUM ('COMPANY_CANDIDATE_CREATED', 'COMPANY_CANDIDATE_UPDATED', 'COMPANY_CANDIDATE_ARCHIVED', 'COMPANY_CANDIDATE_RESTORED', 'COMPANY_CANDIDATE_OWNER_CHANGED', 'COMPANY_CANDIDATE_TAG_ADDED', 'COMPANY_CANDIDATE_TAG_REMOVED', 'COMPANY_CANDIDATE_NOTE_ADDED', 'COMPANY_CANDIDATE_NOTE_UPDATED', 'COMPANY_CANDIDATE_NOTE_DELETED', 'APPLICATION_CREATED', 'APPLICATION_SUBMITTED', 'APPLICATION_UPDATED', 'APPLICATION_STAGE_CHANGED', 'APPLICATION_SHORTLISTED', 'APPLICATION_REJECTED', 'APPLICATION_RESTORED', 'APPLICATION_WITHDRAWN', 'APPLICATION_HIRED', 'APPLICATION_ASSIGNED', 'APPLICATION_OWNER_CHANGED', 'APPLICATION_FLAG_ADDED', 'APPLICATION_FLAG_RESOLVED', 'APPLICATION_DECISION_CREATED', 'APPLICATION_DECISION_OVERRIDDEN', 'APPLICATION_SCREENING_ANSWERS_UPDATED', 'APPLICATION_ARCHIVED', 'APPLICATION_RESTORED_FROM_ARCHIVE');

-- CreateTable
CREATE TABLE "CompanyCandidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "CompanyCandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerMembershipId" TEXT,
    "source" "CandidateSource" NOT NULL,
    "sourceDetail" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "talentPoolEnabled" BOOLEAN NOT NULL DEFAULT false,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "doNotContactReason" TEXT,
    "rating" DECIMAL(65,30),
    "internalSummary" TEXT,
    "createdByMembershipId" TEXT,
    "updatedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompanyCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "type" "CandidateTagType" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "color" TEXT,
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CandidateTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCandidateTag" (
    "id" TEXT NOT NULL,
    "companyCandidateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCandidateTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCandidateNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyCandidateId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "CandidateNoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyCandidateNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCounter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyCandidateId" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "publicReference" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStageId" TEXT,
    "source" "CandidateSource" NOT NULL,
    "sourceDetail" TEXT,
    "submittedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReasonCode" TEXT,
    "rejectionReasonDetails" TEXT,
    "disqualifiedAt" TIMESTAMP(3),
    "hiredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "coverLetter" TEXT,
    "expectedSalaryMin" DECIMAL(65,30),
    "expectedSalaryMax" DECIMAL(65,30),
    "salaryCurrency" TEXT,
    "availabilityDate" TIMESTAMP(3),
    "noticePeriodDays" INTEGER,
    "referralMembershipId" TEXT,
    "referralName" TEXT,
    "referralEmail" TEXT,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "candidateSnapshot" JSONB,
    "jobSnapshot" JSONB,
    "screeningSnapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationTagAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationScreeningAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB,
    "textAnswer" TEXT,
    "numericAnswer" DECIMAL(65,30),
    "dateAnswer" TIMESTAMP(3),
    "fileId" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "recruiterReviewed" BOOLEAN NOT NULL DEFAULT false,
    "recruiterReviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationScreeningAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStageHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "actorType" "ApplicationActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "reasonCode" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "type" "ApplicationAssignmentType" NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationNote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "CandidateNoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationFlag" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ApplicationFlagType" NOT NULL,
    "description" TEXT,
    "severity" "ApplicationFlagSeverity" NOT NULL DEFAULT 'MEDIUM',
    "createdByActorType" "ApplicationActorType" NOT NULL,
    "createdByUserId" TEXT,
    "createdByMembershipId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedByMembershipId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDecision" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ApplicationDecisionType" NOT NULL,
    "actorType" "ApplicationActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "reasonCode" TEXT,
    "explanation" TEXT NOT NULL,
    "score" DECIMAL(65,30),
    "confidence" DECIMAL(65,30),
    "evidence" JSONB,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "overriddenDecisionId" TEXT,
    "finalDecision" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT,
    "companyCandidateId" TEXT,
    "candidateId" TEXT,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "actorType" "ApplicationActorType" NOT NULL,
    "eventType" "ApplicationAuditEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "requestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyCandidate_companyId_idx" ON "CompanyCandidate"("companyId");

-- CreateIndex
CREATE INDEX "CompanyCandidate_candidateId_idx" ON "CompanyCandidate"("candidateId");

-- CreateIndex
CREATE INDEX "CompanyCandidate_status_idx" ON "CompanyCandidate"("status");

-- CreateIndex
CREATE INDEX "CompanyCandidate_ownerMembershipId_idx" ON "CompanyCandidate"("ownerMembershipId");

-- CreateIndex
CREATE INDEX "CompanyCandidate_lastActivityAt_idx" ON "CompanyCandidate"("lastActivityAt");

-- CreateIndex
CREATE INDEX "CompanyCandidate_createdAt_idx" ON "CompanyCandidate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCandidate_companyId_candidateId_key" ON "CompanyCandidate"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateTag_companyId_idx" ON "CandidateTag"("companyId");

-- CreateIndex
CREATE INDEX "CandidateTag_type_idx" ON "CandidateTag"("type");

-- CreateIndex
CREATE INDEX "CandidateTag_deletedAt_idx" ON "CandidateTag"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateTag_companyId_normalizedName_key" ON "CandidateTag"("companyId", "normalizedName");

-- CreateIndex
CREATE INDEX "CompanyCandidateTag_companyCandidateId_idx" ON "CompanyCandidateTag"("companyCandidateId");

-- CreateIndex
CREATE INDEX "CompanyCandidateTag_tagId_idx" ON "CompanyCandidateTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCandidateTag_companyCandidateId_tagId_key" ON "CompanyCandidateTag"("companyCandidateId", "tagId");

-- CreateIndex
CREATE INDEX "CompanyCandidateNote_companyCandidateId_idx" ON "CompanyCandidateNote"("companyCandidateId");

-- CreateIndex
CREATE INDEX "CompanyCandidateNote_companyId_idx" ON "CompanyCandidateNote"("companyId");

-- CreateIndex
CREATE INDEX "CompanyCandidateNote_authorMembershipId_idx" ON "CompanyCandidateNote"("authorMembershipId");

-- CreateIndex
CREATE INDEX "CompanyCandidateNote_deletedAt_idx" ON "CompanyCandidateNote"("deletedAt");

-- CreateIndex
CREATE INDEX "ApplicationCounter_companyId_idx" ON "ApplicationCounter"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCounter_companyId_year_key" ON "ApplicationCounter"("companyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Application_publicReference_key" ON "Application"("publicReference");

-- CreateIndex
CREATE INDEX "Application_companyId_idx" ON "Application"("companyId");

-- CreateIndex
CREATE INDEX "Application_jobId_idx" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_candidateId_idx" ON "Application"("candidateId");

-- CreateIndex
CREATE INDEX "Application_companyCandidateId_idx" ON "Application"("companyCandidateId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_currentStageId_idx" ON "Application"("currentStageId");

-- CreateIndex
CREATE INDEX "Application_applicationNumber_idx" ON "Application"("applicationNumber");

-- CreateIndex
CREATE INDEX "Application_publicReference_idx" ON "Application"("publicReference");

-- CreateIndex
CREATE INDEX "Application_submittedAt_idx" ON "Application"("submittedAt");

-- CreateIndex
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_companyId_applicationNumber_key" ON "Application"("companyId", "applicationNumber");

-- CreateIndex
CREATE INDEX "ApplicationTagAssignment_applicationId_idx" ON "ApplicationTagAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationTagAssignment_tagId_idx" ON "ApplicationTagAssignment"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationTagAssignment_applicationId_tagId_key" ON "ApplicationTagAssignment"("applicationId", "tagId");

-- CreateIndex
CREATE INDEX "ApplicationScreeningAnswer_applicationId_idx" ON "ApplicationScreeningAnswer"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationScreeningAnswer_questionId_idx" ON "ApplicationScreeningAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationScreeningAnswer_applicationId_questionId_key" ON "ApplicationScreeningAnswer"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "ApplicationStageHistory_applicationId_idx" ON "ApplicationStageHistory"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationStageHistory_occurredAt_idx" ON "ApplicationStageHistory"("occurredAt");

-- CreateIndex
CREATE INDEX "ApplicationAssignment_applicationId_idx" ON "ApplicationAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationAssignment_membershipId_idx" ON "ApplicationAssignment"("membershipId");

-- CreateIndex
CREATE INDEX "ApplicationAssignment_type_idx" ON "ApplicationAssignment"("type");

-- CreateIndex
CREATE INDEX "ApplicationNote_applicationId_idx" ON "ApplicationNote"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationNote_companyId_idx" ON "ApplicationNote"("companyId");

-- CreateIndex
CREATE INDEX "ApplicationNote_deletedAt_idx" ON "ApplicationNote"("deletedAt");

-- CreateIndex
CREATE INDEX "ApplicationFlag_applicationId_idx" ON "ApplicationFlag"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationFlag_resolved_idx" ON "ApplicationFlag"("resolved");

-- CreateIndex
CREATE INDEX "ApplicationFlag_type_idx" ON "ApplicationFlag"("type");

-- CreateIndex
CREATE INDEX "ApplicationDecision_applicationId_idx" ON "ApplicationDecision"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationDecision_type_idx" ON "ApplicationDecision"("type");

-- CreateIndex
CREATE INDEX "ApplicationDecision_finalDecision_idx" ON "ApplicationDecision"("finalDecision");

-- CreateIndex
CREATE INDEX "ApplicationAuditEvent_companyId_idx" ON "ApplicationAuditEvent"("companyId");

-- CreateIndex
CREATE INDEX "ApplicationAuditEvent_applicationId_idx" ON "ApplicationAuditEvent"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationAuditEvent_companyCandidateId_idx" ON "ApplicationAuditEvent"("companyCandidateId");

-- CreateIndex
CREATE INDEX "ApplicationAuditEvent_eventType_idx" ON "ApplicationAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "ApplicationAuditEvent_occurredAt_idx" ON "ApplicationAuditEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTag" ADD CONSTRAINT "CandidateTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateTag" ADD CONSTRAINT "CandidateTag_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidateTag" ADD CONSTRAINT "CompanyCandidateTag_companyCandidateId_fkey" FOREIGN KEY ("companyCandidateId") REFERENCES "CompanyCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidateTag" ADD CONSTRAINT "CompanyCandidateTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CandidateTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidateTag" ADD CONSTRAINT "CompanyCandidateTag_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidateNote" ADD CONSTRAINT "CompanyCandidateNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidateNote" ADD CONSTRAINT "CompanyCandidateNote_companyCandidateId_fkey" FOREIGN KEY ("companyCandidateId") REFERENCES "CompanyCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidateNote" ADD CONSTRAINT "CompanyCandidateNote_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCounter" ADD CONSTRAINT "ApplicationCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_companyCandidateId_fkey" FOREIGN KEY ("companyCandidateId") REFERENCES "CompanyCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "JobPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_referralMembershipId_fkey" FOREIGN KEY ("referralMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationTagAssignment" ADD CONSTRAINT "ApplicationTagAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationTagAssignment" ADD CONSTRAINT "ApplicationTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CandidateTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationTagAssignment" ADD CONSTRAINT "ApplicationTagAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationScreeningAnswer" ADD CONSTRAINT "ApplicationScreeningAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationScreeningAnswer" ADD CONSTRAINT "ApplicationScreeningAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "JobScreeningQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "JobPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "JobPipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAssignment" ADD CONSTRAINT "ApplicationAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAssignment" ADD CONSTRAINT "ApplicationAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAssignment" ADD CONSTRAINT "ApplicationAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationFlag" ADD CONSTRAINT "ApplicationFlag_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationFlag" ADD CONSTRAINT "ApplicationFlag_resolvedByMembershipId_fkey" FOREIGN KEY ("resolvedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationFlag" ADD CONSTRAINT "ApplicationFlag_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_overriddenDecisionId_fkey" FOREIGN KEY ("overriddenDecisionId") REFERENCES "ApplicationDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAuditEvent" ADD CONSTRAINT "ApplicationAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
