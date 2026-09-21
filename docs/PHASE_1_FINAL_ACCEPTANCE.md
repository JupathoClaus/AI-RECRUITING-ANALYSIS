# Phase 1 — Final Acceptance

This is the final acceptance matrix for the Phase 1 closure pass. Statuses are limited to **PASS**, **PARTIAL**, **FAILED**, **DEFERRED** and **BLOCKED** (no "complete" language). Every non-PASS item states the exact reason, the exact component, whether it blocks production, and the planned workstream.

- Previous commit: `ee1dc63` — `fix(phase1): complete recruiter workspace remediation`.
- Closure commit: the commit that adds this file — `fix(phase1): close remaining production readiness gaps`.
- Environment: frontend `next dev` on `:3001`, backend `start-prod.js` on `:3000`, Postgres/Redis via Docker. Screening proofs run with `AI_SCREENING_PROVIDER=mock` (see item 21).

## Acceptance matrix

| # | Area | Status | Evidence / Notes |
|---|---|---|---|
| 1 | Navigation | PASS | Sidebar grouping (Hiring/Interviews/Reports), active-state, collapse/expand and notification drawer verified by `verification/phase1-ux-smoke.mjs` (16/16) and the 13-screen sweep in `verification/phase1-closure-verify.mjs`. |
| 2 | Job workspace | PASS | Job lifecycle (create → publish → close → history → reopen) verified by `verification/product-proof.mjs`; workspace overview/analytics axe-clean; salary fields by `verification/jobs-salary-proof.mjs`. |
| 3 | Applications | PASS | Applications list renders and the application workspace shows the real screening score (`verification/product-proof.mjs` §2c, §4a/§4b); renders in the closure sweep. |
| 4 | Candidates | PASS | Real AI score in the list (`verification/product-proof.mjs` §2b); server pagination, bulk bar and profile navigation verified by `verification/phase1-closure-verify.mjs`. |
| 5 | AI screening | PASS | End-to-end extraction → screening → COMPLETED score propagation with the deterministic mock provider (`verification/product-proof.mjs` §2a: real score 25, NOT_SHORTLIST). Real-provider path is item 21. |
| 6 | Evidence | PASS | Evidence quotes are cross-checked against resume text and `verificationStatus` is surfaced (`backend/src/modules/ai-screening/services/evidence-verification.service.ts`; 15 tests in `evidence-verification.service.spec.ts`); criterion evaluations exposed via `CriterionEvaluationDto`. |
| 7 | Score display | PASS | Real score rendered in list, workspace and dashboard (`verification/product-proof.mjs` §2b/§2c/§3); accessible "N out of 100" pattern in `screening-result-view.tsx`. |
| 8 | Bulk actions | PASS | Fake `POST /applications/bulk` removed (handler, DTO, permission, lint-baseline, docs). Real bulk via `POST /ai-screenings/bulk`; truthful partial-failure feedback (`verification/product-proof.mjs` §4a/§4b); bulk bar actions in the closure sweep. |
| 9 | Interviews | PASS | Interviews page renders and axe-clean; scheduling slot-conflict validation covered by the interview service specs and `verification/phase1-closure-verify.mjs`. |
| 10 | AI interviews | PASS | Persisted tenant session reload (`verification/product-proof.mjs` §6a); page axe-clean in the closure sweep. |
| 11 | Interview security | PASS | Meeting tokens stripped from responses and signed access tokens issued for valid codes (`backend/src/modules/ai-interviews/tests/ai-interviews.service.spec.ts`); callback route is secret-scoped. HTTP security matrix e2e is DEFERRED with the test infra (see item 13 note). |
| 12 | Interview duration | PASS | Typed Tavus properties and `max_call_duration = min(estimatedDurationMinutes * 60, tavus.maxCallDurationSeconds || 600)` in `backend/src/modules/ai-interviews/services/ai-interviews.service.ts`; three specs (5→300, 30→600, 60→capped 900). |
| 13 | Interview concurrency | PASS | Org-scoped guard + `pg_advisory_xact_lock(hashtext(companyId))` inside a transaction in `ai-interviews.service.ts`; serialized-race, capacity-release, status-uniformity and cross-org specs green. Real-DB parallel e2e is DEFERRED (see below). |
| 14 | Dashboard | PASS | Headline totals and the "Needs your attention" strip now come from the tenant-wide `attention` block returned by `getScreeningScoreSummary` (`backend/src/modules/candidates/candidates.service.ts`), consumed in `src/app/dashboard/page.tsx`; 25-candidate spec proves totals are not a page-1 slice. |
| 15 | Currency | PASS | No hardcoded USD; real currency (e.g. UGX) or a plain amount is shown (`verification/jobs-salary-proof.mjs` — UGX persistence, no-salary, min-only, max-only, invalid/negative/non-numeric). |
| 16 | Tenant isolation | PASS | Cross-tenant read returns 404 with data hidden (`verification/tenant-isolation-proof.mjs`, 6/6); candidate/score queries are company-scoped. |
| 17 | Accessibility | PASS | `verification/a11y-axe-scan.mjs` — 15 pages, 0 serious/critical violations; screen-reader score pattern and labelled icon buttons. |
| 18 | Responsive behavior | PASS | No horizontal overflow at 390×844 on `/dashboard`, `/candidates`, `/jobs` (`verification/phase1-closure-verify.mjs`); responsive tables and mobile navigation. |
| 19 | Performance | PARTIAL | Bounded responses (score-summary), server pagination and deferred analytics are verified, but there is no automated performance budget (Lighthouse/web-vitals) or latency benchmark. |
| 20 | Testing | PASS | Frontend `tsc` clean + vitest 363/363 (35 files) + `next build` OK; backend `tsc` clean + jest 1373/1373 (77 suites); all browser proofs green (see Regression below). |
| 21 | Real Qwen verification | BLOCKED | BLOCKED BY ENVIRONMENT — Ollama is reachable and `qwen3.5:9b` is present, but inference returns HTTP 500 (`failed to allocate CPU_REPACK buffer of size 3419799552`) because the host has 7.9 GB RAM / ~1.6 GB free. No real-provider screening result was produced. |
| 22 | Secret hygiene | PASS | No tracked secrets: no `.env`/`.pem`/`.key`/credentials/`.log` files; diff scan for key/token patterns clean; `.env.example` contains placeholders only; `.gitignore` covers env and runtime logs. |

## Non-PASS detail

| Item | Status | Reason | Exact component | Blocks production? | Planned workstream |
|---|---|---|---|---|---|
| 19 Performance | PARTIAL | No automated performance budget or latency benchmark exists; only architectural bounds are verified. | Dashboard/store candidate + interview loading (`src/app/dashboard/page.tsx`, `src/store/useStore.ts`); backend aggregate `candidates.service.ts` | No | Phase 2 — add a Lighthouse/web-vitals budget and an API latency smoke check |
| 21 Real Qwen verification | BLOCKED | Host cannot load `qwen3.5:9b`; inference fails with a CPU_REPACK buffer allocation error (7.9 GB RAM). | `backend/src/modules/ai-screening/providers/qwen-screening.provider.ts`; Ollama host | No — deterministic mock provider proves the pipeline; the provider code is unchanged | Re-run on a host with ≥16 GB RAM or a remote Qwen/vLLM endpoint |
| 13 (sub-check) Interview concurrency real-DB e2e | DEFERRED | Test Postgres (5433) and Redis (6380) are not running in this environment; the guard is proven by serialized unit specs plus the advisory-lock statement. | `backend/src/modules/ai-interviews/services/ai-interviews.service.ts`; `backend/test/jest-e2e.json` | No | CI: `npm run test:infra:up` + migrations + `npx jest --config test/jest-e2e.json` |
| 3 (sub-check) Applications list screening/interview columns | DEFERRED | Backend join for latest screening score / interview state is out of Phase 1 scope. | `src/app/applications/page.tsx` | No | Phase 2 applications workspace |
| 4 (sub-check) Read/write candidate profile | DEFERRED | Read-only candidate profile is intentional Phase 1 scope. | `src/app/candidates/[candidateId]` | No | Phase 2 candidate editing |

## Regression (this pass)

| Check | Command | Result |
|---|---|---|
| Frontend typecheck | `npx tsc --noEmit` | PASS |
| Frontend unit/integration | `npx vitest run` | PASS — 363/363 (35 files) |
| Backend typecheck | `cd backend && npx tsc --noEmit` | PASS |
| Backend unit/integration | `cd backend && npx jest --runInBand` | PASS — 1373/1373 (77 suites) |
| Production build | `npx next build` | PASS |
| Salary honesty | `node verification/jobs-salary-proof.mjs` | PASS |
| Phase 1 UX smoke | `node verification/phase1-ux-smoke.mjs` | PASS — 16/16 |
| Axe accessibility scan | `node verification/a11y-axe-scan.mjs` | PASS — 15 pages, 0 serious/critical |
| Product-correction proof | `node verification/product-proof.mjs` | PASS |
| Tenant isolation | `node verification/tenant-isolation-proof.mjs` | PASS — 6/6 |
| Closure browser sweep | `node verification/phase1-closure-verify.mjs` | PASS — 23/23 |
| Changed-file lint | `cd backend && node ./scripts/lint-changed.js --base HEAD` | PASS — all changed files clean (deleted targets skipped) |
| Whole-repo lint baseline | `cd backend && npm run lint:baseline` | PRE-EXISTING FAILURE — fails identically on a clean `ee1dc63` checkout. This Windows worktree has mixed CRLF/LF endings, so `prettier/prettier` flags lone-LF lines in files this pass never touched (`interviews.service.ts`, `ai-interviews.controller.ts`, `interview-query.dto.ts`, …). Not a regression of this pass; `lint:changed` is the gate that applies here. |

The frontend suite had one load-induced 5 s timeout in `ai-interview-detail-dialog.test.tsx` during an early run; it passes 7/7 in isolation and the full suite passed 363/363 on re-run (unchanged from the pre-existing flake noted in the previous phase).

## Verdict

Phase 1 is **not declared complete**. All functional areas pass, but real-provider verification is **BLOCKED BY ENVIRONMENT** and two scope items plus one real-DB e2e are **DEFERRED**. The single **PARTIAL** (performance budget) is non-blocking.
