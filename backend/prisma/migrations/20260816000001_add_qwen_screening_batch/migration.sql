-- Migration: add_qwen_screening_batch
-- Adds:
--   1. criterionEvaluations column to AiScreeningResult (additive, nullable)
--   2. batchId FK column on AiScreeningResult (additive, nullable)
--   3. AiScreeningBatch table for bulk screening orchestration
--   4. Enum types for batch mode and status

-- CreateEnum
CREATE TYPE "AiScreeningBatchMode" AS ENUM (
  'SELECTED',
  'ALL_FOR_JOB',
  'UNSCREENED_FOR_JOB',
  'ALL_UNSCREENED_OPEN_JOBS'
);

-- CreateEnum
CREATE TYPE "AiScreeningBatchStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- CreateTable: AiScreeningBatch
CREATE TABLE "AiScreeningBatch" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "companyId"         TEXT        NOT NULL,
  "initiatedByUserId" TEXT        NOT NULL,
  "jobId"             TEXT,
  "mode"              "AiScreeningBatchMode"   NOT NULL,
  "status"            "AiScreeningBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "totalCount"        INTEGER     NOT NULL DEFAULT 0,
  "completedCount"    INTEGER     NOT NULL DEFAULT 0,
  "failedCount"       INTEGER     NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"         TIMESTAMP(3),
  "completedAt"       TIMESTAMP(3),

  CONSTRAINT "AiScreeningBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiScreeningBatch_companyId_idx"  ON "AiScreeningBatch"("companyId");
CREATE INDEX "AiScreeningBatch_status_idx"     ON "AiScreeningBatch"("status");
CREATE INDEX "AiScreeningBatch_createdAt_idx"  ON "AiScreeningBatch"("createdAt");
CREATE INDEX "AiScreeningBatch_jobId_idx"      ON "AiScreeningBatch"("jobId");

-- AlterTable: AiScreeningResult — add criterionEvaluations and batchId (both additive/nullable)
ALTER TABLE "AiScreeningResult"
  ADD COLUMN IF NOT EXISTS "criterionEvaluations" JSONB,
  ADD COLUMN IF NOT EXISTS "batchId" UUID;

-- CreateIndex on batchId
CREATE INDEX IF NOT EXISTS "AiScreeningResult_batchId_idx" ON "AiScreeningResult"("batchId");

-- AddForeignKey: AiScreeningResult.batchId -> AiScreeningBatch.id
ALTER TABLE "AiScreeningResult"
  ADD CONSTRAINT "AiScreeningResult_batchId_fkey"
  FOREIGN KEY ("batchId")
  REFERENCES "AiScreeningBatch"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
