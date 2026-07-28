-- CreateEnum
CREATE TYPE "ExtractionDispatchStatus" AS ENUM ('PENDING_DISPATCH', 'DISPATCHING', 'DISPATCHED', 'DISPATCH_FAILED');

-- AlterTable
ALTER TABLE "IdempotencyKey" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ResumeTextExtraction" ADD COLUMN     "retryGeneration" INTEGER;

-- CreateTable
CREATE TABLE "ExtractionDispatch" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "dispatchStatus" "ExtractionDispatchStatus" NOT NULL DEFAULT 'PENDING_DISPATCH',
    "dispatchToken" TEXT,
    "jobId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchFailedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionDispatch_extractionId_key" ON "ExtractionDispatch"("extractionId");

-- CreateIndex
CREATE INDEX "ExtractionDispatch_dispatchStatus_idx" ON "ExtractionDispatch"("dispatchStatus");

-- CreateIndex
CREATE INDEX "ExtractionDispatch_dispatchToken_idx" ON "ExtractionDispatch"("dispatchToken");

-- AddForeignKey
ALTER TABLE "ExtractionDispatch" ADD CONSTRAINT "ExtractionDispatch_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "ResumeTextExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
