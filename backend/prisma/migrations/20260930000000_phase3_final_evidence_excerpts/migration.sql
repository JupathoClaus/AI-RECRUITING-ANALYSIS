-- Phase 3 final closure: evidence becomes first-class with transcript excerpts
-- and segment references for recruiter-facing deep-linking and VERBATIM grounding.
-- AlterTable
ALTER TABLE "AiInterviewEvidence" ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "transcriptId" TEXT,
ADD COLUMN     "segmentIndexes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "startSeconds" DOUBLE PRECISION,
ADD COLUMN     "endSeconds" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "AiInterviewEvidence_transcriptId_idx" ON "AiInterviewEvidence"("transcriptId");