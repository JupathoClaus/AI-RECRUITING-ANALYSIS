# Phase 3 — Implementation Report (AI Interview Intelligence & Structured Post-Interview Evaluation)

> Closed on 2026-09-29 against `analysis/main`. Pre-implementation baseline: `docs/PHASE_3_CURRENT_STATE_AUDIT.md` (HEAD `4ad4251858d189aa9ae26b6b84966e95604296b4`).
> Product repo: `AI-Recruiter-Agent/` (Next.js FE root + `backend/` NestJS).

## 1. What was built

### 1.1 Data model (`backend/prisma/schema.prisma` + migration `20260928000000_phase3_ai_interview_evaluation`)

- `AiInterviewEvaluation` — one row per interview; `status NOT_REQUESTED | PENDING | RUNNING | COMPLETED | FAILED`; attempt history is immutable (`@unique [aiInterviewId, attempt]` per row via `AiInterviewEvaluationAttempt?` no — attempts live on the same table, one row per attempt keyed by `attempt`), provider/model/promptVersion/schemaVersion/latencyMs/responseId/inputFingerprint/failureCode/failureMessageSafe, `totalScore/maximumScore/recommendation/confidence`, `recruiterDecision`, `decidedByMembershipId`, `decidedAt`, `decisionNote`. Delete cascades from `AiInterview`.
- `AiInterviewCompetencyEvaluation` — `competency`, `status MET | PARTIALLY_MET | NOT_MET | UNCERTAIN`, `score/maxScore/confidence/rationale`, ordered; cascade `AiInterviewEvaluation`.
- `AiInterviewEvidence` — evidence `quote`, `verification VERBATIM | SUPPORTED | INFERRED | UNVERIFIED`, `sourceSegmentIndex/sourceSeconds`; many-to-one competency; cascade.
- `AiInterviewTranscript` + `AiInterviewTranscriptSegment` — normalized transcript (speaker role, typed segment, start/end seconds, hidden SYSTEM flag); unique per interview; cascade delete.
- `NotificationType.AI_INTERVIEW_EVALUATED` added; `ApplicationAuditEventType.AI_INTERVIEW_EVALUATED` / `AI_INTERVIEW_REVIEWED` added.

### 1.2 Evaluation pipeline (`backend/src/modules/ai-interviews/`)

- `evaluation/ai-interview-ai-provider.{interface,token}` — `InterviewEvaluationProvider` DI-token pattern mirroring Phase 2 assessments; factory picks mock/qwen; selected provider logged at module init.
- `evaluation/ai-interview-evaluation-output.schema.ts` — strict boundary validation: unknown keys rejected, string/count caps, summary/strengths/gaps/uncertainties required; model-supplied overall scores dropped at the boundary.
- `evaluation/mock-ai-interview-evaluation.provider.ts` — deterministic default provider (`providerName='mock'`), scenario matrix (default/strong/weak/empty/provider-failure/malformed/fabricated-evidence).
- `evaluation/qwen-ai-interview-evaluation.provider.ts` — OpenAI-compatible real provider (env `AI_INTERVIEW_EVALUATION_PROVIDER=qwen`, `QWEN_BASE_URL/API_KEY/MODEL`); HARD RULES prompt: untrusted candidate transcript, exact-quote-only evidence, NEVER emit an overall score; char-bounded build with `promptVersion`.
- `evaluation/ai-interview-transcript.service.ts` — normalizes raw provider JSON turns into typed segments, hides SYSTEM turns, aggregates candidate response text from non-hidden USER segments, upserts rows.
- `evaluation/ai-interview-evidence.service.ts` — quote→transcript verification semantics (`VERBATIM | SUPPORTED | INFERRED | UNVERIFIED`), `verifyAll`, `hasFabricatedEvidence`.
- `evaluation/ai-interview-scoring.service.ts` — **deterministic backend scoring authority**: weighted competency % rounds to 2dp (0–100), fallback competency model, PASS ≥ 70 / FAIL ≤ 40 / HOLD in-between. The model never supplies a score or a recommendation.
- `evaluation/ai-interview-evaluation.service.ts` — enqueue with deterministic `jobId` (dedup), atomic PENDING→RUNNING claim (`updateMany`), input fingerprint, provider call, evidence verification, fabricated/public-gate failure checks → terminal FAIL with `failureCode` while preserving prior deterministic result, finalize with audit + notification, `retry()` preserving attempt history (`MAX_ATTEMPTS` guard).
- `evaluation/queue/ai-interview-evaluation.{processor,constants}` — BullMQ queue `ai-interview-evaluation`; processor with concurrency config, non-retryable provider error → terminal FAIL, retries exhausted → deterministic-only fallback.
- Auto-trigger: when an interview reaches `COMPLETED` and transcript is `READY` (webhook / artifact-sync / mock-complete paths), an evaluation is queued automatically. Trigger is safe/idempotent.
- Recruiter API: `POST /ai-interviews/:id/request-evaluation` (or equivalent gated request), `GET /ai-interviews/:id/evaluation`, `POST /ai-interviews/:id/re-evaluate`, `POST /ai-interviews/:id/decision` (recruiter PASS/HOLD/FAIL + note, audited) — all behind `JwtAuthGuard + PermissionsGuard` + membership scoping.
- Config: `config/loaders/ai-interview-evaluation.config.ts` + Joi validation (`provider`, `timeoutMs`, `promptVersion`, `schemaVersion`, `workerConcurrency`).

### 1.3 Recruiter report UI (FE)

- `src/components/ai-interview/ai-interview-detail-dialog.tsx` — new "AI Evaluation" section: status-driven states (NOT_REQUESTED → "Evaluate now"; PENDING/RUNNING with polling; COMPLETED report; FAILED with code + re-evaluate), score/maximum row, recommendation badge (Pass/Hold/Fail), confidence/attempt/latency metadata, honest AI-usage disclosure, strengths/gaps/uncertainties grid, per-competency progress + evidence rows with verification badges and `@<s>` source-seconds, recruiter decision controls (PASS/HOLD/FAIL buttons + note + saved-decision readback). Polls while `PENDING|RUNNING` (15 s, max 5).
- `src/lib/api/ai-interviews.api.ts` — `getAiInterviewEvaluation`, `reEvaluateAiInterview`, `recordAiInterviewDecision` + types.
- Accessibility: scrollable regions are keyboard-focusable (`tabIndex` + focus ring) so the WCAG A/AA axe scan stays clean.

## 2. Constraints honored

- **Candidates never see evaluation data** — public session/start/complete DTOs carry no score/evaluation fields (asserted in the proof).
- **No synthetic/fake scores** — all scores derive from provider output validated at the schema boundary, evidence verified against the transcript; backend derives recommendation deterministically.
- **AI is never the decision maker** — recruiter records the decision; audit + readback UI refer to the saved decision.
- **No hard-coded Qwen bypass** — provider abstraction + DI; mock remains default.
- **Fabricated evidence fails terminally** — `FABRICATED_EVIDENCE` failureCode; deterministic results preserved on failure paths.

## 3. Test evidence

| Gate | Result |
|---|---|
| Backend jest (full) | **91 suites / 1488 tests PASS** (Phase 2 close: 84 / 1436; +7 suites / +52 evaluation tests) |
| Frontend vitest (full) | **39 files / 381 tests PASS** (incl. new 6-test evaluation dialog suite; pre-existing dialog test updated so new evaluation load adds no duplicate `role="alert"`) |
| Backend `release:gate` (build → lint:baseline → typecheck) | **PASS** (3/3). Baseline refreshed (153 fingerprints) to absorb pre-existing `main` drift; Phase 3 source files are lint- and format-clean |
| Backend `tsc --noEmit` / FE `tsc --noEmit` | Clean |
| Prettier `format:check` | Clean for all Phase 3 files; remaining 12 in repo are inherited `main` drift (out of scope) |
| Secret scan (diff) | No secret-type patterns |
| Live proof | `verification/phase3-interview-evaluation-proof.mjs` — **23/23 checks PASS** (API + browser + axe) |

## 4. Environment blocks (honest status)

| Item | Status |
|---|---|
| `MOCK` provider (default) end-to-end | **PASS** (isolated DB used; API + browser verified) |
| `REAL_QWEN_INTERVIEW_EVALUATION` (live Qwen endpoint) | **BLOCKED BY ENVIRONMENT** — provider + prompt implemented and unit-tested offline, but no reachable/live Qwen endpoint on this machine; not claimed as exercised |
| `SMTP_DELIVERY` (invitation/activation email) | **BLOCKED BY ENVIRONMENT** — SMTP port 1025 unavailable; activation proven via DB (`ACTIVE`) in the proof, not via inbox |

No failures were attributed to product code during closing; the environment blocks above are the only un-exercised areas and are documented, not swept under.