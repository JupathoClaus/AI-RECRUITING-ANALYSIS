-- CreateEnum
CREATE TYPE "AiInterviewStatus" AS ENUM ('CREATED', 'SENT', 'ACCESSED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiInterviewProvider" AS ENUM ('MOCK', 'TAVUS');

-- CreateEnum
CREATE TYPE "AiInterviewTranscriptStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "AiInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "AiInterviewProvider" NOT NULL DEFAULT 'TAVUS',
    "status" "AiInterviewStatus" NOT NULL DEFAULT 'CREATED',
    "codeHash" TEXT NOT NULL,
    "codeDisplayHint" TEXT,
    "invitationSentAt" TIMESTAMP(3),
    "invitationEmail" TEXT,
    "accessedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "tavusConversationId" TEXT,
    "tavusConversationUrl" TEXT,
    "tavusStatus" TEXT,
    "tavusMeetingToken" TEXT,
    "transcriptStatus" "AiInterviewTranscriptStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "transcriptUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "availableFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "cancelledByMembershipId" TEXT,
    "createdByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiInterview_codeHash_key" ON "AiInterview"("codeHash");

-- CreateIndex
CREATE INDEX "AiInterview_applicationId_idx" ON "AiInterview"("applicationId");

-- CreateIndex
CREATE INDEX "AiInterview_companyId_idx" ON "AiInterview"("companyId");

-- CreateIndex
CREATE INDEX "AiInterview_status_idx" ON "AiInterview"("status");

-- CreateIndex
CREATE INDEX "AiInterview_tavusConversationId_idx" ON "AiInterview"("tavusConversationId");

-- CreateIndex
CREATE INDEX "AiInterview_expiresAt_idx" ON "AiInterview"("expiresAt");

-- AddForeignKey
ALTER TABLE "AiInterview" ADD CONSTRAINT "AiInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterview" ADD CONSTRAINT "AiInterview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterview" ADD CONSTRAINT "AiInterview_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
