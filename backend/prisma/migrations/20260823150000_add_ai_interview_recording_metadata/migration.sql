-- AlterTable: additive recording metadata for AiInterview
ALTER TABLE "AiInterview"
    ADD COLUMN "recordingMetadata" JSONB;