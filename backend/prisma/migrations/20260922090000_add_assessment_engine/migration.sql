-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT', 'LONG_TEXT', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "AssessmentAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'CANCELLED', 'EVALUATED');

-- CreateEnum
CREATE TYPE "AssessmentSessionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'CANCELLED', 'EVALUATING', 'EVALUATED');

-- CreateEnum
CREATE TYPE "AssessmentEvaluationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssessmentCriterionStatus" AS ENUM ('MET', 'PARTIALLY_MET', 'NOT_MET', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "AssessmentEvidenceVerification" AS ENUM ('VERBATIM', 'SUPPORTED', 'INFERRED', 'UNVERIFIED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_CREATED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_UPDATED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_PUBLISHED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_ARCHIVED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_ASSIGNED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_SUBMITTED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_EVALUATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ASSESSMENT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSESSMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSESSMENT_EVALUATED';

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "durationMinutes" INTEGER,
    "passingScore" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdByMembershipId" TEXT NOT NULL,
    "updatedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "AssessmentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" "AssessmentQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "points" INTEGER NOT NULL DEFAULT 0,
    "competency" TEXT,
    "aiEvaluated" BOOLEAN NOT NULL DEFAULT false,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentRubricCriterion" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "guidance" TEXT,
    "maxScore" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentRubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "AssessmentAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "dueAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "assignedByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSession" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeDisplayHint" TEXT,
    "status" "AssessmentSessionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "questionOrder" JSONB,
    "startedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResponse" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" JSONB,
    "textAnswer" TEXT,
    "deterministicScore" DOUBLE PRECISION,
    "deterministicMax" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentEvaluation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "AssessmentEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "schemaVersion" TEXT,
    "inputFingerprint" TEXT,
    "latencyMs" INTEGER,
    "responseId" TEXT,
    "output" JSONB,
    "failureCode" TEXT,
    "failureMessageSafe" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "deterministicScore" DOUBLE PRECISION NOT NULL,
    "deterministicMax" DOUBLE PRECISION NOT NULL,
    "aiScore" DOUBLE PRECISION,
    "aiMax" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "questionBreakdown" JSONB,
    "competencyBreakdown" JSONB,
    "strengths" JSONB,
    "gaps" JSONB,
    "uncertainties" JSONB,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_companyId_idx" ON "Assessment"("companyId");

-- CreateIndex
CREATE INDEX "Assessment_jobId_idx" ON "Assessment"("jobId");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");

-- CreateIndex
CREATE INDEX "Assessment_createdAt_idx" ON "Assessment"("createdAt");

-- CreateIndex
CREATE INDEX "AssessmentVersion_assessmentId_idx" ON "AssessmentVersion"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentVersion_status_idx" ON "AssessmentVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_assessmentId_versionNumber_key" ON "AssessmentVersion"("assessmentId", "versionNumber");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_versionId_idx" ON "AssessmentQuestion"("versionId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_type_idx" ON "AssessmentQuestion"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_versionId_sortOrder_key" ON "AssessmentQuestion"("versionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentQuestionOption_questionId_idx" ON "AssessmentQuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionOption_questionId_sortOrder_key" ON "AssessmentQuestionOption"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentRubricCriterion_questionId_idx" ON "AssessmentRubricCriterion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentRubricCriterion_questionId_sortOrder_key" ON "AssessmentRubricCriterion"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_companyId_idx" ON "AssessmentAssignment"("companyId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_applicationId_idx" ON "AssessmentAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_versionId_idx" ON "AssessmentAssignment"("versionId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_status_idx" ON "AssessmentAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAssignment_applicationId_versionId_key" ON "AssessmentAssignment"("applicationId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSession_codeHash_key" ON "AssessmentSession"("codeHash");

-- CreateIndex
CREATE INDEX "AssessmentSession_assignmentId_idx" ON "AssessmentSession"("assignmentId");

-- CreateIndex
CREATE INDEX "AssessmentSession_companyId_idx" ON "AssessmentSession"("companyId");

-- CreateIndex
CREATE INDEX "AssessmentSession_applicationId_idx" ON "AssessmentSession"("applicationId");

-- CreateIndex
CREATE INDEX "AssessmentSession_status_idx" ON "AssessmentSession"("status");

-- CreateIndex
CREATE INDEX "AssessmentSession_expiresAt_idx" ON "AssessmentSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AssessmentResponse_sessionId_idx" ON "AssessmentResponse"("sessionId");

-- CreateIndex
CREATE INDEX "AssessmentResponse_questionId_idx" ON "AssessmentResponse"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResponse_sessionId_questionId_key" ON "AssessmentResponse"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "AssessmentEvaluation_sessionId_idx" ON "AssessmentEvaluation"("sessionId");

-- CreateIndex
CREATE INDEX "AssessmentEvaluation_companyId_idx" ON "AssessmentEvaluation"("companyId");

-- CreateIndex
CREATE INDEX "AssessmentEvaluation_status_idx" ON "AssessmentEvaluation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentEvaluation_sessionId_attempt_key" ON "AssessmentEvaluation"("sessionId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResult_sessionId_key" ON "AssessmentResult"("sessionId");

-- CreateIndex
CREATE INDEX "AssessmentResult_companyId_idx" ON "AssessmentResult"("companyId");

-- CreateIndex
CREATE INDEX "AssessmentResult_applicationId_idx" ON "AssessmentResult"("applicationId");

-- CreateIndex
CREATE INDEX "AssessmentResult_versionId_idx" ON "AssessmentResult"("versionId");

-- CreateIndex
CREATE INDEX "AssessmentResult_totalScore_idx" ON "AssessmentResult"("totalScore");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionOption" ADD CONSTRAINT "AssessmentQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRubricCriterion" ADD CONSTRAINT "AssessmentRubricCriterion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssessmentAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluation" ADD CONSTRAINT "AssessmentEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluation" ADD CONSTRAINT "AssessmentEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 6: assessment permission backfill (idempotent; prisma/seed.ts covers fresh installs)
INSERT INTO "Permission" ("id", "code", "name", "description", "resource", "action", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'assessments.read', 'Read assessments', 'View assessment definitions, versions and results', 'assessments', 'read', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.create', 'Create assessments', 'Create assessment definitions and questions', 'assessments', 'create', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.update', 'Update assessments', 'Edit draft assessments, versions and questions', 'assessments', 'update', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.publish', 'Publish assessments', 'Validate and publish assessment versions', 'assessments', 'publish', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.assign', 'Assign assessments', 'Assign assessments to applications', 'assessments', 'assign', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.review', 'Review assessment results', 'Review candidate responses and evaluations', 'assessments', 'review', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('assessments.read', 'assessments.create', 'assessments.update', 'assessments.publish', 'assessments.assign', 'assessments.review')
WHERE r."code" IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'RECRUITER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('assessments.read', 'assessments.review')
WHERE r."code" = 'HIRING_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" = 'assessments.read'
WHERE r."code" = 'VIEWER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;



-- Phase 6: assessment permission backfill (idempotent; prisma/seed.ts covers fresh installs)
INSERT INTO "Permission" ("id", "code", "name", "description", "resource", "action", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'assessments.read', 'Read assessments', 'View assessment definitions, versions and results', 'assessments', 'read', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.create', 'Create assessments', 'Create assessment definitions and questions', 'assessments', 'create', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.update', 'Update assessments', 'Edit draft assessments, versions and questions', 'assessments', 'update', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.publish', 'Publish assessments', 'Validate and publish assessment versions', 'assessments', 'publish', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.assign', 'Assign assessments', 'Assign assessments to applications', 'assessments', 'assign', NOW(), NOW()),
  (gen_random_uuid(), 'assessments.review', 'Review assessment results', 'Review candidate responses and evaluations', 'assessments', 'review', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('assessments.read', 'assessments.create', 'assessments.update', 'assessments.publish', 'assessments.assign', 'assessments.review')
WHERE r."code" IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'RECRUITER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('assessments.read', 'assessments.review')
WHERE r."code" = 'HIRING_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" = 'assessments.read'
WHERE r."code" = 'VIEWER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
