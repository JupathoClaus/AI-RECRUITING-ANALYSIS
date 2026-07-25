-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('RESUME', 'COMPANY_LOGO', 'COVER_IMAGE', 'SCREENING_ANSWER');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "category" "FileCategory" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_companyId_idx" ON "StoredFile"("companyId");

-- CreateIndex
CREATE INDEX "StoredFile_applicationId_idx" ON "StoredFile"("applicationId");

-- CreateIndex
CREATE INDEX "StoredFile_category_idx" ON "StoredFile"("category");

-- CreateIndex
CREATE INDEX "StoredFile_status_idx" ON "StoredFile"("status");

-- CreateIndex
CREATE INDEX "StoredFile_checksumSha256_idx" ON "StoredFile"("checksumSha256");

-- CreateIndex
CREATE INDEX "StoredFile_createdAt_idx" ON "StoredFile"("createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_deletedAt_idx" ON "StoredFile"("deletedAt");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
