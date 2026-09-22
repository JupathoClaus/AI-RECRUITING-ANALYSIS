# Phase 2 — Closure Audit (Assessment Engine Production Gaps)

> Date: 2026-09-23. Independent close-out pass on the Phase 2 assessment engine. Scope: find and close
> only **genuine production gaps** in the shipped engine, prove each fix with automated evidence, and
> audit the result. No re-architecture was performed.
>
> Verdict labels: **FIXED + PROVEN** (change + automated evidence), **VERIFIED** (existing behavior
> confirmed safe by code reading + evidence), **DEFERRED / OUT OF SCOPE** (intentionally not changed).

## 1. Scope boundary

In scope: assessment engine correctness, isolation, audit, idempotency, bulk path, and backfill
proofs. **Not changed**: Phase 3 features (semantic search / pgvector, new AI UX/UI redesigns),
generation-provider rework, the HF L4/Qwen Space experiment. No new schema beyond the single audit
enum value described in §4.

## 2. Gaps found & closed

| ID | Finding | Verdict | Evidence |
|---|---|---|---|
| G1 | `parseAssessmentWorkerConcurrency` parsed a raw env string; `''`/garbage → `NaN` → fall-through to clamp `20`, silently forcing max concurrency | **FIXED + PROVEN** | Rewritten env-value-safe (`undefined/null/''` → 3, clamp `[1,20]`); new `assessment.processor.spec.ts` (defaults, reads, clamps) |
| G2 | Bulk `assignOneForBulk` recorded no per-row `ASSESSMENT_ASSIGNED` audit and no candidate email — single-assign parity missing | **FIXED + PROVEN** | `assessment-assignments.service.ts` now records audit (RECRUITER actor, both actor ids, in-tx) + `queueCandidateEmail` per row, both `.catch(() => undefined)`; null-safe `notifiable`; processor passes `requestedByUserId` |
| G3 | `ASSESSMENT_REVIEWED` audit event could not be recorded (missing from enum) and the result/re-evaluation path did not audit a review | **FIXED + PROVEN** | Migration `20260922120000_assessment_review_audit` (`ALTER TYPE … ADD VALUE 'ASSESSMENT_REVIEWED'`), applied to dev `:5432` + test `:5433`; `AssessmentResultsService.getResult(…, actor?)` records the review audit; retry records it too; controller passes `actorOf(user)` |
| G4 | `IdempotencyService.executeTransactional` had no `P2002` branch for a concurrent same-key insert — competitors surfaced a serialization crash / unique-constraint failure instead of converging (`type-level` return couldn't happen). Reproduced end-to-end (unique-constraint errors + a 409 during parallel submits) | **FIXED + PROVEN** | New catch branch: on `P2002` re-read the claim row → `COMPLETED`: `checkHashOrThrow` + replay; `PROCESSING`: return. Unit test "fresh-key concurrent insert: P2002 competitors converge, executor runs once" (idempotency suite 13/13). Closure e2e "accepts 4 concurrent submits and produces exactly one evaluation" |
| G5 | Evidence counter-evidence path (candidate denial downgrades a claim) had no direct unit coverage | **FIXED + PROVEN** | New unit test in `assessment-evidence.service.spec.ts` (fake claim + candidate denial → `UNVERIFIED`); assessments unit suite 40 → 44 |

## 3. Review outcomes (verified / intentionally unchanged)

| Item | Outcome | Basis |
|---|---|---|
| Bulk-assign duplicate handling | **VERIFIED — documented design, no bug** | `bulkAssign` content-addresses jobs (`bulk-assign-<sha256(versionId, sorted ids, dueAt, by)>`); an identical re-run returns the **original** job (`deduplicated: true`) and never re-processes. Different id sets run the real per-row path, where `(applicationId, versionId)` unique + `findUnique` guard → `ALREADY_ASSIGNED` skipped. Proven by the gated mass-recruitment spec |
| Candidate payload leak-proofing | **VERIFIED** | Closure e2e asserts candidate DTOs never carry `isCorrect`/rubric/competency/scores/grading state |
| Expiry enforcement (time race) | **VERIFIED** | Closure e2e: forced imminent deadline → 409 on start/write/submit, `EXPIRED` status, `ASSESSMENT_EXPIRED` audit, race-safe |
| Stale-write guardrails | **VERIFIED** | Closure e2e: fresh writes pass, stale `baseUpdatedAt` → 409 `STALE_WRITE`, single upsert row per question |
| Cross-version question isolation | **VERIFIED** | Closure e2e: question id from another version → 404 |
| Candidate-token isolation | **VERIFIED** | Closure e2e: candidate token rejected (401) on every recruiter-scoped route, still served on candidate routes |
| Fabricated-evidence terminal floor | **VERIFIED** | Closure e2e: `FABRICATED_EVIDENCE` → deterministic-only result (`totalScore 75`, `aiScore` null), then clean re-evaluation (attempt 2, no duplicate rows) |
| Notification fan-out on assign/submit/evaluate | **FIXED + PROVEN** | In-app + email enqueue wired; closure e2e asserts the in-app notification row (poll-based) |
| Audit-trail completeness (`ASSESSMENT_*`) | **FIXED + PROVEN** | Closure e2e asserts every lifecycle event through review + re-evaluation; descriptions never leak answers/markers |
| G4/G5/G6 from prior review (generation provider bypass, redundant token-binding double-check, duplicated migration backfill) | **DEFERRED / OUT OF SCOPE** | Documented previously; no production-behavior defect; leaving untouched to avoid churn |

## 4. Schema / migrations

- `Schema.prisma`: `ApplicationAuditEventType` gains `ASSESSMENT_REVIEWED`.
- `backend/prisma/migrations/20260922120000_assessment_review_audit/migration.sql`: one
  `ALTER TYPE "ApplicationAuditEventType" ADD VALUE 'ASSESSMENT_REVIEWED';`.
- Applied with `prisma migrate deploy` to **dev `:5432`** and **test `:5433`**; `prisma validate` clean.

## 5. The 1,000-application bulk path (gated load proof)

`backend/test/mass-recruitment.e2e-spec.ts` (`describe.skip` unless `MASS_RECRUITMENT=1`):

- 1,000 real `Application` rows (raw SQL) at bulk-scope: 2 concurrent requests of 500 each.
- Result (real BullMQ + PostgreSQL): **1,000 bulk-assigned in ~24 s (~42 rows/s)**, 100% unique
  `codeHash`es, **1,001 email jobs** ≥ 1,000 waiting, and **exactly 1 assignment + 1 session per
  application** (counts asserted).
- Re-runs: identical id sets return the original content-addressed jobs (`deduplicated: true`),
  DB stays at exactly 1,000 rows; a shifted id set runs the per-row path and reports
  `assigned 0 / skipped 100 / failed 0` (`ALREADY_ASSIGNED`).

## 6. Final verification matrix (all green this session)

| Gate | Result |
|---|---|
| Backend unit — full sweep `npx jest --runInBand` | **1,430 / 1,430 tests, 84 suites PASS** |
| Backend unit — assessments module | **44 / 44 tests, 6 suites PASS** |
| Backend unit — idempotency (incl. new P2002 test) | **13 / 13 PASS** |
| Backend e2e — closure suite `test/assessments-closure.e2e-spec.ts` | **20 / 20 PASS** |
| Backend e2e — base suite `test/assessments.e2e-spec.ts` (Phase 1 regression) | **21 / 21 PASS** |
| Backend e2e — mass recruitment (gated, `MASS_RECRUITMENT=1`) | **2 / 2 PASS** |
| Backend typecheck `npx tsc --noEmit` | clean |
| Backend build `npm run build` (nest build) | success |
| Frontend typecheck `npx tsc --noEmit` (root) | clean |
| Frontend build `npm run build` (next build) | success (all routes) |
| Migration deploy (`migrate deploy` `:5432` + `:5433`) | both applied |
| Secrets scan of working diff | no credentials/keys/tokens found |

## 7. Residual caveats (unchanged, honest)

- SMTP is down in this environment → emails fail silently (repo-wide Phase 1 behavior); the DB/queue
  path is what is asserted. In-app notifications are proven.
- The `qwen` assessment provider is injectable but not exercised against a live endpoint (Phase-1
  non-goal; `mock` is the default). Evaluations use `mock` scenarios.
- No browser-level verification was run for this phase; frontend integrity rests on `tsc`, `next build`,
  and API-level e2e (labeled honestly).
- `prisma migrate dev` is unavailable (non-interactive detection); `migrate diff` + `migrate deploy`
  only.

## 8. Close-out

- Commit: `fix(phase2): close assessment engine production gaps` (this change set, pushed to
  `analysis/main`).
- Files: `backend/src/modules/assessments/services/assessment-assignments.service.ts`,
  `assessment-results.service.ts`, `assessment-evaluation.service.ts`,
  `controllers/assessments.controller.ts`, `queue/assessment.processor.ts`,
  `backend/src/common/idempotency/idempotency.service.ts`,
  `backend/prisma/schema.prisma` + `20260922120000_assessment_review_audit`,
  tests: `assessment.processor.spec.ts`, `assessment-evidence.service.spec.ts`,
  `idempotency.service.spec.ts`, `test/assessments-closure.e2e-spec.ts`,
  `test/mass-recruitment.e2e-spec.ts`, this audit.