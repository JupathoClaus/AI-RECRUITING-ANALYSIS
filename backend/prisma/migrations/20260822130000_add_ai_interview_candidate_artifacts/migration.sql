-- AlterTable: additive candidate journey fields for AiInterview
ALTER TABLE "AiInterview"
    ADD COLUMN "consentAcceptedAt" TIMESTAMP(3),
    ADD COLUMN "accommodationRequested" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "accommodationNotes" TEXT,
    ADD COLUMN "transcript" JSONB,
    ADD COLUMN "recordingStatus" TEXT,
    ADD COLUMN "recordingUrl" TEXT;