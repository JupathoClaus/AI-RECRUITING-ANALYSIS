-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED', 'MERGED', 'ANONYMIZED', 'DELETED');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('CAREERS_PAGE', 'RECRUITER_CREATED', 'REFERRAL', 'LINKEDIN', 'FACEBOOK', 'JOB_BOARD', 'AGENCY', 'IMPORT', 'EVENT', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CandidateLanguageProficiency" AS ENUM ('BASIC', 'CONVERSATIONAL', 'PROFESSIONAL', 'FLUENT', 'NATIVE');

-- CreateEnum
CREATE TYPE "EmploymentRecordType" AS ENUM ('EMPLOYMENT', 'INTERNSHIP', 'VOLUNTEER', 'FREELANCE', 'CONTRACT', 'APPRENTICESHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "EducationStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "CandidateConsentType" AS ENUM ('PRIVACY_POLICY', 'TERMS', 'RECRUITMENT_PROCESSING', 'TALENT_POOL', 'INTERVIEW_RECORDING', 'AI_PROCESSING', 'MARKETING', 'DATA_SHARING', 'BACKGROUND_CHECK');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DuplicateMatchCategory" AS ENUM ('EXACT', 'HIGH', 'POSSIBLE');

-- CreateEnum
CREATE TYPE "CandidateAuditEventType" AS ENUM ('CANDIDATE_CREATED', 'CANDIDATE_UPDATED', 'CANDIDATE_ARCHIVED', 'CANDIDATE_RESTORED', 'CANDIDATE_BLOCKED', 'CANDIDATE_UNBLOCKED', 'CANDIDATE_MERGE_PREVIEWED', 'CANDIDATE_MERGED', 'CANDIDATE_ANONYMIZED', 'CANDIDATE_SKILL_ADDED', 'CANDIDATE_SKILL_UPDATED', 'CANDIDATE_SKILL_REMOVED', 'CANDIDATE_EMPLOYMENT_ADDED', 'CANDIDATE_EMPLOYMENT_UPDATED', 'CANDIDATE_EMPLOYMENT_REMOVED', 'CANDIDATE_EDUCATION_ADDED', 'CANDIDATE_EDUCATION_UPDATED', 'CANDIDATE_EDUCATION_REMOVED', 'CANDIDATE_CERTIFICATION_ADDED', 'CANDIDATE_CERTIFICATION_UPDATED', 'CANDIDATE_CERTIFICATION_REMOVED', 'CANDIDATE_LANGUAGE_ADDED', 'CANDIDATE_LANGUAGE_UPDATED', 'CANDIDATE_LANGUAGE_REMOVED', 'CONSENT_GRANTED', 'CONSENT_REVOKED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "alternatePhone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "city" TEXT,
    "stateOrProvince" TEXT,
    "countryCode" TEXT,
    "postalCode" TEXT,
    "headline" TEXT,
    "summary" TEXT,
    "currentJobTitle" TEXT,
    "currentEmployer" TEXT,
    "totalExperienceYears" DECIMAL(65,30),
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "CandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "CandidateSource" NOT NULL,
    "sourceDetail" TEXT,
    "linkedInUrl" TEXT,
    "portfolioUrl" TEXT,
    "personalWebsiteUrl" TEXT,
    "willingToRelocate" BOOLEAN,
    "remoteWorkPreference" BOOLEAN,
    "salaryExpectationMin" DECIMAL(65,30),
    "salaryExpectationMax" DECIMAL(65,30),
    "salaryCurrency" TEXT,
    "noticePeriodDays" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "lastProfileUpdatedAt" TIMESTAMP(3),
    "duplicateFingerprint" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mergedIntoCandidateId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiencyLevel" TEXT,
    "yearsOfExperience" DECIMAL(65,30),
    "lastUsedAt" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEmployment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" "EmploymentRecordType" NOT NULL,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "currentlyWorking" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "achievements" TEXT,
    "industry" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEducation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "level" "EducationLevel" NOT NULL,
    "fieldOfStudy" TEXT,
    "status" "EducationStatus" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateCertification" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuingOrganization" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "credentialId" TEXT,
    "credentialUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLanguage" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "proficiency" "CandidateLanguageProficiency" NOT NULL,
    "preferredInterviewLanguage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateConsent" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyId" TEXT,
    "type" "CandidateConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sourceIpHash" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateMergeRecord" (
    "id" TEXT NOT NULL,
    "primaryCandidateId" TEXT NOT NULL,
    "mergedCandidateId" TEXT NOT NULL,
    "mergedByUserId" TEXT,
    "mergedByMembershipId" TEXT,
    "reason" TEXT,
    "fieldResolution" JSONB,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateMergeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAuditEvent" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "eventType" "CandidateAuditEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "requestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_normalizedEmail_idx" ON "Candidate"("normalizedEmail");

-- CreateIndex
CREATE INDEX "Candidate_normalizedPhone_idx" ON "Candidate"("normalizedPhone");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_source_idx" ON "Candidate"("source");

-- CreateIndex
CREATE INDEX "Candidate_createdAt_idx" ON "Candidate"("createdAt");

-- CreateIndex
CREATE INDEX "Candidate_updatedAt_idx" ON "Candidate"("updatedAt");

-- CreateIndex
CREATE INDEX "Candidate_mergedIntoCandidateId_idx" ON "Candidate"("mergedIntoCandidateId");

-- CreateIndex
CREATE INDEX "Candidate_duplicateFingerprint_idx" ON "Candidate"("duplicateFingerprint");

-- CreateIndex
CREATE INDEX "CandidateSkill_candidateId_idx" ON "CandidateSkill"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateSkill_skillId_idx" ON "CandidateSkill"("skillId");

-- CreateIndex
CREATE INDEX "CandidateSkill_verified_idx" ON "CandidateSkill"("verified");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkill_candidateId_skillId_key" ON "CandidateSkill"("candidateId", "skillId");

-- CreateIndex
CREATE INDEX "CandidateEmployment_candidateId_idx" ON "CandidateEmployment"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateEmployment_startDate_idx" ON "CandidateEmployment"("startDate");

-- CreateIndex
CREATE INDEX "CandidateEmployment_currentlyWorking_idx" ON "CandidateEmployment"("currentlyWorking");

-- CreateIndex
CREATE INDEX "CandidateEducation_candidateId_idx" ON "CandidateEducation"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateEducation_level_idx" ON "CandidateEducation"("level");

-- CreateIndex
CREATE INDEX "CandidateEducation_status_idx" ON "CandidateEducation"("status");

-- CreateIndex
CREATE INDEX "CandidateCertification_candidateId_idx" ON "CandidateCertification"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateCertification_issuingOrganization_idx" ON "CandidateCertification"("issuingOrganization");

-- CreateIndex
CREATE INDEX "CandidateCertification_expiresAt_idx" ON "CandidateCertification"("expiresAt");

-- CreateIndex
CREATE INDEX "CandidateLanguage_candidateId_idx" ON "CandidateLanguage"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateLanguage_languageCode_idx" ON "CandidateLanguage"("languageCode");

-- CreateIndex
CREATE INDEX "CandidateLanguage_preferredInterviewLanguage_idx" ON "CandidateLanguage"("preferredInterviewLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateLanguage_candidateId_languageCode_key" ON "CandidateLanguage"("candidateId", "languageCode");

-- CreateIndex
CREATE INDEX "CandidateConsent_candidateId_idx" ON "CandidateConsent"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateConsent_companyId_idx" ON "CandidateConsent"("companyId");

-- CreateIndex
CREATE INDEX "CandidateConsent_type_idx" ON "CandidateConsent"("type");

-- CreateIndex
CREATE INDEX "CandidateConsent_status_idx" ON "CandidateConsent"("status");

-- CreateIndex
CREATE INDEX "CandidateConsent_createdAt_idx" ON "CandidateConsent"("createdAt");

-- CreateIndex
CREATE INDEX "CandidateMergeRecord_primaryCandidateId_idx" ON "CandidateMergeRecord"("primaryCandidateId");

-- CreateIndex
CREATE INDEX "CandidateMergeRecord_mergedCandidateId_idx" ON "CandidateMergeRecord"("mergedCandidateId");

-- CreateIndex
CREATE INDEX "CandidateMergeRecord_mergedAt_idx" ON "CandidateMergeRecord"("mergedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateMergeRecord_primaryCandidateId_mergedCandidateId_key" ON "CandidateMergeRecord"("primaryCandidateId", "mergedCandidateId");

-- CreateIndex
CREATE INDEX "CandidateAuditEvent_candidateId_idx" ON "CandidateAuditEvent"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateAuditEvent_companyId_idx" ON "CandidateAuditEvent"("companyId");

-- CreateIndex
CREATE INDEX "CandidateAuditEvent_eventType_idx" ON "CandidateAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "CandidateAuditEvent_entityType_idx" ON "CandidateAuditEvent"("entityType");

-- CreateIndex
CREATE INDEX "CandidateAuditEvent_occurredAt_idx" ON "CandidateAuditEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_mergedIntoCandidateId_fkey" FOREIGN KEY ("mergedIntoCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEmployment" ADD CONSTRAINT "CandidateEmployment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateCertification" ADD CONSTRAINT "CandidateCertification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateLanguage" ADD CONSTRAINT "CandidateLanguage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConsent" ADD CONSTRAINT "CandidateConsent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateMergeRecord" ADD CONSTRAINT "CandidateMergeRecord_primaryCandidateId_fkey" FOREIGN KEY ("primaryCandidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateMergeRecord" ADD CONSTRAINT "CandidateMergeRecord_mergedCandidateId_fkey" FOREIGN KEY ("mergedCandidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAuditEvent" ADD CONSTRAINT "CandidateAuditEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
