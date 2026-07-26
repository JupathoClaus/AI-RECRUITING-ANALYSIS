-- CreateEnum
CREATE TYPE "ResumeExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ResumeTextExtraction" (
    "id" TEXT NOT NULL,
    "storedFileId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "status" "ResumeExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "extractedTextSha256" TEXT,
    "sourceFileSha256" TEXT,
    "parserName" TEXT,
    "parserVersion" TEXT,
    "mimeType" TEXT,
    "failureCode" TEXT,
    "failureMessageSafe" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeTextExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeTextExtraction_storedFileId_idx" ON "ResumeTextExtraction"("storedFileId");

-- CreateIndex
CREATE INDEX "ResumeTextExtraction_companyId_idx" ON "ResumeTextExtraction"("companyId");

-- CreateIndex
CREATE INDEX "ResumeTextExtraction_status_idx" ON "ResumeTextExtraction"("status");

-- CreateIndex
CREATE INDEX "ResumeTextExtraction_storedFileId_companyId_status_idx" ON "ResumeTextExtraction"("storedFileId", "companyId", "status");

-- CreateIndex
CREATE INDEX "ResumeTextExtraction_createdAt_idx" ON "ResumeTextExtraction"("createdAt");

-- AddForeignKey
ALTER TABLE "ResumeTextExtraction" ADD CONSTRAINT "ResumeTextExtraction_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
