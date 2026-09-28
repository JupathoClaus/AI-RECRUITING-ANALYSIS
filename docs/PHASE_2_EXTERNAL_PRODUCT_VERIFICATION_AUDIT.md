# Phase 2 — External Product Verification Audit

> Independent checkpoint. Pre-implementation repository state captured 2026-09-24;
> post-implementation results recorded 2026-09-25. Companion report:
> [`PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_REPORT.md`](./PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_REPORT.md).
> Rule applied throughout: previous report claim → actual repository implementation → automated
> evidence → runtime/browser evidence → VERIFIED / PARTIAL / BLOCKED / DEFERRED.
> The repository wins over reports; runtime wins over the repository.

## 1. Repository state

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD SHA (pre-implementation) | `b74df37c8e4078ca6a59b87642dda8f3c919f519` (`docs(phase2): record closure audit and close-out commit`) |
| Working tree (pre) | clean (`git status`: nothing to commit) |
| Ahead of `origin/main` | 13 commits (`origin` = `AkademiaLimited/AI-Recruiter-Agent`, unreachable — auth) |
| Push remote | `analysis` = `JupathoClaus/AI-RECRUITING-ANALYSIS` (fetch+push) |
| Phase 2 commits on `main` | `f3d8b63` feat / `375d9b6` docs / `3e9a50b` fix / `b74df37` docs (all present, verified via `git log`) |

## 2. Runtime environment (this checkpoint)

| Service | State |
|---|---|
| Backend NestJS `:3000` | See §8 (post-fix). At checkpoint 09-24: UP — freshly built (`nest build` exit 0, `dist/src/main.js`) via `backend/start-prod.js`, `/api/v1/health` 200, DB+Redis checks up |
| Frontend Next.js `:3001` | See §8 (post-fix). At checkpoint 09-24: UP — existing `.next` production build, `/login` 200 |
| Postgres `:5432` (dev `talentai`) / `:5433` (test) | LISTENING (Docker) — see §8 for the post-fix re-verification |
| Redis `:6379` / `:6380` | LISTENING (Docker) — see §8 |
| Startup note | BullMQ workers logged transient `Stream isn't writeable` at boot (workers race Redis before it accepts; `enableOfflineQueue:false`). Health reports Redis up; errors stopped. Worker liveness is re-proven functionally by submit→evaluation completion in the browser journey. |
| Browser tooling | Playwright module present in root `node_modules` |
| Secrets | `backend/.env` (real SMTP/app credentials) is gitignored; only `.env.example` + `test/env/test.env` tracked. Nothing to commit. |

> Host note (09-25): the machine rebooted between the pre-implementation checkpoint and the
> re-verification pass. Docker Desktop/WSL had to be restarted; the browser journey and bulk-assign
> proof were re-run against the restarted stack (see §§6–8).

## 3. Phase 2 claims vs repository evidence (code-level, pre-runtime)

| Claim (prior reports) | Repository evidence | Code verdict |
|---|---|---|
| 5 question types | Prisma `AssessmentQuestionType`: SINGLE_CHOICE, MULTIPLE_CHOICE, SHORT_TEXT, LONG_TEXT, TRUE_FALSE (`schema.prisma:2773`) = frontend union (`assessments.api.ts:4`) = builder = take page | VERIFIED (code) |
| Recruiter builder: add/edit/delete/reorder, options, correct answers, points, rubric | `question-builder.tsx`: add (blank), edit prompt/type/options/correct/points/competency/aiEvaluated, delete, duplicate, up/down reorder (no drag), per-option points NOT editable, rubric weight/description NOT editable, no client-side validation (server `issues[]` shown in manager) | VERIFIED w/ PARTIAL UI trims (no drag, no inline validation, weight/description editors missing) |
| Publish validation guard-rails | `assessment-validation.service` + manager Validate→issues list + Publish disabled unless DRAFT | VERIFIED (code) |
| Immutable published versions | Copy-on-write claim + `updateMany DRAFT→PUBLISHED`; base e2e `edit-after-publish rejected`; closure cross-version 404 | VERIFIED (prior e2e) → re-prove in browser where practical |
| Candidate code access + short-lived token + throttles | `verify-code/start/submit` 10/min, responses 120/min, session/status 60/min (`public-assessments.controller.ts:30-71`) | VERIFIED (code) |
| Session/timer/expiry/autosave/submit-once | Session service + take page (debounce 800 ms, STALE_WRITE rebase, server resync, expiry phases) | VERIFIED (prior e2e) → re-prove in browser |
| Deterministic choice scoring authority | `assessment-scoring.service.ts:73` clamp; choice path never touches the model | VERIFIED (code) |
| AI rubric eval: provider → schema → evidence → deterministic result | Provider interface + strict schema (`overallScore`/`totalScore`/`finalScore` stripped, `output.schema.ts:49`) + evidence service + `evaluation.service.ts:197` criterion clamp `min(max(0,score), rubric.maxScore)` | VERIFIED (code) |
| Prompt-injection separation | Qwen `SYSTEM_PROMPT`: candidate = UNTRUSTED DATA, `<CANDIDATE_RESPONSE>` delimiters (`qwen-assessment.provider.ts:20-40`); mock `prompt_injection` unit test | VERIFIED architecture; live-model behavior DEFERRED (no live model; HF out of scope) |
| Evaluation retry (attempt 2, no dup rows) | Closure e2e | VERIFIED (prior e2e) |
| Bulk backend: 1,000 apps ~24 s (~42/s), unique codeHashes, 1 assignment+session/app, content-addressed re-run dedup, per-row ALREADY_ASSIGNED | Gated mass spec 2/2 (prior session) | VERIFIED — with claim discipline: assignment throughput ONLY, not AI-eval throughput |
| Idempotency P2002 convergence | `idempotency.service.ts:312` re-read branch + unit + closure 4-parallel-submit | VERIFIED — DO NOT REGRESS |
| Audit `ASSESSMENT_*` incl. REVIEWED | Enum (`schema.prisma:1733-1775`) + migration `20260922120000` applied dev+test + closure audit-trail test | VERIFIED (prior e2e) |
| Notifications + email | In-app proven (closure); email queue jobs proven (mass: 1001 jobs); SMTP delivery never proven end-to-end | PARTIAL (delivery unproven) |
| Result review UI | `assessment-result-view.tsx`: score, threshold, competency, per-question, AI criteria + evidence + VerificationBadge, meta (provider/model/prompt/schema/latency/attempt), honest pending/failed states; retry only when FAILED | VERIFIED (code) → re-prove in browser |
| Application workspace panel | `application-assessment-panel.tsx`: per-assignment name/version/status badge/score-or-status/submitted/review button; honest empty state. Note: line 65 applies `assignmentStatusLabel` to session status, but outputs coincide with `sessionStatusLabel` for all 7 session values (generic humanizer) — cosmetic non-issue, no fix. | VERIFIED (code) |
| Candidate profile assessment history | Zero matches for `assess` in profile code | NOT IMPLEMENTED → §26 decision: DEFERRED (needs batch endpoint to avoid N+1; per-row lazy fetch = 20 calls/view) |
| Analytics | Manager summary tiles (assigned/completed/avg/completion-rate); deeper fields + job/global analytics have no assessment metrics | VERIFIED scoped; deeper = DEFERRED (§27) |
| Bulk assignment UI | `bulkAssignAssessment` + `getBulkAssignJob` had ZERO UI callers; manager dialog is single-application only; applications bulk bar was screening-only | **NOT IMPLEMENTED → genuine product gap (§9). Fixed in this pass (§8).** |
| Tenant isolation / candidate isolation | Tenant guards + closure adversarial tests (401/404, leak-proof payloads) | VERIFIED (prior e2e) → spot-prove in browser |

## 4. Discrepancies / gaps driving this pass

1. **Bulk assignment UI missing (implement — DONE).** Backend bulk is proven, no recruiter UI could assign one assessment to many applications. Implemented as "Assign assessment (N)" in the applications bulk bar → job-scoped assessment picker → published-version picker (radio group) → confirm → `bulkAssignAssessment` → poll `getBulkAssignJob` → assigned/skipped/failed report. Reuses the bulk endpoint + BullMQ + auth + audit; no new endpoint, no new state system, reuses table selection; cap 500 like the backend (`@ArrayMaxSize(500)` + `BULK_TOO_LARGE`).
2. **Candidate profile assessment history (defer).** Small UI, but correct implementation needs a batch state endpoint; N+1 per-row fetching is a performance anti-pattern. Documented DEFERRED.
3. **Builder trims (no fix).** No drag reorder, no inline validation, no rubric weight/description editors. Server validation is truthful and displayed (Validate → issues). Weight defaults to 1; description unused by scoring. PARTIAL, non-blocking, documented. No change (risk/benefit).
4. **Email delivery (prove or mark blocked).** Attempt one real assignment-email observation via backend worker logs during the browser journey. Delivery success = VERIFIED; SMTP failure = BLOCKED BY ENVIRONMENT. Never claim delivery from queue rows alone. Result: **BLOCKED BY ENVIRONMENT** — SMTP on `:1025` is not provisioned on this host; queue/job creation is observable but no external mailbox on this test host can confirm delivery.

## 5. Verification plan (runtime/browser)

Playwright (chromium) against FE `:3001` + BE `:3000`, fresh `ext-*@e2e.com` company per run:
- R1 Recruiter: register → login → create job → publish → add candidate+application (UI or API-assisted setup, UI for assessment steps) → open job assessments tab → create assessment → add SINGLE_CHOICE + LONG_TEXT+rubric → save draft → reopen → validate → publish → assign (single dialog) → bulk-assign N applications (after fix) → review result.
- C1 Candidate: `/assessments/start` code entry (valid/invalid) → welcome → start → answer → autosave indicator → reload persistence → review → confirm → submit → completion.
- C2 Timer/expiry: server-authoritative resync after save (observe); forced-expiry path covered by e2e (short-duration publish where practical).
- Viewports: 1440×900 (recruiter), 1366×768 + 390×844 (candidate). Checks: overflow, clipped controls, dialogs, timer/progress.
- A11y: `axe-core` in Playwright on assessment surfaces (recruiter manager steps, candidate take page, result dialog). Automated ≠ full claim.
- Phase 1 smoke: dashboard, jobs publish, applications list, screening result presence, interviews page render, tenant 404 — via existing `product-proof.mjs` selectively or a compact script (time-boxed).
- Backend post-fix: tsc + unit suites + validation-spec additions. Frontend post-fix: tsc + vitest + build.

## 6. Bugs found & fixed during the pass

| # | Symptom (observable) | Root cause | Fix | Evidence |
|---|---|---|---|---|
| BUG-01 | Publishing an **empty draft** returned HTTP **500** | `assessment-validation.service` raised a domain error without `code`/`issues`; `GlobalExceptionFilter` turned it into a 500 | Domain 400 `ASSESSMENT_NOT_PUBLISHABLE` with structured `issues[]`; frontend `ApiErrorResponse` carries `issues[]`; manager renders the issues list | Journey `validate-empty` check (issues listed, publish blocked); unit spec extended |
| BUG-02 | Concurrent create-to-commit on one idempotency key could leave two compensation writes / mask the original error | compensation `$transaction` ran *inside* the idempotency `update` transaction and swallowed results | compensation moved **out of** the idempotency transaction; failure paths rethrow the original error | Idempotency 4-parallel-submit suite (14/14 PASS) |
| BUG-03 | `POST /api/v1/public/assessments/verify-code` returned **500** at runtime (`ASSESSMENT_ACCESS_TOKEN_SECRET is not configured`) | the JWT secret was not required by boot config, so a missing env var only surfaced as a runtime throw in `assessment-token.service` | Joi boot validation (`Joi.string().min(32).required()`), `ASSESSMENT_ACCESS_TOKEN_TTL_MINUTES` (+5..1440, default 120), `ASSESSMENT_AI_PROVIDER` (`mock\|qwen`, default mock); local `backend/.env` sets the secret; `.env.example` documents generation | `verify-code` 200 + JWT on both candidate calls; `validation.spec.ts` extended (+3 cases) |
| BUG-04 | Result dialog progress bars had no accessible names (axe `aria-progressbar-name`, serious, 2 nodes) | `Progress` rendered without `aria-label` | `aria-label` on both bars ("Overall score: X out of 100", "«competency»: X out of max") | Result-dialog axe scan `0 serious/critical` |

## 7. Verification results (09-25)

Full results and exact numbers: [`PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_REPORT.md`](./PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_REPORT.md).
- **Browser journey (post-fix build, restored runtime): all checks PASS** (EXIT 0) — register→activate→login→jobs→assessment manager→create→questions→validate→publish→validate-empty→single assign (code intercepted)→candidate desktop 1366 (invalid-code/welcome/started/autosave-choice/autosave-text/reload-persist/review/submit; no-overflow each; axe green)→assign second app→candidate mobile 390 (abbreviated; axe green)→evaluation complete (`totalScore=85.71`)→recruiter workspace panel → result dialog (axe green)→**browser-error budget PASS** (`net::ERR_ABORTED` RSC-cancel and URL-less "Failed to load resource:" filtered as benign).
- **Bulk-assign UI: browser-proven 12/12** (`verification/phase2-bulk-assign-proof.mjs`) — select 2 applications → `Assign assessment (2)` action → picker shows only the PUBLISHED version → queue → panel reports `assigned=2, skipped=0, failed=0` → DB holds exactly 2 rows (unique per application+version); **identical re-queue is content-addressed** (`deduplicated: true`, DB unchanged — acceptance-doc re-run dedup); a *different* bulk request for the same apps hits per-row `ALREADY_ASSIGNED` (`skipped=2`, DB unchanged); zero browser errors.
- **Phase 1 smoke: 13/13 PASS** (`verification/phase1-smoke.mjs`) — login-ui → dashboard → jobs (Active view shows the published job) → applications → candidates → AI Interviews (honest empty state); two fresh companies: tenant A job → 404 for tenant B token, no candidate leakage; zero browser/console/HTTP ≥500 errors.
- **Post-fix backend jest full suite: 1436/1436 PASS (84 suites)** — re-run with Postgres up; the 14 DB-backed idempotency failures from the offline-DB run are gone, `validation.spec.ts` 23/23 incl. the fixed fixture.
- Post-fix gates already run: backend `tsc --noEmit` PASS; `validation.spec.ts` 23/23 PASS; frontend `tsc --noEmit` PASS, vitest PASS (dialog tests are timeout-sensitive on this host; green with `--testTimeout=30000`), `next build` PASS.

## 8. Change policy for this pass

Only gap #1 (bulk UI) was pre-authorized. All other changes (BUG-01…BUG-04) followed: observed problem →
evidence → root cause → minimal fix → test → browser proof. No refactoring, no new deps, no new
endpoints/services, no HF work, no Phase 3.
