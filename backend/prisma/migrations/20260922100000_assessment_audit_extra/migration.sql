-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_STARTED';
ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_EXPIRED';

-- DropEnum
DROP TYPE "AssessmentCriterionStatus";

-- DropEnum
DROP TYPE "AssessmentEvidenceVerification";

