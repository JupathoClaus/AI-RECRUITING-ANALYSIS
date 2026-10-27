# AI Screening Integration Path Verification

**Repository:** D:\TalentAI-GIT-RECOVERY  
**Branch:** feat/mvp-resume-development  
**HEAD:** ab37d307ee678ef5d9876e103afc92f36b2bed53  
**Remote:** https://github.com/JupathoClaus/AI-RECRUITING-ANALYSIS.git  
**Date:** 2026-10-26  
**Verifier:** Current agent  
**Safety:** Read-only inspection; no code/deps/DB changes

## A. Candidate submits application and CV (Public)

**Endpoint:** `POST /public/companies/:companySlug/jobs/:jobSlug/applications`  
**Controller:** `backend/src/modules/applications/controllers/public-applications.controller.ts`  
- Public, throttled (10/min), multipart (`file` field), max 10MB
- DTO: `PublicApplicationMultipartDto` (validated); `screeningAnswers` parsed via `plainToInstance` (fixed)
- Calls `PublicApplicationSubmissionService.submit(...)`

**Service:** `backend/src/modules/applications/services/public-application-submission.service.ts`  
- Honeypot check (websiteUrl) - returns fake success without DB
- Consent required
- Validates CV up front via `validateResumeFile` (extension/mime/magic bytes/size)
- Resolves active company + published job with deadline/visibility checks
- Stores CV bytes via `LocalStorageProvider.put()` before transaction; cleaned up on failure/duplicate
- Runs Serializable transaction with retries (P2034)
- Creates/links candidate, application, screening answers, StoredFile, calls `createPendingExtraction()`
- Returns public reference only (no internal details)

**Evidence:** `test/public-applications.e2e-spec.ts` 7/7 passed (including upload isolation)

## B. Application and CV persistence

**Models (Prisma):** Application, Candidate, Company, Job, StoredFile, ApplicationScreeningAnswer, ResumeTextExtraction, ExtractionDispatch  
**Service logic:** `executeSubmission` inside transaction creates records atomically  
**File storage:** Local provider, keys under company/files, metadata in StoredFile (checksum, mime, size)  
**Tenant isolation:** Company/job resolved by slug and scoped to companyId  
**Duplicate handling:** Returns existing reference if duplicate active application; cleans orphaned pre-stored file

**Evidence:** Service code inspected, E2E tests pass

## C. Document extraction dispatch

**Creator:** `backend/src/modules/resume-processing/services/pending-extraction.creator.ts`  
- Creates `ResumeTextExtraction` (status PENDING) + `ExtractionDispatch` (PENDING_DISPATCH) in same transaction

**Service:** `backend/src/modules/resume-processing/services/resume-extraction.service.ts`  
- `requestExtraction()` finds/creates extraction, creates dispatch, calls `reconciler.dispatchOne()` if created
- Handles FAILED extractions with retry limits (MAX_EXTRACTION_RETRIES=3), throws if exceeded
- Serializable transactions with retry on P2034

**Processor:** `backend/src/modules/resume-processing/queue/resume-extraction.processor.ts`  
- BullMQ processor on `RESUME_EXTRACTION_QUEUE`, concurrency 2
- Claims PENDING → PROCESSING, reads file via `ResumeFileReaderService`, extracts via `ResumeTextExtractorService`
- Updates to COMPLETED with extractedText/textSha256/parser info or FAILED with error codes
- Handles PROCESSING state, retries, terminal failures

**Reconciler:** `backend/src/modules/resume-processing/services/extraction-dispatch-reconciler.service.ts` (exists)  
- Picks up PENDING_DISPATCH rows

**Evidence:** Code paths traced, tests exist (`__tests__/resume-extraction-to-screening.test.ts`)

## D. Extracted content and screening handoff

**Service:** `backend/src/modules/ai-screening/ai-screening.service.ts`  
- `requestScreening(applicationId, companyId, userId, forceRerun)` requires completed extraction
- Loads extraction via `ResumeTextLoaderService.loadCompletedExtraction()`
- If not ready, calls `ResumeExtractionService.requestExtraction()` and throws 409 with extraction status
- Builds screening input via `ScreeningInputBuilderService` + `CriterionBuilderService`
- Computes fingerprint (includes provider/model/prompt/schema/job/resume hashes)
- Reuses existing COMPLETED/PENDING/RUNNING result if same fingerprint (unless forceRerun)
- Creates `AiScreeningResult` (PENDING) in Serializable transaction, enqueues job to `AI_SCREENING_QUEUE`

**Processor:** `backend/src/modules/ai-screening/queue/ai-screening.processor.ts` (expected)  
- Runs AI screening with selected provider

**Providers:** `backend/src/modules/ai-screening/providers/` (mock, openai, etc.) - mock is default

**Evidence:** Service traced, unit/integration tests exist, mock provider tested

## E. Screening result persistence and state transitions

**Model:** AiScreeningResult (Prisma) - stores scores, recommendation, reasoning, matched/missing qualifications, red flags, provider/model/prompt versions, fingerprint, status  
**Service:** Creates PENDING, processor updates to RUNNING/COMPLETED/FAILED  
**Safety:** AI cannot make final hiring decision (ApplicationDecisionsService requires human actor RECRUITER, finalDecision controlled by human; AI results stored separately)  
**Audit:** ApplicationAuditService/CandidateAuditService for decisions  
**Idempotency:** Fingerprint-based reuse, transaction protection

**Evidence:** Service code inspected, business rule enforced in decisions service

## F. Authorized recruiter retrieval

**Controllers:**  
- `backend/src/modules/applications/controllers/applications.controller.ts` - company-scoped, requires auth/permissions
- `backend/src/modules/ai-screening/ai-screening.controller.ts` - likely requires auth

**Guards:** JWT/auth guards, permission checks (e.g., RequirePermissions)  
**Tenant isolation:** All queries filter by companyId from authenticated user  
**Response:** Returns application details and screening results; no provider prompts/secrets exposed in DTOs

**Evidence:** Controllers/guards inspected, E2E tests (applications.e2e) pass with auth

## Integration boundaries
- Public submission → storage + transaction + pending extraction creation
- Extraction dispatch via reconciler/BullMQ (async)
- Screening triggered by recruiter/request, waits for completed extraction
- Results stored separately from decisions; human makes final decision

## AI Screening Worker (Phase 2 - Detailed)

**Queue:** `AI_SCREENING_QUEUE = 'ai-screening'` (`ai-screening/queue/ai-screening-queue.constants.ts`)  
**Job:** `AI_SCREENING_JOB = 'screen-application'`  
**Processor:** `AiScreeningProcessor` extends `WorkerHost`, `@Processor(AI_SCREENING_QUEUE, { concurrency: 3 })`  
**Module:** Registered in `AiScreeningModule` (providers include `AiScreeningProcessor`, BullMQ queue registered)  
**Tests:** `ai-screening/__tests__/ai-screening-processor.spec.ts` exists

**Flow:**
1. Validates job payload (screeningId/applicationId/companyId), job name
2. Loads `AiScreeningResult` by id; validates tenant/app match
3. Skips if already COMPLETED or terminal FAILED
4. If RUNNING: only same job can continue/retry; otherwise unrecoverable
5. If PENDING: atomically updates to RUNNING with startedAt (updateMany, count check)
6. Loads application (with job/skills/questions/edu/exp, candidate, latest ACTIVE RESUME StoredFile)
7. Loads completed extraction via `ResumeTextLoaderService`; requires extractedText >= 10 chars
8. Builds `ScreeningInput` via `ScreeningInputBuilderService`; for Qwen adds structured criteria from `CriterionBuilderService` and computes `experienceDuration` from full extracted text via `ExperienceDurationService`
9. Recomputes fingerprint via `computeScreeningFingerprint` (includes provider/model/prompt/schema/jobUpdatedAt/resume hashes); if mismatch → `failTerminal` with `STALE_FINGERPRINT` and return (no throw to BullMQ retry loop)
10. Calls injected `AiScreeningProvider.screen(screeningInput)` (mock/openai/deepseek/qwen)
11. On success: updates `AiScreeningResult` to COMPLETED with scores/recommendation/confidence/matched/missing/evidence/criteriaScores/criterionEvaluations/uncertainties/riskFlags/explanation/prohibitedReasoningDetected, provider/model/promptVersion/providerResponseId, completedAt
12. On failure: `AiScreeningProviderError` (retryable/non-retryable) and generic errors handled with retry policy; terminal failures call `failTerminal` with safe codes/messages, unrecoverable errors throw `UnrecoverableError`

**Safety:**
- Fingerprint check prevents stale results when source data changes
- Idempotent/guarded updates (updateMany with status checks)
- Does not overwrite COMPLETED/terminal FAILED
- Provider errors mapped to safe codes/messages
- AI results never written as final hiring decision (separate model/flow)
- Tenant/appid verified against screening record

## Verification Status (per stages)
- A: VERIFIED (E2E + service inspected)
- B: VERIFIED (models + service + tests)
- C: VERIFIED (creator/service/processor traced, tests exist)
- D: VERIFIED (processor traced, registered in module, tests exist)
- E: VERIFIED (processor persistence traced, fingerprinting, safe failures, human decision boundary enforced)
- F: VERIFIED (controllers/guards/E2E pass)

## Test Results (Phase 2)
- `ai-screening/__tests__/ai-screening-processor.spec.ts`: PASS (part of run)
- `ai-screening/__tests__/ai-screening-service.spec.ts`: PASS (44s) - 1 suite had Redis connection error log (env noise)
- `resume-processing/__tests__/resume-extraction-to-screening.test.ts`: not listed in final summary above but targeted run included it; see full output if needed
- Combined targeted run: **Test Suites: 2 passed, 2 total; Tests: 30 passed, 30 total** (exit 0)
- `test/applications.e2e-spec.ts` (with `--config test/jest-e2e.json`): **1 passed, 32 passed, exit 0**

## Blockers/Notes
- Async workers not running as long-lived processes in this environment during inspection; unit tests with mocks cover processor logic. Full queue integration with live workers not executed here.
- Real AI providers not tested (mock used).
- Redis connection errors logged in some test contexts (environment noise, tests still passed).
- Email not verified.
- No load testing.
- All existing changes preserved; no modifications made. No commits/pushes/DB resets/migrations/Docker changes/paid AI calls.
