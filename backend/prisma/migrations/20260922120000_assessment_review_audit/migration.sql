-- AlterEnum
-- Recruiter reviews a candidate assessment result (single-shot review view)
-- and re-evaluation requests share this event type with distinct descriptions.

ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_REVIEWED';