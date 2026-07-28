-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN     "membershipId" TEXT;

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "responseJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_companyId_idx" ON "IdempotencyKey"("companyId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_companyId_key" ON "IdempotencyKey"("key", "companyId");

-- CreateIndex
CREATE INDEX "UserSession_membershipId_idx" ON "UserSession"("membershipId");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
