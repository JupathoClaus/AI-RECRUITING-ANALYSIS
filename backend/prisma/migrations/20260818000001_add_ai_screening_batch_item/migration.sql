-- Migration: add_ai_screening_batch_item
-- Adds batch membership tracking for bulk screening.
--
-- Why: AiScreeningResult.batchId can only reference ONE batch, but a screening
-- result may be legitimately reused across several batches. Reusing it for a
-- new batch previously overwrote batchId and corrupted the old batch's counts.
-- Additionally, skipped/error applications never produced a screening result,
-- so they could not be accounted for and batches never reached a terminal
-- state. AiScreeningBatchItem records membership + per-item outcome so the
-- invariant holds: total = completed + failed + skipped + pending.

-- CreateEnum
CREATE TYPE "AiScreeningBatchItemStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'SKIPPED'
);

-- CreateEnum
CREATE TYPE "AiScreeningBatchItemAction" AS ENUM (
  'QUEUED',
  'REUSED',
  'SKIPPED',
  'ERROR'
);

-- CreateTable
CREATE TABLE "AiScreeningBatchItem" (
  "id"            UUID      NOT NULL DEFAULT gen_random_uuid(),
  "batchId"       UUID      NOT NULL,
  "applicationId" TEXT      NOT NULL,
  "screeningId"   UUID,
  "status"        "AiScreeningBatchItemStatus" NOT NULL DEFAULT 'PENDING',
  "action"        "AiScreeningBatchItemAction" NOT NULL DEFAULT 'QUEUED',
  "errorMessage"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiScreeningBatchItem_pkey" PRIMARY KEY ("id")
);

-- Indexes: progress lookups by batch+status, reuse lookups by application/screening
CREATE INDEX "AiScreeningBatchItem_batchId_status_idx"    ON "AiScreeningBatchItem"("batchId", "status");
CREATE INDEX "AiScreeningBatchItem_batchId_applicationId_idx" ON "AiScreeningBatchItem"("batchId", "applicationId");
CREATE INDEX "AiScreeningBatchItem_applicationId_idx"     ON "AiScreeningBatchItem"("applicationId");
CREATE INDEX "AiScreeningBatchItem_screeningId_idx"       ON "AiScreeningBatchItem"("screeningId");

-- Foreign keys
ALTER TABLE "AiScreeningBatchItem"
  ADD CONSTRAINT "AiScreeningBatchItem_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AiScreeningBatch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiScreeningBatchItem"
  ADD CONSTRAINT "AiScreeningBatchItem_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiScreeningBatchItem"
  ADD CONSTRAINT "AiScreeningBatchItem_screeningId_fkey"
  FOREIGN KEY ("screeningId") REFERENCES "AiScreeningResult"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
