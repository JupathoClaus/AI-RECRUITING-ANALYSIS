-- AlterTable: additive artifact-sync bookkeeping for AiInterview
ALTER TABLE "AiInterview"
    ADD COLUMN "artifactSyncAttemptedAt" TIMESTAMP(3);