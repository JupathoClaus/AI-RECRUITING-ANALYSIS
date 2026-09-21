# Phase 1 Remediation — Current State Audit

Audit of the **actual repository** (`D:\AI interviewer\AI-Recruiter-Agent`, branch `main`, commit `c854fae`), not the prior Phase 1 report. Every finding below is backed by file/line evidence gathered against the real source. Statuses: `EXISTS` / `PARTIAL` / `MISSING` / `BUG` / `UX ISSUE` / `PERFORMANCE ISSUE` / `SECURITY ISSUE` / `TEST GAP`. `COMPLETE` is only ever assigned in the final verification report after fixes are proven.

---

## 1. Applications workspace — server-side search/filter/sort/pagination

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Server-side search | EXISTS | `src/lib/api/applications.api.ts` `fetchApplications` params: `search`, `jobId`, `status`, `source`, `stageId`, `submittedFrom`, `submittedTo`, `hasActiveFlags`, `archived`, `sortBy`, `sortOrder`, `page`, `limit`; consumed server-side by `applications.service.findAll`. List layout `src/components/recruitment/application-list-view.tsx` (`PAGE_SIZE=20`, 250 ms debounced search, stale-request abort). | None |
| Server-side sort | EXISTS | `sort_by`/`sort_order` accepted at `applications.service.countAndSelect`; `application-list-view.tsx` sort dropdown. | None |
| Server-side filters | EXISTS | Status/source/stage/job/date filters wired in `application-list-view.tsx`. | None |
| Server-side pagination | EXISTS | `PAGE_SIZE=20`, `meta.total/totalPages` from `countAndSelect`. | None |
| List shows screening score / screening state / interview state / updated | PARTIAL | `application-list-view.tsx` renders avatar, name, job title, status badge, source, stage, submitted, current flags. `ApplicationListItem` DTO carries `currentStage`, `status`, `screeningAnswerCount`, `hasActiveFlags`, `updatedAt` — but no `latestScreeningScore`, `latestScreeningState`, or `latestInterviewState`. | Out of remediation scope (no backend join yet) — add honest `updatedAt` display to reduce hidden data; document as PARTIAL with DEFERRED column work. |
| URL/query-param state sync | MISSING | `application-list-view.tsx` has no `useSearchParams` read/write; filters are component-local. | Low value; defer. |
| Row actions advance to correct application | EXISTS | Row actions call bulk/advance endpoints scoped by applicationId. | None |
| AI-screener navigation from job workspace carries real application | EXISTS | Job workspace "AI Screener" passes `applicationId`. | None — but see §2 BUG |

## 2. AI screener — application/job identification

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Screening request uses correct application | EXISTS | `src/hooks/use-ai-screening.ts` keys workflow on `selectedApplicationId`; API uses `POST /ai-screenings/{applicationId}/run`. | None |
| Job identification is correct | **BUG** | `src/app/ai-screener/page.tsx:198` "Edit Job Requirements" renders `href={`/jobs/${applicationId}`}` — an **application id is used as the job id**. Also the page's state carries no `jobId`. | Fix to use real `jobId` (thread jobId through `ApplicationSelector`/`ScreeningState`); show requirement chip with matching job. |
| Deep-link entry (`?applicationId=`) | EXISTS | `src/app/ai-screener/page.tsx:33-38` reads query param and calls `selectApplication`. | Keep; ensure jobId resolved too. |
| Duplicate-interview guard | EXISTS | Application must be `SCREENING` stage; existing non-terminal AI interview reused (see §13). | None |

## 3. Candidate profile — edit + schedule

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Candidate detail page is read/write capable | PARTIAL | `src/app/candidates/[candidateId]/page.tsx` renders read-only `CandidateProfile`; no edit controls. | Remove/honestly disable inert affordances on the list (see below); edit stays out of scope. |
| List has working View/Reject/Delete | EXISTS | `src/app/candidates/page.tsx` dropdown: View Profile (link), Reject (opens dialog), Delete (confirm dialog). | None |
| No inert edit/schedule affordances | **UX ISSUE** | `src/app/candidates/page.tsx` dropdown rows ~931-938: "Edit" and "Schedule Interview" are inert (`onClick` only calls `e.stopPropagation()`, no navigation/action). | Remove both inert items (no edit/schedule flow exists). |

## 4. Candidate screening result — score display

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Score shown consistently | PARTIAL | `src/components/ai-screening/screening-result-view.tsx:38` renders `{result.overallScore}/100` (machine noise). | Render accessible "87 out of 100" (sr-only "out of") so it reads naturally; keep numeric aria-label. |
| "Why this score?" progressive disclosure | MISSING | Frontend DTO `AiScreeningResultDto` (`src/lib/api/ai-screening.api.ts`) has no criterion evaluation detail; evidence has no verification status. | Add typed `criterionEvaluations` + expose evidence verification status; render collapsible per-criterion reasoning (Requirement / Status / Evidence / Reasoning / Confidence). Backend must stop stripping verificationStatus (§7). |
| Screening score authoritative, not fabricated | EXISTS | Backend computes deterministic score; providers only evaluate criteria (see §7). None fabricated. | — |
| Stars only when real | PARTIAL | `screening-result-view.tsx` shows stars from numeric score; acceptable, but there is no single-star path for `HUMAN_REVIEW` uncertainty/unverified evidence. | Gate stars on evidence being verified; show "Needs your review" for UNVERIFIED (ties into §7). |

## 5. Decision scoring — deterministic and rule-based

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Deterministic score | EXISTS | `backend/src/modules/ai-screening/services/backend-scoring.service.ts`: FULLY_MET 1.0 / PARTIALLY_MET 0.5 / NOT_MET 0.0 / UNCERTAIN 0.0; clamp 0-100. | None |
| Shortlist / reject thresholds | EXISTS | SHORTLIST ≥72, NOT_SHORTLIST <38; hard-requirement unmet forces NOT_SHORTLIST; uncertainty/unverified forces HUMAN_REVIEW. | None |
| Provider cannot game score | EXISTS | qwen: model evaluates criteria only, score computed server-side (`qwen-screening.provider.ts`). OpenAI/DeepSeek: `overallScore` validated 0-100 via `validateScreeningOutput`. | None |

## 6. Interview decisions — PASS/HOLD/FAIL → 85/60/30

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Interview outcome is never masked as a numeric AI score | PASS | Backend resolves PASS/HOLD/FAIL (`interviews` domain); no conversion to 85/60/30 numeric scoring exists. Frontend renders as text badges (`src/app/interviews/page.tsx` outcome column). | None — keep text-only outcomes. |
| No fabricated interview score/summary | **UX ISSUE / BUG** | `src/app/interviews/page.tsx` "AI Summary" section (~700-723) fabricates a fixed template summary ("Overall, the candidate demonstrated...") and the Score + Breakdown cards (~604-698) render dead/hardcoded progress for every completed interview even when no scoring data exists. `getScoreValue` etc. default invented numbers. | Remove the fabricated AI Summary + dead Score/Breakdown render path; show an honest "Result notes" line sourced from real `resultNotes` when present. |
| Interview outcome accuracy | EXISTS | Outcome is stored from the interview provider/worker, not derived from fabricated prompts. | None |

## 7. Double counting / inconsistent scoring

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Tied to correct application and job | EXISTS | All screening reads scoped by applicationId; backend filters by `companyId` + `applicationId`. | None |
| Evidence verification categories | PARTIAL | Backend computes verification categories (VERBATIM / SUPPORTED / INFERRED / UNVERIFIED) in `backend/src/modules/ai-screening/services/evidence-verification.service.ts`, but at line ~67 the `verificationStatus` is **stripped** from the outbound evidence, and `ScreeningEvidenceDto` (`backend/src/modules/ai-screening/dto/ai-screening-response.dto.ts`) does not carry `verificationStatus`; `criterionEvaluations` is typed `unknown[]`. | Stop stripping; expose typed criterion evaluations + verification status; surface in UI (§4). Update affected specs (`evidence-verification.service.spec.ts`, `screening-output.schema.spec.ts`). |
| No fabricated numbers in UI | EXISTS | No `Math.random`, lorem text, or hardcoded timestamps in `src`. | None |

## 8. AI interview duration

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Duration is ~5 min intended, configurable, single source | PARTIAL | `src/app/ai-interviews/page.tsx:53` default `useState("30")`; `src/components/ai-interview/send-ai-interview-modal.tsx` default 30; backend `ai-interviews.service.ts` create uses `dto.estimatedDurationMinutes || 30` (~114); `email-notification.provider.ts` default 60 for human-interview emails; Prisma schema default 30. `TAVUS_MAX_CALL_DURATION_SECONDS` exists (`backend/src/config/validation.ts:100`, default 600) but is **never sent** to the Tavus conversation payload (`tavus-client.service.ts` `TavusCreateConversationRequest` only carries participant timeouts). | Single config `AI_INTERVIEW_DEFAULT_DURATION_MINUTES` default 5 used by: create-dto default, service fallback, create form default, invitation modal default, welcome/access copy; and wire `maxCallDurationSeconds` into the Tavus payload (or document provider-level cap). Update affected spec assertions (`ai-interviews.service.spec.ts`, `ai-interviews-page.test.tsx`, `email-notification.provider`). |

## 9. Interview concurrency

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| `MAX_CONCURRENT_INTERVIEWS` config + enforcement | MISSING | No `MAX_CONCURRENT_INTERVIEWS` in `backend/src/config/validation.ts`; no cap anywhere in `backend/src/modules/ai-interviews`. `interview-conflict.service` assumes capacity 1 and notes P1. | Add config + a provider-capacity guard on interview create/start (reject 409 when company already at cap on active non-terminal AI interviews). Add spec. |

## 10. Interview access code

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Code hashing + timing-safe compare | EXISTS | `ai-interview-code.service.ts` / `ai-interview-token.service.ts` hash codes and verify with timing-safe comparison; expiry + reuse prevention + tenant scoping. | None |
| Access workflow | EXISTS | Welcome → access-code page → session (code verified server-side) → completion; token carries company + interview ids. | None |

## 11. Optimistic concurrency on screening/interview outcomes

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| `expectedVersion` supported | EXISTS | Application/Screening/Interview writes use `expectedVersion`; stale writes rejected with `APPLICATION_STALE_VERSION` / equivalent conflict errors (`ApplicationWorkflowService`, `AiScreeningService`). | None |
| Conflict surfaced honestly | EXISTS | Backend throws `409 Conflict`; UI shows "reload / retry" guidance via `getErrorMessage`. | None |

## 12. Interview recording/playback integrity read-only

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Recordings read-only | EXISTS | `recording-playback.service.ts` streams signed URLs only; no storage writes from playback surface. `tavus-artifact-sync.service.ts` syncs artifacts. | None |

## 13. UI identifies same interview for both candidates and employees

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| One interview, two truthful names | EXISTS | All tables render the same `candidate.name` (from `InterviewWithJob`), never guessing role-based labels. AI interview created once against an application; same row is shown in candidates + interviews workspaces. | None |

## 14. Bulk actions — atomic failure on partial success

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Bulk run AI screening (progress + PARTIAL result) | EXISTS | `bulk-screening.service.ts` processes per-application, collects successes/failures, returns `BulkScreeningResult` with `completed/failed/errors`; UI (`src/components/ai-screening/bulk-screening-dialog.tsx`) shows per-item progress. | None |
| Bulk advance/reject on applications | EXISTS | `application-list-view.tsx` bulk toolbar advances/rejects; partial-failure feedback present. | None |
| Generic `/applications/bulk` | PARTIAL | `applications.controller` `bulk()` (~524-540) returns `success: true` stub satisfied even when no handler matched. | Not exercised by UI; leave, document as PARTIAL. |
| Destructive bulk confirm | **UX ISSUE/SAFETY** | `src/app/candidates/page.tsx` bulk toolbar: "Reject" runs immediately with **no confirmation** (partial-failure counts shown after). | Add confirmation dialog before destructive bulk reject (and on bulk delete if re-added). |

## 15. Recruiter currency (Uganda — not hardcoded USD)

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| No fabricated default currency | **UX ISSUE** | `src/lib/utils.ts`/`jobs-view.ts` and `src/app/jobs/page.tsx:629-631` pass `job.salaryCurrency || "USD"`; `src/components/recruitment/job-workspace.tsx:90` also defaults to `"USD"`. Org can configure currency (`settings.ts` currency selector exists) but job surfaces default to USD. | Render salary honestly: use job `salaryCurrency` when set; otherwise show amounts with no fabricated symbol (and company default only when explicitly configured). Career/marketing pages already show raw amounts when no currency. |
| Salary shown only when real | PARTIAL | `jobs/page.tsx:633` shows "Salary not specified" when both null; but when only min present, "From X" uses the USD fallback. | Same fix as above. |

## 16. Tenancy — no cross-tenant leaks

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| All writes scoped by organizationId | EXISTS | Global guards + `organizationId` on every create/update path; applications scoped `companyId` = `organizationId`. | None |
| Reads scoped | EXISTS | `findFirst({ where: { id, ... , companyId/organizationId }})` pattern; no unscoped `findById` found in screened services. | None |

## 17. AI interview provider & pipeline (Tavus)

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Interview lifecycle through Tavus | EXISTS | `AiInterviewsService.startInterview` creates Tavus conversation with persona/replica ids; callback URL signed with secret; worker syncs artifacts. | None |
| Appearance latency handled / session resilient | PARTIAL | `/interview/session` has no explicit server-side duration cap or auto-end; relies on Tavus. Out of scope — documented. | Note in report only. |

## 18. Data freshness

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Lists show server-truth after mutations | PARTIAL | Reload flags exist (e.g. `reloadKey`) on interviews/candidates after create/update; dashboard `candidates` capped at page 1 (see §19). | Extend dashboard aggregate fix (§19). |
| Stale-read guard | EXISTS | Server returns fresh records post-write within mutated flows; optimistic version guards reads/writes. | None |

## 19. Dashboard numbers (KNOWING refresh)

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Total candidates is real, not page-capped | **PERFORMANCE/ACCURACY** | `src/app/dashboard/page.tsx:207` `totalCandidates = candidates.length` while `useStore` only loads page 1 (`fetchCandidates({limit:20})` in `src/store/useStore.ts:174-186`). `fetchCandidatesScoreSummary()` (`src/lib/api/candidates.api.ts:174-186`) already returns truthful `totalCandidates` server-side. | Use `candidatesScoreSummary.totalCandidates` for the headline total. |
| "Needs your attention" strip is accurate | PARTIAL | Attention counts (`newApplications`, `awaitingScreening`, `interviewsToday`) are derived from the page-limited candidate/application arrays — undercounts beyond page 1. | If an accurate server count is unavailable, label counts honestly ("sampled from recent N") or fetch server totals. |
| No dead buttons on dashboard | **UX ISSUE** | `src/app/dashboard/page.tsx` Top Candidates rows ~899-914: "View profile" (Eye) and "More options" (More) have **no onClick**. Icon-only buttons lack aria-labels. | Wire "View profile" to `/candidates/{id}`; remove "More options" or route it to the candidate detail; add `aria-label` to icon-only buttons. |

## 20. Integrity & honesty (accessibility / no fabrication)

| Requirement | Status | Evidence | Required change |
|---|---|---|---|
| Screen reader friendly screening/pagination UI | PARTIAL | Progress: `aria`-labelled; pagination has `label`/`aria-label`; but screening result "87/100" and score stars are not announced well (see §4). | Fix per §4. |
| No fabricated interview features in marketing/career pages | EXISTS | Careers/hiring pages show real job data only; no invented stats. | None |
| `next build` / lint clean after remediation | TEST GAP | Baseline: `tsc --noEmit` clean, `vitest` 360/360, backend `jest --runInBand` clean, `next build` OK, `a11y-axe-scan` 15 pages 0 serious/critical, `phase1-ux-smoke` 16/16 live against running servers. | Re-run all after changes; verify target UX routes with axe + smoke tests. |

---

## Summary of required changes (priority order)

1. `src/app/ai-screener/page.tsx:198` — use real job id for "Edit Job Requirements" (§2).
2. `src/app/interviews/page.tsx` ~604-723 — remove fabricated "AI Summary" + dead Score/Breakdown; honest result-notes line (§6).
3. `src/app/candidates/page.tsx` ~931-938 — remove inert "Edit"/"Schedule Interview" (§3).
4. `src/app/dashboard/page.tsx` — real total via `candidatesScoreSummary.totalCandidates`; wire/remove dead Top-Candidates buttons; aria-labels (§19).
5. `src/app/candidates/page.tsx` — confirmation before destructive bulk Reject (§14).
6. Backend + `screening-result-view.tsx` — stop stripping `verificationStatus`; typed `criterionEvaluations`; accessible "87 out of 100"; "Why this score?" disclosure; stars gated on verified evidence (§4/§7).
7. AI interview duration — `AI_INTERVIEW_DEFAULT_DURATION_MINUTES` (5), single source front + back, wire Tavus max call duration or document cap (§8).
8. `MAX_CONCURRENT_INTERVIEWS` config + start/create guard + spec (§9).
9. Salary rendering — no `|| "USD"` fabrication; use real `salaryCurrency` / company default (§15).
10. Tests updated for all of the above; full suite green; browser + axe + smoke verification.
</content>