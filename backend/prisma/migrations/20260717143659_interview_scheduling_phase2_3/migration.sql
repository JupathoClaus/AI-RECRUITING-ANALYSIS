-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE', 'VIDEO', 'ONSITE', 'TECHNICAL', 'HR', 'PANEL', 'FINAL', 'AI');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterviewResult" AS ENUM ('PASS', 'FAIL', 'HOLD', 'PENDING', 'NOT_RECORDED');

-- CreateEnum
CREATE TYPE "InterviewParticipantRole" AS ENUM ('INTERVIEWER', 'HIRING_MANAGER', 'RECRUITER', 'CANDIDATE', 'PANELIST', 'OBSERVER', 'NOTE_TAKER', 'COORDINATOR');

-- CreateEnum
CREATE TYPE "InterviewParticipantStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InterviewHistoryEventType" AS ENUM ('INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'INTERVIEW_CONFIRMED', 'INTERVIEW_CANCELLED', 'INTERVIEW_STARTED', 'INTERVIEW_COMPLETED', 'INTERVIEW_NO_SHOW', 'INTERVIEW_RESULT_RECORDED', 'INTERVIEW_RESULT_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_REMOVED', 'PARTICIPANT_STATUS_CHANGED', 'INTERVIEW_EXPIRED', 'INTERVIEW_UPDATED');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobPipelineStageId" TEXT,
    "type" "InterviewType" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "result" "InterviewResult" NOT NULL DEFAULT 'NOT_RECORDED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "meetingLink" TEXT,
    "meetingProvider" TEXT,
    "meetingId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "notes" TEXT,
    "privateNotes" TEXT,
    "cancelReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "resultNotes" TEXT,
    "resultReasonCode" TEXT,
    "configuration" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByMembershipId" TEXT NOT NULL,
    "updatedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewParticipant" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "membershipId" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "InterviewParticipantRole" NOT NULL,
    "status" "InterviewParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "respondedAt" TIMESTAMP(3),
    "externalCalendarId" TEXT,
    "addedByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewHistory" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "eventType" "InterviewHistoryEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "requestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_companyId_idx" ON "Interview"("companyId");

-- CreateIndex
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");

-- CreateIndex
CREATE INDEX "Interview_jobId_idx" ON "Interview"("jobId");

-- CreateIndex
CREATE INDEX "Interview_jobPipelineStageId_idx" ON "Interview"("jobPipelineStageId");

-- CreateIndex
CREATE INDEX "Interview_status_idx" ON "Interview"("status");

-- CreateIndex
CREATE INDEX "Interview_type_idx" ON "Interview"("type");

-- CreateIndex
CREATE INDEX "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");

-- CreateIndex
CREATE INDEX "Interview_createdByMembershipId_idx" ON "Interview"("createdByMembershipId");

-- CreateIndex
CREATE INDEX "Interview_createdAt_idx" ON "Interview"("createdAt");

-- CreateIndex
CREATE INDEX "InterviewParticipant_interviewId_idx" ON "InterviewParticipant"("interviewId");

-- CreateIndex
CREATE INDEX "InterviewParticipant_membershipId_idx" ON "InterviewParticipant"("membershipId");

-- CreateIndex
CREATE INDEX "InterviewParticipant_role_idx" ON "InterviewParticipant"("role");

-- CreateIndex
CREATE INDEX "InterviewParticipant_status_idx" ON "InterviewParticipant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewParticipant_interviewId_membershipId_key" ON "InterviewParticipant"("interviewId", "membershipId");

-- CreateIndex
CREATE INDEX "InterviewHistory_interviewId_idx" ON "InterviewHistory"("interviewId");

-- CreateIndex
CREATE INDEX "InterviewHistory_eventType_idx" ON "InterviewHistory"("eventType");

-- CreateIndex
CREATE INDEX "InterviewHistory_occurredAt_idx" ON "InterviewHistory"("occurredAt");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobPipelineStageId_fkey" FOREIGN KEY ("jobPipelineStageId") REFERENCES "JobPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_addedByMembershipId_fkey" FOREIGN KEY ("addedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewHistory" ADD CONSTRAINT "InterviewHistory_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
