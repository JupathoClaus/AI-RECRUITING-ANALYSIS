-- AlterTable
ALTER TABLE "ExtractionDispatch" ADD COLUMN     "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "leaseStartedAt" TIMESTAMP(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);
