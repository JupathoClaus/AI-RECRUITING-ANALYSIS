# Phase 1 Remediation — Implementation Report

Statuses: `PASS` (fixed + proven), `PARTIAL` (honestly incomplete, remaining gap documented), `FAILED` (attempted but not met), `DEFERRED` (acknowledged, intentionally out of scope). Companion doc: `docs/PHASE_1_REMEDIATION_CURRENT_STATE_AUDIT.md` (pre-change evidence).

---

## 1. Applications workspace — server-side search/filter/sort/pagination

| Item | Status | Notes |
|---|---|---|
| Server-side search / sort / filters / pagination | PASS | Already `EXISTS` pre-audit (§1); unchanged. |
| List shows screening score / screening state / interview state | DEFERRED | Backend join (latestScreeningScore / interviewState) is out of Phase 1 scope; documented in audit §1. No hidden-data claim—no fabricated fields present. |

## 2. AI screener — application/job identification

| Item | Status | Notes |
|---|---|---|
| "Edit Job Requirements" uses the real job id | PASS | Bug fixed: `applicationId` was used as the job id (`src/app/ai-screener/page.tsx:198`). `ApplicationSelector` now threads the real `jobId` through `onSelect(applicationId, jobId)`; `use-ai-screening.ts` stores `ScreeningState.selectedJobId`; `handleEditRequirements()` navigates to `/jobs/{realJobId}`. Deep-link entry (`?applicationId=`) resolves the job too. |
| Deep-link entry + duplicate-interview guard | PASS | Preserved and verified end-to-end. |

## 3. Candidate profile — edit + schedule

| Item | Status | Notes |
|---|---|---|
| No inert edit / schedule affordances | PASS | Removed inert "Edit" and "Schedule Interview" dropdown rows (`src/app/candidates/page.tsx`); only working actions (View Profile, Reject→dialog, Delete→confirm) remain. |
| Read/write profile page | DEFERRED | Read-only `CandidateProfile` is intentional; edit stays out of scope (documented in audit §3). |

## 4. Candidate screening result — score display

| Item | Status | Notes |
|---|---|---|
| Score rendered accessibly, not machine noise | PASS | `screening-result-view.tsx` now renders `aria-hidden="87/100"` + `sr-only` "87 out of 100"; screen readers announce the natural phrase. See §7 for the "Why this score?" disclosure. |
| Stars only when evidence is real | PARTIAL | Evidence-verification status is now surfaced (below). Star gating on verified evidence is documented as PARTIAL: numeric score drives stars; UNVERIFIED evidence is visibly flagged rather than silently suppressing stars. |

## 5. Decision scoring — deterministic and rule-based

| Item | Status | Notes |
|---|---|---|
| Deterministic scoring / thresholds / provider-can't-game | PASS | Already `EXISTS` (§5) — unambiguous, non-fabricated, pre-existing. Unchanged; verified by the backend suite (314 ai-screening tests green). |

## 6. Interview decisions — PASS/HOLD/FAIL → 85/60/30

| Item | Status | Notes |
|---|---|---|
| No fabricated interview score / summary | PASS | Removed the fabricated "AI Summary" template and the dead Score/Breakdown cards (`src/app/interviews/page.tsx`). The Outcome section now shows only truthful data: a real PASS/HOLD/FAIL badge when one exists, otherwise "No outcome has been recorded", plus real result notes when present. |
| Outcomes never masked as numeric AI scores | PASS | Text-only, confirmed in the page source and browser proof. |

## 7. Double counting / inconsistent scoring (evidence verification surfaced)

| Item | Status | Notes |
|---|---|---|
| `verificationStatus` no longer stripped server-side | PASS | `evidence-verification.service.ts` keeps `verificationStatus` on each evidence item. |
| Typed criterion evaluations in the API | PASS | New backend `CriterionEvidenceItemDto` / `CriterionEvaluationDto`; `criterionEvaluations?: CriterionEvaluationDto[]` on the DTO (was `unknown[]`). Frontend `ai-screening.api.ts` adds matching `ScreeningEvidence.verificationStatus` and `CriterionEvaluation` + `criterionEvaluations?` types. |
| "Why this score?" disclosure | PASS | `screening-result-view.tsx` renders a per-criterion `CriterionEvaluationCard` (expand/collapse) showing Requirement / Status (VERBATIM·SUPPORTED·INFERRED·UNVERIFIED badge) / Evidence / Reasoning / Confidence. |
| Tests updated | PASS | Screening tests updated to click-expand; frontend screening suite 95/95, backend ai-screening jest 314/314. |

## 8. AI interview duration

| Item | Status | Notes |
|---|---|---|
| Single config, default 5 min | PASS | `AI_INTERVIEW_DEFAULT_DURATION_MINUTES` (default `5`) added to `validation.ts` and loaded in `ai-interview.config.ts` (`defaultDurationMinutes`). The service uses it at create-fallback and `buildConversationContext`; DTO maps it as `@ApiPropertyOptional({ default: 5 })`; `ai-interviews/page.tsx` and the send-interview modal default to 5; AI-invitation email fallback is 5 (was 30/60). |
| Tavus payload carries the duration cap | PASS | `TavusCreateConversationRequest.properties` is now the typed `TavusConversationProperties` (`tavus-client.service.ts`), so the duration contract is compile-checked. `ai-interviews.service.ts` derives `max_call_duration = min(interview.estimatedDurationMinutes * 60, tavus.maxCallDurationSeconds || 600)`: a 5-minute interview sends 300s, a 30-minute interview sends the 600s default, and a 60-minute interview is capped at the configured ceiling (`tavus.maxCallDurationSeconds`, e.g. 900). Covered by three service specs. |
| Frontend/backend spec parity | PASS | Frontend test expects `estimatedDurationMinutes: 5`; backend duration-default test expects 5; all green. |

## 9. Interview concurrency

| Item | Status | Notes |
|---|---|---|
| Config + org-scoped guard | PASS | `AI_INTERVIEW_MAX_CONCURRENT` (default `3`) in `validation.ts`; loaded as `aiInterview.maxConcurrent`. `ai-interviews.service.ts` adds `assertCompanyWithinConcurrencyLimit(tx, companyId)` — counts non-terminal interviews (excludes CANCELLED/EXPIRED/FAILED/COMPLETED) and rejects with `409 ConflictException` code `AI_INTERVIEW_CONCURRENCY_LIMIT` in `create`. |
| Race-safe under concurrent creates | PASS | `create()` now runs the dedup check, concurrency guard and create inside one `this.prisma.$transaction`, taking a per-company `pg_advisory_xact_lock(hashtext(companyId))` first (`tx.$executeRaw`). The guard therefore sees committed rows from the previous creator. Verified by a serialized "simultaneous create" spec (2 succeed / 1 rejected at cap 2, asserts the advisory-lock statement and `$transaction` are used), terminal-capacity release, per-non-terminal-status uniformity, and cross-org isolation. Real-DB e2e parallel test is DEFERRED (no test Postgres/Redis in this environment; unit proof only). |

## 10. Interview access code

| Item | Status | Notes |
|---|---|---|
| Hashing, timing-safe compare, expiry/reuse, tenant scope | PASS | Pre-existing `EXISTS` (§10); unchanged. |

## 11. Optimistic concurrency on screening/interview outcomes

| Item | Status | Notes |
|---|---|---|
| `expectedVersion` + honest conflict surfacing | PASS | Pre-existing `EXISTS` (§11); unchanged. |

## 12. Interview recording/playback integrity (read-only)

| Item | Status | Notes |
|---|---|---|
| Signed-URL read-only playback | PASS | Pre-existing `EXISTS` (§12); unchanged. |

## 13. UI identifies same interview for candidates and employees

| Item | Status | Notes |
|---|---|---|
| Truthful cross-surface identity | PASS | Pre-existing `EXISTS` (§13); unchanged. |

## 14. Bulk actions — atomic failure on partial success

| Item | Status | Notes |
|---|---|---|
| Bulk screening progress + PARTIAL result | PASS | Pre-existing `EXISTS` (§14); unchanged. |
| Destructive bulk reject confirmation | PASS | New confirmation dialog before bulk Reject (`src/app/candidates/page.tsx`); cancel/confirm with partial-failure feedback after. |
| Generic `/applications/bulk` stub | PASS | Removed the fake `@Post('bulk')` handler and `bulk-action.dto.ts` from `applications.controller.ts`; dropped the unused `applications.bulk_manage` permission from `prisma/seed.ts` and its stale `lint-baseline.json` entry; updated `backend/docs/company-candidates-applications-api.md` to point at the real `POST /ai-screenings/bulk`. Zero code references remain (grep-verified). |

## 15. Recruiter currency (Uganda — not hardcoded USD)

| Item | Status | Notes |
|---|---|---|
| No fabricated default currency | PASS | Removed every `job.salaryCurrency || "USD"` hardcode in `src/app/jobs/page.tsx` and `src/components/recruitment/job-workspace.tsx`. `formatCurrency(num, currency?)` now renders a plain grouped number (no symbol) when no currency is set; real `salaryCurrency` (e.g. UGX) is used when present. |
| Salary shown only when real | PASS | "Salary not specified" unchanged for no-salary jobs; min-only renders "From <raw amount>" with no fabricated symbol. Verified by `verification/jobs-salary-proof.mjs` (PASS, 0 browser errors) including UGX persistence, no-salary, min-only, max-only, invalid-range, negative, and non-numeric cases; a new vitest asserts no "USD" when currency is null. |

## 16. Tenancy — no cross-tenant leaks

| Item | Status | Notes |
|---|---|---|
| Reads/writes org-scoped | PASS | Pre-existing `EXISTS` (§16); unchanged. |

## 17. AI interview provider & pipeline (Tavus)

| Item | Status | Notes |
|---|---|---|
| Lifecycle through Tavus + signed callbacks | PASS | Pre-existing `EXISTS` (§17); unchanged; `max_call_duration` now wired (§8). |
| Session duration cap via Tavus | DEFERRED | Reliance on Tavus-side caps documented; not in Phase 1 scope. |

## 18. Data freshness

| Item | Status | Notes |
|---|---|---|
| Lists show server-truth after mutations | PASS | Reload-key patterns verified on interviews/candidates; dashboard aggregate corrected (§19) so headline numbers no longer derive from a page-1 slice. |
| Stale-read guard | PASS | Pre-existing `EXISTS` (§18); unchanged. |

## 19. Dashboard numbers (KNOWING refresh)

| Item | Status | Notes |
|---|---|---|
| Real total candidates (not page-capped) | PASS | Dashboard now uses `candidatesScoreSummary.totalCandidates` (server-truth) for the headline total instead of `candidates.length` (page-1 slice). |
| No dead buttons / added aria-labels | PASS | "View profile" wired to `/candidates/{id}`; inert "More options" removed; icon-only buttons labelled. |
| "Needs your attention" strip accuracy | PASS | `getScreeningScoreSummary` (`candidates.service.ts`) now returns an `attention` block with tenant-wide totals: `newApplications` (candidates whose current application is DRAFT/SUBMITTED/ON_HOLD), `awaitingScreening` (no latest COMPLETED screening) and `interviewsToday` (active scheduled interviews within the company-timezone day). The dashboard (`src/app/dashboard/page.tsx`) reads these instead of filtering the page-limited store arrays. A spec with 25 candidates (> the 20-row page size) proves the counts are tenant totals, not a page-1 slice. |

## 20. Integrity & honesty (accessibility / no fabrication)

| Item | Status | Notes |
|---|---|---|
| Screen-reader-friendly screening/pagination | PASS | "87 out of 100" sr-only pattern + "Why this score?" disclosure (see §4/§7). Axe scan 15 pages, 0 serious/critical violations. |
| No fabricated data in any recruiter surface | PASS | Interviews (§6), AI Assistant (feature guide preview with no fabricated metrics), dashboard (§19), AI interviews page (persisted tenant session, honest empty/error states) — all verified by `verification/product-proof.mjs` (zero unexpected browser/console/HTTP errors). |
| Full toolchain green after changes | PASS | `tsc --noEmit` (frontend) clean · `next build` OK · frontend vitest 363/363 (35 files) · backend jest 1363/1363 (77 suites) · `salary-proof` PASS · `phase1-ux-smoke` 16/16 · `a11y-axe-scan` 15 pages 0 serious/critical · `product-proof` all checks PASS. |

---

## Verification matrix

| Check | Command | Result |
|---|---|---|
| Frontend typecheck | `npx tsc --noEmit` | PASS |
| Frontend unit/integration | `npx vitest run` | PASS — 363/363 (35 files) |
| Backend unit/integration | `npx jest --runInBand` | PASS — 1373/1373 (77 suites) |
| Production build | `npx next build` | PASS |
| Compile + run backend from dist | `cd backend && npx tsc && node start-prod.js` | PASS — health 200 |
| Salary honesty (browser, DB, UI) | `node verification/jobs-salary-proof.mjs` | PASS — 0 browser errors |
| Phase 1 UX smoke | `node verification/phase1-ux-smoke.mjs` | PASS — 16/16 |
| Axe accessibility scan | `node verification/a11y-axe-scan.mjs` | PASS — 15 pages, 0 serious/critical |
| Product-correction proof | `node verification/product-proof.mjs` | PASS — all checks, zero unexpected errors |
| Tenant-isolation proof | `node verification/tenant-isolation-proof.mjs` | PASS — 6/6 (cross-tenant read hidden as 404) |
| Phase 1 closure browser sweep | `node verification/phase1-closure-verify.mjs` | PASS — 23/23 (13 screens, pagination, bulk, profile, responsive, console/HTTP clean) |

> Note: the real screening provider (Qwen/Ollama) is present but cannot serve inference in this environment — see the Closure Review below. Proofs that need a completing screening run were executed with the deterministic `AI_SCREENING_PROVIDER=mock`; the screening pipeline (extraction → COMPLETED result → score propagation) is otherwise identical. This is an environment condition, not a code defect.

---

# Phase 1 Closure Review

Scope: the final closure pass over the remaining production-readiness gaps (Tavus duration contract, interview concurrency, the generic bulk endpoint, dashboard attention counts, real-provider verification, secret hygiene, regression, and documentation).

- Previous commit: `ee1dc63` — `fix(phase1): complete recruiter workspace remediation`.
- Closure commit: the commit that adds this section — `fix(phase1): close remaining production readiness gaps`.

## Changes in this pass

| # | Gap | Resolution | Status |
|---|---|---|---|
| A | Tavus duration contract was untyped and could exceed the configured cap | Added the typed `TavusConversationProperties` in `tavus-client.service.ts`; `ai-interviews.service.ts` derives `max_call_duration = min(estimatedDurationMinutes * 60, tavus.maxCallDurationSeconds || 600)`. Three specs (5-min → 300, 30-min → 600 default, 60-min → capped at 900). | PASS |
| B | Concurrency guard could race under simultaneous creates | `create()` now performs the dedup check, concurrency guard and create inside one transaction guarded by `pg_advisory_xact_lock(hashtext(companyId))`; the guard reads the transaction client. Specs cover the serialized race, capacity release, status uniformity and cross-org isolation. | PASS (unit) / DEFERRED (real-DB e2e) |
| C | Fake, unused `POST /applications/bulk` endpoint | Removed the handler, DTO, unused permission, stale lint-baseline entry and API-doc row; docs now point at the real `POST /ai-screenings/bulk`. | PASS |
| D | Dashboard attention counts were a page-1 slice | `getScreeningScoreSummary` returns a tenant-wide `attention` block (`newApplications`, `awaitingScreening`, `interviewsToday`); the dashboard consumes it. A 25-candidate spec proves totals exceed the 20-row page. | PASS |
| E | Real Qwen/Ollama screening verification | Blocked by environment (see below). | BLOCKED BY ENVIRONMENT |
| F | Secret hygiene | Scanned tracked filenames, the working diff and `.env.example`. | PASS |
| G | Regression | Full frontend + backend + browser suites re-run green. | PASS |
| H | Documentation | This section + `docs/PHASE_1_FINAL_ACCEPTANCE.md`. | PASS |

## Real Qwen verification (BLOCKED BY ENVIRONMENT)

- Ollama is reachable: `GET http://localhost:11434/api/tags` → `200`, and the configured model `qwen3.5:9b` (9.7B, Q4_K_M, 6.6 GB) is present.
- A real inference request to the OpenAI-compatible endpoint (`POST /v1/chat/completions`, `response_format: json_object`) returned **HTTP 500** after ~17.9 s: `llama-server startup failed after projector CPU offload retry: … failed to allocate buffer of size 3419799552 … unable to allocate CPU_REPACK buffer`.
- Host memory: 7.9 GB total, ~1.6 GB free — insufficient to load the model.
- Conclusion: connectivity is proven, **inference is not**. No real-provider screening result was produced, so `REAL_QWEN_VERIFICATION = BLOCKED BY ENVIRONMENT`. The deterministic `AI_SCREENING_PROVIDER=mock` remains the verification provider for screening-flow proofs. No API key is required for the Ollama path.

## Secret hygiene (PASS)

- Tracked filenames: no `.env`, `.pem`, `.key`, `id_rsa`, `credentials.json`, `.p12`, `.pfx` or `.log` files (only `backend/.env.example`, whose secret values are placeholders such as `replace-with-strong-random-secret`).
- Working diff scan for `sk-…`, `AIza…`, `AKIA…`, `-----BEGIN`, `Bearer …`, `password/secret/token=` patterns: no matches.
- `.gitignore` covers `.env*`, `*.pem`, and all runtime/verification logs; `.env`, `.env.local`, `backend/.env*` are ignored in the working tree.

## Regression results (this pass)

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
| Changed-file lint | `cd backend && node ./scripts/lint-changed.js --base HEAD` | PASS — every changed/added file clean (deleted targets skipped) |
| Whole-repo lint baseline | `cd backend && npm run lint:baseline` | PRE-EXISTING FAILURE — fails identically on a clean `ee1dc63` checkout (mixed CRLF/LF endings in this Windows worktree make `prettier/prettier` flag untouched files); not a regression of this pass |

> The frontend suite showed one load-induced 5 s timeout in `ai-interview-detail-dialog.test.tsx` on an early run; it passes 7/7 in isolation and the full suite passed 363/363 on re-run. The failure moved between runs and did not touch any changed file.

## Remaining non-PASS items

| Item | Status | Reason | Component | Blocks production? | Planned |
|---|---|---|---|---|---|
| Real Qwen verification | BLOCKED BY ENVIRONMENT | Host cannot load `qwen3.5:9b` (7.9 GB RAM; 500, CPU_REPACK buffer allocation failure) | `qwen-screening.provider.ts` / Ollama host | No (mock provider + full pipeline proofs) | Re-run on a host with ≥16 GB RAM or a remote Qwen/vLLM endpoint |
| Interview concurrency real-DB e2e | DEFERRED | No test Postgres (5433) / Redis (6380) in this environment; unit proof + advisory-lock SQL only | `ai-interviews.service.ts` | No | Run `npm run test:infra:up` + `npx jest --config test/jest-e2e.json` on CI |
| Read/write candidate profile | DEFERRED | Read-only profile is intentional Phase 1 scope | `candidate-profile` | No | Phase 2 candidate editing |
| Applications list screening/interview columns | DEFERRED | Backend join out of Phase 1 scope | `applications` list | No | Phase 2 |

## Final acceptance status

See `docs/PHASE_1_FINAL_ACCEPTANCE.md`. Phase 1 is **not declared complete**: the real-provider verification remains BLOCKED and two items remain DEFERRED by design.