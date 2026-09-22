# Phase 2 — Implementation Report (TalentAI Assessment Engine)

> Date: 2026-09-22. Evidence is from the live repo, live DB (dev `:5432`, test `:5433`), real BullMQ + Redis, and the real Next.js/Vitest stack — no mocked HTTP at the e2e boundary.

## 1. Summary

Phase 2 delivered a complete recruiter-controlled assessment engine end-to-end: data model +
migrations, permission/audit/notification plumbing, candidate access (code + short-lived token),
immutable versioning, deterministic + AI rubric scoring with trustworthy evidence handling, async
bulk assignment, and recruiter + candidate frontend surfaces — all reusing the repo's existing
NestJS/Prisma/BullMQ, permission, idempotency, audit, notifications, and AI-provider infrastructure.

## 2. Migration integrity

- `20260922090000_add_assessment_engine` — assessment tables + enums + `assessments.*` permission
  backfill. Applied with `prisma migrate deploy` (not `migrate dev`, which this environment cannot run).
- `20260922100000_assessment_audit_extra` — adds `ASSESSMENT_STARTED`/`ASSESSMENT_EXPIRED` audit
  events; drops the never-used draft enums `AssessmentCriterionStatus`/`AssessmentEvidenceVerification`.
- Both applied to **dev** (`:5432`) and **test** (`:5433`) databases; `npx prisma validate` and
  `npx prisma format` clean.
- Operationally important: PowerShell `>` / `Set-Content` can write UTF-16; migration files were
  rewritten as UTF-8 via node `fs` and are byte-clean.

## 3. Backend (NestJS, `backend/src/modules/assessments/`)

Services:
- `assessments.service` — CRUD on assessments; tenant-scoped; `archive`.
- `assessment-validation.service` — pure, exhaustive publish validation (see §7 of the architecture
  doc). Fully unit-tested.
- `assessment-scoring.service` — deterministic actor; unit-tested scalings per question type.
- `assessment-code.service` / `assessment-token.service` — `XXXX-XXXX` code + sha256 hash; short-lived JWT.
- `assessment-generation.service` — AI question generation (strict schema, `aiApproved=false`).
- `assessment-assignments.service` — assign, dedupe, retake; enqueues bulk jobs.
- `assessment-sessions.service` — candidate session lifecycle (create on first access, start, expiry,
  response save with optimistic `baseUpdatedAt`/`STALE_WRITE`, submit-once lock). Candidate DTOs
  constructed without any correct-answer/secret fields; own saved responses returned on refresh.
- `assessment-evaluation.service` — evaluation attempts, enqueue, retry, safe failure messages.
- `assessment-results.service` — score aggregation into `AssessmentResult` + threshold context.

AI layer:
- `assessment-ai-provider.interface.ts` + `assessment-ai-provider.token.ts` — DI-injectable provider.
- `assessment-output.schema.ts` — strict JSON schema (unknown-key rejection, bounds, cross-field checks);
  API drops any model-supplied overall score.
- `assessment-evidence.service.ts` — `VERBATIM/SUPPORTED/INFERRED/UNVERIFIED`; fabricated evidence is
  `UNVERIFIED` and terminal.
- `mock-assessment.provider.ts` — scenario-driven fixtures (`provider_failure`, `malformed`,
  `fabricated_evidence`, ...) for tests.
- `qwen-assessment.provider.ts` — OpenAI-compatible client (`QWEN_BASE_URL`, model `qwen3.5:9b`,
  clamped timeout, prompt with injection-safety instructions).

Queue:
- `assessment-queue.constants.ts` + `assessment.processor.ts` — `assessment-evaluation` queue;
  `evaluate-submission` (jobId = evaluation id) and `bulk-assign` (dedup id, chunk 100). Processor
  concurrency from config; terminal fabricated-evidence path preserves the deterministic result.

Controllers:
- `assessments.controller.ts` — `@Controller('assessments')`, all guarded
  (`JwtAuthGuard + PermissionsGuard` + `@RequirePermissions('assessments.*')`).
- `public-assessments.controller.ts` — `@Controller('public/assessments')`, bearer-aware,
  `@Throttle(10–120/min)`, leak-free candidate DTOs.

## 4. Frontend (Next.js, `src/…`)

- `lib/api/assessments.api.ts` — typed recruiter + candidate client.
- `lib/assessments/assessment-helpers.ts` — formatting helpers.
- `components/assessments/question-builder.tsx`, `assessment-manager.tsx`,
  `assessment-result-view.tsx`, `application-assessment-panel.tsx`.
- `app/jobs/[jobId]/assessments/page.tsx` (Job Workspace route), `app/assessments/start/page.tsx`,
  `app/assessments/take/page.tsx`.
- `components/recruitment/job-workspace.tsx` — new `assessments` tab (ClipboardList).
- `components/recruitment/application-workspace.tsx` — assessment panel + result review dialog.
- Candidate take flow: welcome → start → timed answering → autosave (800 ms text / immediate choice),
  save-state chips, STALE_WRITE rebase-and-retry-once, timer resync after save, submit-once.

## 5. Config / email / permissions wiring

- `config/loaders/assessment.config.ts` registered in `config/index.ts`; namespace `assessment`.
- `app.module.ts` registers `AssessmentsModule`.
- `seed.ts` + `auth.constants.ts`: `assessments.read/create/update/publish/assign/review` grants.
- `email.service.ts` `sendAssessmentAssignedEmail`; `email.worker.ts` `recruitment.assessment-assigned`.

## 6. Test evidence (all run post-formatting, clean)

| Suite | Run | Result |
|---|---|---|
| Backend unit (assessments) | `npx jest --runInBand src/modules/assessments` | **40 passed / 5 suites** |
| Backend unit (email + notifications + idempotency, regression) | `npx jest --runInBand src/modules/email src/modules/notifications src/common/idempotency` | **65 passed / 4 suites** |
| Backend e2e (assessments) | `npx jest --config ./test/jest-e2e.json test/assessments.e2e-spec.ts` | **21 passed / 21** |
| Backend typecheck | `npx tsc --noEmit` | clean |
| Backend build | `npm run build` (nest build) | success |
| Frontend typecheck | `npx tsc --noEmit` | clean |
| Frontend build | `npm run build` (next build) | success (all routes, incl. `/assessments/*`) |
| Frontend unit (assessments) | `npx vitest run` (helpers 6 + result-view 3 + question-builder 3) | **12 passed / 3 files** |

e2e coverage includes: full lifecycle; immutable version (edit-after-publish rejected); duplicate
assignment dedup; code verify; candidate payload leak-free (asserts no `isCorrect`/rubric/competency);
start + expiry; autosave + optimistic collision; invalid option rejection; submit-once; post-submit
lock; deterministic + mock scoring math (`15+2/24 → 70.83`); app-state; v1/v2 isolation; tenant
isolation (hides A from B, rejects cross-company write); unauthenticated 401; bulk assignment
truthful partial success (2 assigned / 1 skipped).

Frontend note: `npm run lint` still reports pre-existing errors in **untouched** Phase 1 files
(e.g. `react-hooks/set-state-in-effect` in `pipeline-board.tsx`, `react/no-unescaped-entities`,
`verification/*.mjs` `no-require-imports`). New assessment files were linted in the same run and add
only the same class of `set-state-in-effect` warning that the rest of the repo already accepts; no
unused-vars or unescaped-entity errors were introduced. The backend `lint-baseline.js` reports growth
only for files modified in the last Phase 1 qwen commits (`ai-interviews/*`, `interviews/*`,
`test/qwen-hf-verify.ts` — none touched by Phase 2); the Phase 2 file set is prettier-clean.

## 7. Known issues / caveats

- `prisma migrate dev` is unavailable in this environment (non-interactive detection); all migration
  work uses `migrate diff` + `migrate deploy` and is recorded in the acceptance report.
- The `qwen` assessment provider is implemented and injectable but was **not** exercised against a live
  Qwen endpoint (Qwen GPU infra is a Phase-1 non-goal; `mock` is the default provider). Evaluation
  failures and retry paths are proven with `mock` scenarios.
- Frontend lint follows the existing repo tolerance for `set-state-in-effect` (already present across
  the codebase); no new error classes were introduced.
- Emails fail silently when SMTP is down (matching the repo-wide Phase 1 behavior); the DB/queue path is
  what is asserted in tests.