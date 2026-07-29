<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Session Summary (July 29, 2026)

### Root cause fixed: `parserName` / `parserVersion` mismatch in `requestExtraction`

The worker's COMPLETED update overwrites `parserName` (e.g. `pdf-parse` → `mammoth`) and `parserVersion`, but `requestExtraction`'s `findFirst` query filtered by the *original* config values. This meant a COMPLETED extraction was never found by subsequent calls, causing duplicate extractions on every replay.

**Fix** (`resume-extraction.service.ts:66-73`): removed `parserName` and `parserVersion` from the `findFirst` WHERE clause. `sourceFileSha256` is sufficient to identify a matching previous extraction. Also removed same filters from the `failedCount` query for consistency.

**Consequence:** the `extraction-concurrency.e2e-spec.ts` test now passes — 5 concurrent callers produce 1 CREATED + 4 REUSED, the worker completes the extraction, and the replay returns REUSED with the same extraction ID.

### Extraction dispatch rewrite (from July 28)
- `dispatchPending()` re-reads committed dispatch/extraction, claims atomically (PENDING→DISPATCHING), verifies file exists, calls queue.add with deterministic job ID, marks DISPATCHED/DISPATCH_FAILED
- Pre-reads file buffer as base64 in job data (`fileBuffer` field) — worker uses it to bypass filesystem race
- Extended `ResumeExtractionJobData` interface with `fileBuffer`, `fileMimeType`, `fileOriginalName`, `fileChecksumSha256`, `fileSizeBytes`
- Worker uses `updateMany` (not `update`) for COMPLETED/FAILED to avoid crashing on deleted records
- Prisma schema: added `dispatchAttempts`, `lastErrorCode`, `leaseStartedAt`, `nextAttemptAt` to `ExtractionDispatch`; migration `add_dispatch_attempts`

### Extraction dispatch reconciler (July 29)
- Created `ExtractionDispatchReconcilerService` (`extraction-dispatch-reconciler.service.ts`) as independent dispatch service with:
  - `reconcile()` — batch processes all PENDING_DISPATCH, DISPATCH_FAILED (with backoff), and stale DISPATCHING dispatches
  - `dispatchOne()` — atomic lease-based claim (PENDING_DISPATCH/DISPATCH_FAILED → DISPATCHING), file existence check, `queue.add`, mark DISPATCHED
  - Stale DISPATCHING recovery: checks if BullMQ job exists (→ mark DISPATCHED) or reclaims to PENDING_DISPATCH with backoff
  - Exponential backoff: `base * 2^(attempt-1)`, max 300s, up to 5 retries, then permanently marks DISPATCH_FAILED
- Refactored `ResumeExtractionService` to delegate dispatch to reconciler (removed inline `dispatchPending()`)
- Added Prisma indexes: `(dispatchStatus, nextAttemptAt)` for retry polling, `(dispatchStatus, leaseStartedAt)` for stale lease scan
- Replaced `--forceExit` with `--detectOpenHandles` in `test:e2e:ci`
- Replaced PowerShell lint scripts with portable Node.js scripts (`lint-changed.js`, `lint-baseline.js`)

### Known issues
- Backend build OOMs in Turbopack — need `NODE_OPTIONS=--max-old-space-size=4096`
- SMTP on port 1025 unavailable (email fails silently — harmless)
- File deletion on disk ~1.5s after test start still unexplained (suspected external process)
- Jest "did not exit" with all e2e suites (BullMQ workers / Redis handles) — individual suites exit cleanly
