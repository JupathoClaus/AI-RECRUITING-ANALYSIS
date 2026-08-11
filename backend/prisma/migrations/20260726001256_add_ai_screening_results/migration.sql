-- CreateEnum
CREATE TYPE "AiScreeningStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiScreeningRecommendation" AS ENUM ('SHORTLIST', 'NOT_SHORTLIST', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "AiScreeningConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "AiScreeningResult" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "status" "AiScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" INTEGER,
    "recommendation" "AiScreeningRecommendation",
    "confidence" "AiScreeningConfidence",
    "matchedQualifications" JSONB,
    "missingQualifications" JSONB,
    "evidence" JSONB,
    "criteriaScores" JSONB,
    "uncertainties" JSONB,
    "riskFlags" JSONB,
    "explanation" TEXT,
    "prohibitedReasoningDetected" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "providerResponseId" TEXT,
    "inputFingerprint" TEXT,
    "failureCode" TEXT,
    "failureMessageSafe" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiScreeningResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiScreeningResult_applicationId_idx" ON "AiScreeningResult"("applicationId");

-- CreateIndex
CREATE INDEX "AiScreeningResult_companyId_idx" ON "AiScreeningResult"("companyId");

-- CreateIndex
CREATE INDEX "AiScreeningResult_status_idx" ON "AiScreeningResult"("status");

-- CreateIndex
CREATE INDEX "AiScreeningResult_createdAt_idx" ON "AiScreeningResult"("createdAt");

-- CreateIndex
CREATE INDEX "AiScreeningResult_recommendation_idx" ON "AiScreeningResult"("recommendation");

-- CreateIndex
CREATE INDEX "AiScreeningResult_applicationId_createdAt_idx" ON "AiScreeningResult"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiScreeningResult" ADD CONSTRAINT "AiScreeningResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
