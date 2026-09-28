# Phase 2 — External Product Verification Report

> Independent checkpoint on the TalentAI assessment engine. Companion documents:
> [`PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_AUDIT.md`](./PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_AUDIT.md) (audit trail),
> [`PHASE_2_ACCEPTANCE.md`](./PHASE_2_ACCEPTANCE.md) (PRD matrix).
> Status vocabulary (final): **VERIFIED** / **PARTIAL** / **BLOCKED** / **DEFERRED** / **NOT IMPLEMENTED**.
> Claim discipline: browser/runtime evidence wins; repository evidence over reports; we do not claim
> what we did not observe.

---

## 1. Scope and rules

- Object of verification: the Phase 2 recruiter assessment engine — builder, publish validation,
  immutable versions, candidate access/session/timer/autosave, deterministic + AI-evaluated scoring,
  single and bulk assignment, results review, audit, notifications, analytics, and the recruit-side UI.
- Method: (1) prior-claim → repository evidence; (2) automated gates (backend `tsc` + jest, frontend
  `tsc` + vitest + `next build`); (3) real-browser Playwright journey against FE `:3001` + BE `:3000`
  with Postgres `:5432` + Redis `:6379` (Docker).
- Change policy: only the bulk-assign UI was pre-authorized. Every other code change in this pass was
  driven by an observed problem → root cause → minimal fix → test → proof (BUG-01…BUG-04, report §5).
  No new dependencies; no new endpoints; no Phase 3; no HF spend.
- Verification identity: fresh run-scoped company per journey (`ext-*@e2e.com`), exact-row cleanup,
  refuses non-local DBs.

## 2. Repository and commit baseline

| Item | Value |
|---|---|
| Branch | `main` |
| Baseline HEAD | `b74df37c8e4078ca6a59b87642dda8f3c919f519` (`docs(phase2): record closure audit and close-out commit`) |
| Baseline tree | clean |
| Push remote | `analysis` = `JupathoClaus/AI-RECRUITING-ANALYSIS` (fetch+push; `origin` = `AkademiaLimited/AI-Recruiter-Agent` is unreachable by the authenticated account) |
| This pass | one new feature commit + docs (see §10) |

## 3. Environment

- Services (checkpoint): Backend NestJS `:3000` (`backend/start-prod.js` → `dist/`), Frontend Next.js
  `:3001` (`next start`), Postgres `:5432` (dev) / `:5433` (test), Redis `:6379` / `:6380` (dev/test).
- Local env convention: `backend/.env` uses `127.0.0.1` hosts; the file is gitignored and holds real
  SMTP/app credentials — nothing was committed. Only `.env.example` (documenting the assessment
  access-token secret) and `test/env/test.env` are tracked.
- **Host stability (09-25→09-28)**: the machine rebooted mid-pass and Docker Desktop/WSL was slow to
  recover. The runtime was restored (Postgres `:5432`/`:5433`, Redis `:6379`/`:6380`, backend `:3000`,
  frontend `:3001`) and ALL runtime verification was re-executed against the restored stack: browser
  journey 42/42, bulk-assign UI proof 12/12, Phase 1 smoke 13/13, and the DB-backed backend jest suite
  (see §§4, 7–9). Code-level gates were green throughout.

## 4. Claim → evidence verdicts (updated through this pass)

| Claim | Verdict | Evidence basis |
|---|---|---|
| 5 question types end-to-end | VERIFIED | Prisma `AssessmentQuestionType` (`schema.prisma:2773`), frontend union, builder, candidate take page; journey built SINGLE_CHOICE + LONG_TEXT+rubric and answered both |
| Builder add/edit/delete/reorder/options/correct/points/rubric | PARTIAL | `question-builder.tsx` full edits + up/down reorder (no drag), no inline validation, rubric weight/description not editable — server validation surfaces `issues[]` honestly; PARTIAL is a product trims, not a defect |
| Publish validation guard-rails | VERIFIED | `assessment-validation.service`; journey: valid draft → "Ready to publish."; empty draft → 400 `ASSESSMENT_NOT_PUBLISHABLE` with `issues[]`, publish blocked (was a 500 → BUG-01) |
| Immutable published versions (copy-on-write) | VERIFIED (code/e2e) | `updateMany DRAFT→PUBLISHED`, e2e `edit-after-publish rejected`, cross-version 404 |
| Candidate code access + short-lived token + throttles | VERIFIED | verify-code 200 + JWT (secret no longer crashes — BUG-03); throttle matrix (`public-assessments.controller.ts:30-71`) |
| Session/timer/expiry/autosave/submit-once | VERIFIED | Journey: choice + text autosave (server-polled), reload persistence, review→submit→confirmation; submit idempotency suite |
| Deterministic choice scoring | VERIFIED | `assessment-scoring.service.ts:73` clamp, mock eval produced exact `totalScore=85.71` for the fixed answer set |
| AI rubric evaluation + no fabricated totals | VERIFIED (mock path) | strict output schema, evidence service, evaluation clamp; live-model behavior DEFERRED (no live Qwen; `mock` default) |
| Evaluation retry, attempt 2, no duplicate rows | VERIFIED (prior e2e) | closure e2e |
| Bulk backend (async, per-row truthful, dedup) | VERIFIED | mass spec 2/2 (1,000 apps ~24 s ≈ 42 rows/s), per-row `ALREADY_ASSIGNED`, content-addressed re-run dedup; throughput claim = assignment only |
| Idempotency convergence | VERIFIED | 14/14 idempotency suite (concurrent same-key), closure 4-parallel-submit; compensation moved out of tx (BUG-02) |
| Audit trail incl. REVIEWED | VERIFIED (e2e) | `ASSESSMENT_REVIEWED` enum + migration applied dev+test |
| Notifications + email | PARTIAL → BLOCKED BY ENVIRONMENT | In-app notifications proven in review flow; email jobs enqueued; end-to-end SMTP delivery not observable on this host (`:1025` unprovisioned) |
| Result review UI | VERIFIED | browser result dialog + score/breakdown + axe green (BUG-04 fixed unnamed progressbars) |
| Application workspace panel | VERIFIED | browser: workspace panel shows assessment + score, review opens dialog |
| Candidate profile assessment history | DEFERRED | requires a batch endpoint to avoid N+1 per-row fetch (20 calls/view); documented decision |
| Analytics (manager summary tiles) | VERIFIED scoped | tiles on manager; deeper charts DEFERRED |
| **Bulk-assign UI** | **VERIFIED (browser)** | `Assign assessment (N)` in applications bulk bar (report §6); browser proof 12/12 (queue→poll→counts `assigned=2, skipped=0, failed=0`, DB unique rows, content-addressed re-queue dedup, per-row `ALREADY_ASSIGNED` on a distinct request); tsc/vitest/build green |
| Tenant / candidate isolation | VERIFIED (prior e2e) | adversarial 401/404/leak-proof payloads |
| Responsive candidate flow + a11y | VERIFIED (assessment surfaces) | 1440/1366/390 viewports no-overflow; axe on manager steps, candidate take page, result dialog → `0 serious/critical` |

## 5. Bugs found → root cause → fix → proof

| # | Symptom | Root cause | Fix | Proof |
|---|---|---|---|---|
| BUG-01 | Publishing an **empty draft** → HTTP **500** | domain error without `code`/`issues`; global filter 500'd it | 400 `ASSESSMENT_NOT_PUBLISHABLE` + `issues[]`; `ApiErrorResponse` carries `issues[]`; manager renders them | journey `validate-empty` (issues listed, publish blocked); spec extended |
| BUG-02 | rare concurrent same-key create→commit produced double compensation / masked original error | compensation tx nested inside idempotency update tx | compensation moved outside the tx; failure paths rethrow original error | idempotency suite 14/14 (DB-backed); full backend suite 1436/1436 (§8) |
| BUG-03 | `POST /public/assessments/verify-code` → **500** ("ASSESSMENT_ACCESS_TOKEN_SECRET is not configured") | secret not required at boot config | Joi required (min 32), TTL + provider vars; `.env` set; `.env.example` documents generation | verify-code 200 + JWT in candidate flow; `validation.spec.ts` 23/23 |
| BUG-04 | result dialog progressbars unnamed (axe `aria-progressbar-name`, serious ×2) | `<Progress>` without `aria-label` | aria-labels on overall + per-competency bars | result-dialog axe `0 serious/critical` |

## 6. New capability this pass: bulk-assign UI (§4 gap #1)

Pre-implementation state: `bulkAssignAssessment` + `getBulkAssignJob` existed with **zero UI callers**;
the applications bulk bar was screening-only. Added:

- **Action** — "Assign assessment (N)" in the applications bulk bar (only when rows are selected; disabled
  until a job is in scope).
- **Picker dialog** — job-scoped assessment list from `listAssessments({ jobId })`; only versions with
  `status === 'PUBLISHED'` are selectable (radio group shows `Version n · <q> questions · <pts> points`);
  honest empty/loading states.
- **Confirm** → `bulkAssignAssessment(versionId, { applicationIds })` — reuses the authenticated v1 bulk
  endpoint; selection is capped by the backend's `@ArrayMaxSize(500)` + `BULK_TOO_LARGE`.
- **Progress** — inline panel polls `getBulkAssignJob(jobId)` (~3 s) and reports `assigned / skipped
  (already assigned) / failed`; on completion the row list refreshes and the selection clears.
- No new endpoint, no new state system, no new dependency; reuses table selection + existing dialog/panel
  styling. Implementation: `src/components/recruitment/application-list-view.tsx`.

Verification: frontend `tsc --noEmit` clean; vitest suite green (with `--testTimeout=30000` on this host);
`next build` exit 0. **Browser proof 12/12** (`verification/phase2-bulk-assign-proof.mjs`): queue→poll→panel
counts (`assigned=2, skipped=0, failed=0`), DB holds exactly 2 rows; **identical re-queue is content-addressed**
(`deduplicated: true`, DB unchanged — re-run dedup, not a bug); a distinct bulk request for the same apps hits
per-row `ALREADY_ASSIGNED` (`skipped=2`, DB unchanged); zero browser errors. Also Phase 1 smoke 13/13 (§7).

## 7. Browser journey — executed checks (script `verification/phase2-assessment-journey.mjs`)

Green run (post-fix build, restored runtime, 42/42 checks, EXIT 0). Flow and assertions:

```
setup            register-company · activate-user (DB) · api-login (JWT) · setup-fixtures (job PUBLISHED + 2 applications)
recruiter 1440   login-ui · jobs-list · assessments-tab · manager-1440 no-overflow · create-assessment · build-questions
                 (choice + long-text + rubric, server-confirmed) · validate-ui ("Ready to publish.") · publish-ui ·
                 validate-empty (N issues, publish blocked) · assign-ui (single, well-formed XXXX-XXXX code intercepted)
candidate a 1366 invalid-code (alert) · welcome (Start assessment) · started (questions rendered) · session-id ·
                 autosave-choice (server-polled) · autosave-text (server-polled) · reload-persist (radio + text
                 survive reload) · answering no-overflow · axe (0 serious/critical) · submit (Review → Submit →
                 Confirm) · submitted no-overflow
assign-b 1440    second application assigned (code intercepted)
candidate b 390  abbreviated mobile pass: invalid-code · welcome · started · autosave-choice · autosave-text ·
                 answering no-overflow · axe (0 serious/critical) · submit · submitted no-overflow
result           evaluation-complete (totalScore=85.71, mock deterministic) · workspace-panel (assessment row +
                 Score on application) · workspace-1440 no-overflow · result-dialog (score / 100 + breakdown) ·
                 result-dialog axe (0 serious/critical)
budget           browser-error-budget: zero console.error/pageerror/request-failed(non-ERR_ABORTED)/HTTP ≥500
```

- Autosave integrity trick: "Saved ✓" is DOM-optimistic; the script polls
  `GET /api/v1/public/assessments/session` with the candidate scoped token until the server holds the
  expected response count, so reload-persist is never asserted before persistence.
- Error budget filters: `net::ERR_ABORTED` (Next.js RSC prefetch/navigation cancel) and URL-less
  "Failed to load resource:" console noise are benign; every other console/pageerror/network failure and
  any HTTP ≥500 counts.

## 8. Automated gates (this pass)

| Gate | Result | Note |
|---|---|---|
| Backend `tsc --noEmit` | PASS | clean |
| Backend `validation.spec.ts` (config boot schema) | 23/23 PASS | incl. +3 new BUG-03 cases |
| Backend jest full suite | 1436 passed / 1436 total (84 suites) PASS | re-run with Postgres up; the prior 14 DB-backed idempotency failures (offline DB) are cleared; incl. `validation.spec.ts` 23/23 + idempotency 14/14 + assessment-validation |
| Frontend `tsc --noEmit` | PASS | ~14 min on this host (very slow machine) |
| Frontend vitest | PASS | 375/375 with `--testTimeout=30000`; earlier default-timeout (5 s) runs flaked only on Radix-dialog interaction tests that need 6–30 s on this host — each re-ran green in isolation, no logic failures |
| Frontend `next build` | PASS | incl. the new bulk-assign UI |
| Browser: Phase 2 journey | 42/42 PASS | post-fix build, restored runtime (§7) |
| Browser: bulk-assign UI proof | 12/12 PASS | `verification/phase2-bulk-assign-proof.mjs` (§6) |
| Browser: Phase 1 smoke | 13/13 PASS | `verification/phase1-smoke.mjs` — recruit-side pages + tenant isolation (§7) |
| Git secrets scan of the diff | PASS | no credentials/keys/tokens (`.env` untracked) |

> Config-suite fix this pass: the pre-existing "apply defaults for auth environment variables" test didn't
> include the (now required) assessment access-token secret → it failed with the new schema. Fixed by adding
> a valid secret to its fixture (matches the pattern the mandatory-secret tests already used).

## 9. Blocked / deferred / partial (final status)

| Item | Status | Reason / note |
|---|---|---|
| SMTP end-to-end delivery of assignment/submit emails | BLOCKED BY ENVIRONMENT | `:1025` SMTP unprovisioned; queue jobs exist (mass spec: 1001 jobs) but no mailbox on this test host can confirm delivery; in-app notifications are proven |
| Live Qwen evaluation (provider/model/latency in real runs) | DEFERRED | `ASSESSMENT_AI_PROVIDER=mock` default; provider injectable; strict-schema + evidence paths unit/e2e proven with mock scenarios |
| Candidate profile assessment history | DEFERRED | needs a batch state endpoint to avoid N+1; documented decision |
| Analytics deep charts (job/global) | DEFERRED | manager summary tiles proven; deeper metrics not in scope |
| Builder trims (drag reorder, inline validation, rubric weight/description editors) | PARTIAL | documented product trims; server validation is honest and visible |
| LIVE migration/applied state re-check | see acceptance doc | migrations already applied dev+test (`20260922120000_assessment_review_audit`) |

## 10. Deliverables of this pass

- Feature: bulk-assign UI in the applications bulk bar (`src/components/recruitment/application-list-view.tsx`).
- Fixes: BUG-01 (empty-publish 400 + `issues[]` passthrough), BUG-02 (idempotency compensation out of tx),
  BUG-03 (assessment access-token secret boot validation + `.env`/`.env.example`), BUG-04 (result dialog
  progressbar names).
- Tests added/extended: `backend/src/config/__tests__/validation.spec.ts` (+3, and 1 fixture fix),
  assessment-validation, idempotency, global-exception-filter specs.
- Verification: `verification/phase2-assessment-journey.mjs` (42/42 browser journey, EXIT 0),
  `verification/phase2-bulk-assign-proof.mjs` (12/12), `verification/phase1-smoke.mjs` (13/13).
- Docs: this report, updated audit.

Commit + final SHA: see the go-to-summary block returned with this report.