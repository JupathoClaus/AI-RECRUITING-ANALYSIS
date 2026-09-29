-- CreateEnum
CREATE TYPE "AiInterviewEvaluationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiInterviewEvaluationRecommendation" AS ENUM ('PASS', 'HOLD', 'FAIL');

-- CreateEnum
CREATE TYPE "AiInterviewCompetencyStatus" AS ENUM ('MET', 'PARTIALLY_MET', 'NOT_MET', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "AiInterviewEvaluationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AiInterviewEvidenceVerification" AS ENUM ('VERBATIM', 'SUPPORTED', 'INFERRED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "AiInterviewTranscriptSegmentType" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'AI_INTERVIEW_INITIATED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'AI_INTERVIEW_COMPLETED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'AI_INTERVIEW_EVALUATED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'AI_INTERVIEW_REVIEWED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AI_INTERVIEW_EVALUATED';

-- DropForeignKey
ALTER TABLE "AiScreeningBatchItem" DROP CONSTRAINT "AiScreeningBatchItem_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "AiScreeningBatchItem" DROP CONSTRAINT "AiScreeningBatchItem_batchId_fkey";

-- AlterTable
ALTER TABLE "AiInterview" ADD COLUMN     "evaluationAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "evaluationStatus" "AiInterviewEvaluationStatus" NOT NULL DEFAULT 'NOT_REQUESTED';

-- AlterTable
ALTER TABLE "AiScreeningBatch" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AiScreeningBatchItem" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AiInterviewTranscript" (
    "id" TEXT NOT NULL,
    "aiInterviewId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "AiInterviewTranscriptStatus" NOT NULL DEFAULT 'PENDING',
    "sourceStatus" TEXT,
    "sourceUrl" TEXT,
    "contentHash" TEXT,
    "formatVersion" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "rawTurns" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiInterviewTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewTranscriptSegment" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "segmentType" "AiInterviewTranscriptSegmentType" NOT NULL DEFAULT 'USER',
    "speakerRole" TEXT,
    "startSeconds" DOUBLE PRECISION,
    "endSeconds" DOUBLE PRECISION,
    "durationSeconds" DOUBLE PRECISION,
    "textRaw" TEXT,
    "textNormalized" TEXT,
    "characterCount" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInterviewTranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewEvaluation" (
    "id" TEXT NOT NULL,
    "aiInterviewId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "AiInterviewEvaluationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "totalScore" DOUBLE PRECISION,
    "maximumScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "recommendation" "AiInterviewEvaluationRecommendation",
    "confidence" "AiInterviewEvaluationConfidence",
    "summary" TEXT,
    "strengths" JSONB,
    "gaps" JSONB,
    "uncertainties" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "schemaVersion" TEXT,
    "inputFingerprint" TEXT,
    "latencyMs" INTEGER,
    "responseId" TEXT,
    "evidenceTotals" JSONB,
    "failureCode" TEXT,
    "failureMessageSafe" TEXT,
    "recruiterDecision" "AiInterviewEvaluationRecommendation",
    "decidedByMembershipId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiInterviewEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewEvaluationAttempt" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "aiInterviewId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "AiInterviewEvaluationStatus" NOT NULL DEFAULT 'PENDING',
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

    CONSTRAINT "AiInterviewEvaluationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewCompetencyEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "status" "AiInterviewCompetencyStatus" NOT NULL DEFAULT 'UNCERTAIN',
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "confidence" "AiInterviewEvaluationConfidence",
    "rationale" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInterviewCompetencyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewEvidence" (
    "id" TEXT NOT NULL,
    "competencyEvaluationId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "verification" "AiInterviewEvidenceVerification",
    "sourceSegmentIndex" INTEGER,
    "sourceSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInterviewEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInterviewTranscript_companyId_idx" ON "AiInterviewTranscript"("companyId");

-- CreateIndex
CREATE INDEX "AiInterviewTranscript_applicationId_idx" ON "AiInterviewTranscript"("applicationId");

-- CreateIndex
CREATE INDEX "AiInterviewTranscript_candidateId_idx" ON "AiInterviewTranscript"("candidateId");

-- CreateIndex
CREATE INDEX "AiInterviewTranscript_jobId_idx" ON "AiInterviewTranscript"("jobId");

-- CreateIndex
CREATE INDEX "AiInterviewTranscript_status_idx" ON "AiInterviewTranscript"("status");

-- CreateIndex
CREATE INDEX "AiInterviewTranscript_createdAt_idx" ON "AiInterviewTranscript"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInterviewTranscript_aiInterviewId_key" ON "AiInterviewTranscript"("aiInterviewId");

-- CreateIndex
CREATE INDEX "AiInterviewTranscriptSegment_transcriptId_idx" ON "AiInterviewTranscriptSegment"("transcriptId");

-- CreateIndex
CREATE INDEX "AiInterviewTranscriptSegment_segmentType_idx" ON "AiInterviewTranscriptSegment"("segmentType");

-- CreateIndex
CREATE UNIQUE INDEX "AiInterviewTranscriptSegment_transcriptId_segmentIndex_key" ON "AiInterviewTranscriptSegment"("transcriptId", "segmentIndex");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_companyId_idx" ON "AiInterviewEvaluation"("companyId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_applicationId_idx" ON "AiInterviewEvaluation"("applicationId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_candidateId_idx" ON "AiInterviewEvaluation"("candidateId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_jobId_idx" ON "AiInterviewEvaluation"("jobId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_status_idx" ON "AiInterviewEvaluation"("status");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_recommendation_idx" ON "AiInterviewEvaluation"("recommendation");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_recruiterDecision_idx" ON "AiInterviewEvaluation"("recruiterDecision");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_createdAt_idx" ON "AiInterviewEvaluation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInterviewEvaluation_aiInterviewId_key" ON "AiInterviewEvaluation"("aiInterviewId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluationAttempt_aiInterviewId_idx" ON "AiInterviewEvaluationAttempt"("aiInterviewId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluationAttempt_companyId_idx" ON "AiInterviewEvaluationAttempt"("companyId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluationAttempt_status_idx" ON "AiInterviewEvaluationAttempt"("status");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluationAttempt_createdAt_idx" ON "AiInterviewEvaluationAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInterviewEvaluationAttempt_evaluationId_attempt_key" ON "AiInterviewEvaluationAttempt"("evaluationId", "attempt");

-- CreateIndex
CREATE INDEX "AiInterviewCompetencyEvaluation_evaluationId_idx" ON "AiInterviewCompetencyEvaluation"("evaluationId");

-- CreateIndex
CREATE INDEX "AiInterviewCompetencyEvaluation_competency_idx" ON "AiInterviewCompetencyEvaluation"("competency");

-- CreateIndex
CREATE INDEX "AiInterviewEvidence_competencyEvaluationId_idx" ON "AiInterviewEvidence"("competencyEvaluationId");

-- CreateIndex
CREATE INDEX "AiInterviewEvidence_verification_idx" ON "AiInterviewEvidence"("verification");

-- CreateIndex
CREATE INDEX "AiInterview_evaluationStatus_idx" ON "AiInterview"("evaluationStatus");

-- AddForeignKey
ALTER TABLE "AiScreeningBatchItem" ADD CONSTRAINT "AiScreeningBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AiScreeningBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiScreeningBatchItem" ADD CONSTRAINT "AiScreeningBatchItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewTranscript" ADD CONSTRAINT "AiInterviewTranscript_aiInterviewId_fkey" FOREIGN KEY ("aiInterviewId") REFERENCES "AiInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewTranscriptSegment" ADD CONSTRAINT "AiInterviewTranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "AiInterviewTranscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewEvaluation" ADD CONSTRAINT "AiInterviewEvaluation_aiInterviewId_fkey" FOREIGN KEY ("aiInterviewId") REFERENCES "AiInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewEvaluationAttempt" ADD CONSTRAINT "AiInterviewEvaluationAttempt_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AiInterviewEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewCompetencyEvaluation" ADD CONSTRAINT "AiInterviewCompetencyEvaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AiInterviewEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewEvidence" ADD CONSTRAINT "AiInterviewEvidence_competencyEvaluationId_fkey" FOREIGN KEY ("competencyEvaluationId") REFERENCES "AiInterviewCompetencyEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

