-- Add new columns to IdempotencyKey
ALTER TABLE "IdempotencyKey" ADD COLUMN "requestHash" TEXT;
ALTER TABLE "IdempotencyKey" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "IdempotencyKey" ADD COLUMN "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "IdempotencyKey" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop old unique constraint
DROP INDEX IF EXISTS "IdempotencyKey_key_companyId_operation_key";

-- Drop old composite index
DROP INDEX IF EXISTS "IdempotencyKey_key_companyId_operation_status_idx";

-- Create new unique constraint with userId
CREATE UNIQUE INDEX "IdempotencyKey_key_companyId_userId_operation_key" ON "IdempotencyKey"("key", "companyId", "userId", "operation");

-- Create new composite index
CREATE INDEX "IdempotencyKey_key_companyId_userId_operation_status_idx" ON "IdempotencyKey"("key", "companyId", "userId", "operation", "status");

-- Index for lease cleanup
CREATE INDEX "IdempotencyKey_leaseToken_idx" ON "IdempotencyKey"("leaseToken");
