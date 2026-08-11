-- CreateIndex
CREATE INDEX "ExtractionDispatch_dispatchStatus_nextAttemptAt_idx" ON "ExtractionDispatch"("dispatchStatus", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ExtractionDispatch_dispatchStatus_leaseStartedAt_idx" ON "ExtractionDispatch"("dispatchStatus", "leaseStartedAt");
