-- AlterTable: additive scheduledAt for AiInterview
ALTER TABLE "AiInterview"
    ADD COLUMN "scheduledAt" TIMESTAMP(3);