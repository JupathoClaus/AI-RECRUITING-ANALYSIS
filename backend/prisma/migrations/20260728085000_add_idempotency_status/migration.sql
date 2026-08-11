-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "IdempotencyKey" ADD COLUMN "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING';

-- Drop old unique constraint
DROP INDEX IF EXISTS "IdempotencyKey_key_companyId_key";

-- Create new unique constraint with operation
CREATE UNIQUE INDEX "IdempotencyKey_key_companyId_operation_key" ON "IdempotencyKey"("key", "companyId", "operation");

-- Create composite index for query performance
CREATE INDEX "IdempotencyKey_key_companyId_operation_status_idx" ON "IdempotencyKey"("key", "companyId", "operation", "status");
