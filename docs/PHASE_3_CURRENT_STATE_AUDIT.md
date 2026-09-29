# Phase 3 — Current-State Audit (AI Interview Intelligence & Structured Post-Interview Evaluation)

> Source of truth: the GitHub repository, inspected 2026-09-28.
> Product code lives in `AI-Recruiter-Agent/` (frontend: Next.js root, backend: `AI-Recruiter-Agent/backend/` NestJS).
> This document records what actually exists so Phase 3 reuses infrastructure instead of duplicating it.

## A. Repository state

| Item | Value |
|---|---|
| Working repo | `AI-Recruiter-Agent/` (the workspace-root git repo is stale scaffolding and is not used for product commits) |
| Branch | `main` |
| HEAD SHA | `4ad4251858d189aa9ae26b6b84966e95604296b4` ("feat(phase2): bulk-assign UI + close external verification checkpoint") |
| Working tree | Clean (Phase 2 closed) |
| Remotes | `analysis` → `https://github.com/JupathoClaus/AI-RECRUITING-ANALYSIS.git` (where Phase 2 was pushed, `b74df37..4ad4251`); `origin` → `AkademiaLimited/AI-Recruiter-Agent.git` (unreachable, not used) |
| Phase 2 acceptance | Row 27 (bulk-assign UI) → PASS; upstream docs: `docs/PHASE_2_ACCEPTANCE.md`, `PHASE_2_CURRENT_STATE_AUDIT.md`, `PHASE_2_CLOSURE_AUDIT.md`, `PHASE_2_ASSESSMENT_ARCHITECTURE.md`, `PHASE_2_EXTERNAL_PRODUCT_VERIFICATION_REPORT.md` |

## B. Existing domain model (Prisma, `backend/prisma/schema.prisma`)

```
Company ──< Job ──< Application >── CompanyCandidate >── Candidate
   │            │         │
   │            │         ├──< AssessmentAssignment ──< AssessmentSession
   │            │         │        └──< AssessmentResponse / AssessmentEvaluation / AssessmentResult
   │            │         ├──< AiInterview (Tavus/MOCK)  ← the Phase 3 anchor model
   │            │         └──< AiScreeningResult (+ Batch / BatchItem)
   │            └──< Assessment (recruiter-owned, versioned questions + rubrics)
```

### The `AiInterview` model (`schema.prisma:2668-2742`) — everything Phase 3 evaluates lives here

- Lifecycle `AiInterviewStatus` (`:2642`): `CREATED → SENT → ACCESSED → READY → IN_PROGRESS → COMPLETED`, plus terminal `CANCELLED / EXPIRED / FAILED`.
- `AiInterviewProvider` (`:2654`): `MOCK | TAVUS` (default `TAVUS`).
- `AiInterviewTranscriptStatus` (`:2659`): `NOT_REQUESTED | PENDING | READY | FAILED`.
- Tavus execution fields: `tavusConversationId` (indexed), `tavusConversationUrl`, `tavusStatus`, `tavusMeetingToken`, `artifactSyncAttemptedAt`.
- **Transcript**: `transcriptStatus`, `transcriptUrl`, `transcript Json?` — the raw provider JSON array of turns `{role?, content?, timestamp?, seconds_from_start?, duration?}` (`ai-interviews.service.ts:44-50`, sanitized at `:1384-1403`). **There is no normalized transcript/segment model.**
- **Recording**: `recordingStatus`, `recordingUrl`, `recordingMetadata Json?`.
- Candidate-facing security: `codeHash @unique` (sha256 of the code), `codeDisplayHint`; **raw codes are never persisted** (`ai-interview-code.service.ts`).
- Config: `language`, `estimatedDurationMinutes`, `availableFrom/scheduledAt/expiresAt` (30-day default), accommodation fields, `notes`, `createdByMembershipId`.
- Indexes: `codeHash unique`, `applicationId`, `companyId`, `status`, `tavusConversationId`, `expiresAt`.
- `Application.aiInterviews AiInterview[]` (relation at `:1969`).

### The Phase 6 Assessment models — the proven Phase 3 template (`schema.prisma:2744-3069`)

```
Assessment ──< AssessmentVersion (immutable, contentHash)
  └──< AssessmentQuestion (typed, sortOrder, competency, aiEvaluated)
        ├──< AssessmentQuestionOption (isCorrect recruiter-only)
        └──< AssessmentRubricCriterion (name/description/guidance/maxScore/weight)
AssessmentAssignment (unique application+version) ──< AssessmentSession (codeHash, status)
  ├──< AssessmentResponse (server-persisted answers, @unique session+question)
  ├──< AssessmentEvaluation (attempt history; @unique session+attempt; status PENDING/RUNNING/COMPLETED/FAILED)
  └── AssessmentResult (one per session; backend-computed 0–100 with question/competency breakdown)
```

- `AssessmentEvaluationStatus` (`:2800`): `PENDING | RUNNING | COMPLETED | FAILED`.
- Audit enums (`ApplicationAuditEventType` at `:1733-1775`) already include `ASSESSMENT_EVALUATED`, `ASSESSMENT_REVIEWED`, `ASSESSMENT_SUBMITTED`, etc. **No `AI_INTERVIEW_*` audit events exist.**
- Notification enums (`NotificationType` at `:495-512`) include `AI_SCREENING_COMPLETED`, `ASSESSMENT_EVALUATED`, human `INTERVIEW_*`. **No AI-interview evaluation notification type exists.**
- No `UserNotification` link or `AiInterviewEvaluation*` / `AiInterviewEvidence*` / `AiInterviewTranscript` models exist anywhere in the schema.

## C. Existing AI-interview pipeline (Tavus + artifacts)

- **Recruiter controller** (`backend/src/modules/ai-interviews/controllers/ai-interviews.controller.ts`): `POST /ai-interviews` (`interviews.create`), `GET /ai-interviews` (`interviews.read`, paged query), `GET /:id`, `GET /by-application/:applicationId`, `GET /:id/preview`, `GET /:id/recording-playback`, `POST /:id/regenerate-code`, `POST /:id/send`, `POST /:id/sync-artifacts`, `POST /:id/cancel` (`interviews.update` / `interviews.cancel`). All behind `JwtAuthGuard + PermissionsGuard`; `GET` scoped by `activeCompanyId`.
- **Public candidate controller** (`public-ai-interviews.controller.ts`): `POST /ai-interviews/public/verify-code`, `GET /ai-interviews/public/session`, `POST /ai-interviews/public/start`, `POST /ai-interviews/public/complete` — short-lived JWT (TTL 60 min, `cv` = codeHash prefix), `@Throttle(10/60s)`, no recruiter data leaks (`verifyCode` returns only display data, never scores/notes).
- **Tavus webhook receiver** (`tavus-callback.controller.ts`): `POST /ai-interviews/callback/:secret` (secret-in-path, `TAVUS_CALLBACK_SECRET`) plus a secretless variant, `@ApiExcludeController`. Handles `system.replica_joined`/`system.pal_joined`, `system.shutdown` (idempotent → COMPLETED + transcript PENDING), `application.transcription_ready` (persists sanitized `transcript` JSON + `transcriptUrl`), `application.recording_ready`, `application.recording_copy_failed` (`ai-interviews.service.ts:1024-1155`).
- **Artifact reconciliation** (`tavus-artifact-sync.service.ts` + `tavus-artifact-sync-scheduler.service.ts`): fills missing transcript/recording; caps 5/cycle, 72h window; `syncTavusArtifacts` (`ai-interviews.service.ts:1248-1366`) also auto-ends stale active conversations, reconciles `provider ended → COMPLETED`, and pulls artifacts missed by webhooks.
- `buildConversationContext` (`ai-interviews.service.ts:829`, `startInterview` at `:657-957`) assembles the Tavus `conversational_context` from candidate profile, job title/description/skills, and resume extraction — the raw materials Phase 3 will reuse for job-specific evaluation.
- **No evaluation exists anywhere in this pipeline.** The terminal artifact is `COMPLETED` + transcript `READY` + optional recording. No score, report, recommendation, evidence verification, schema validation, or recruiter decision UI exists for AI interviews.

## D. Existing reusable AI-evaluation architecture (the Phase 3 template)

Phase 2 built a complete, proven evaluation stack for assessments. Phase 3 will mirror it for AI interviews. Evidence it exists and is tested:

| Concern | Location | What it provides |
|---|---|---|
| Provider interface | `backend/src/modules/assessments/ai/assessment-ai-provider.interface.ts` | `evaluate(input, options)`; `AssessmentAiOutput { schemaVersion, questionEvaluations, strengths, gaps, uncertainties }`; typed status/confidence/evidence types; `AssessmentAiProviderError` (retryable flag + safe message). |
| DI token | `ai/assessment-ai-provider.token.ts` (`ASSESSMENT_AI_PROVIDER`) | Provider chosen by factory in `assessments.module.ts:29-44` (mock/qwen) + `onModuleInit` logs selection. |
| Strict schema validation | `ai/assessment-output.schema.ts` (`validateAssessmentAiOutput`) | Drops model-supplied overall scores at the boundary; caps MAX_STRING 5000, 20 criteria/question, 200 questions, 10 evidence/criterion, 50 list items; unknown-key rejection. |
| Mock provider | `ai/mock-assessment.provider.ts` | `MockAssessmentScenario` (default/strong/weak/empty/provider_failure/malformed/fabricated_evidence/prompt_injection), `providerName='mock'`. |
| Real provider | `ai/qwen-assessment.provider.ts` | OpenAI-compatible client (`QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL`), HARD RULES prompt (untrusted candidate data, exact-quote evidence, no overall score), `buildUserPrompt` char-bound, `promptVersion`. |
| Evidence verification | `ai/assessment-evidence.service.ts` | `verify(quote, responseText)` → `VERBATIM | SUPPORTED | INFERRED | UNVERIFIED`; `verifyAll`; `hasFabricatedEvidence` = any `UNVERIFIED`. Same semantics as screening's `evidence-verification.service.ts` (`ai-screening/services`). |
| Deterministic scoring | `assessments/services/assessment-scoring.service.ts` | Objective questions scored server-side only; open-text = 0 deterministically; multi-choice partial credit. |
| Evaluation orchestrator | `assessments/services/assessment-evaluation.service.ts` | Enqueue with deterministic `jobId=evaluationId` (dedup, `:68-83`); claim PENDING/RUNNING→RUNNING via `updateMany` (`:99-111`); input fingerprint (`:407-424`); provider call; clamp scores to rubric + weight + round2 (`:180-221`); **fabricated evidence → terminal FAIL + preserve deterministic result** (`:223-238`); finalize = result upsert + session/assignment → EVALUATED + audit + notify assignees (`:426-574`); `retry()` re-evaluation preserving attempt history (`:287-350`). |
| Processor / retries | `assessments/queue/assessment.processor.ts` | `@Processor('assessment-evaluation', { concurrency: 1–20 via ASSESSMENT_WORKER_CONCURRENCY })`; non-retryable provider errors → `failTerminal` + **deterministic-only fallback** (`finalizeDeterministicOnly` `:109-195`); retries exhausted → same fallback; `UnrecoverableError` semantics. |
| Queue constants | `queue/assessment-queue.constants.ts` | `ASSESSMENT_QUEUE='assessment-evaluation'`, `ASSESSMENT_EVALUATE_JOB='evaluate-submission'`, `ASSESSMENT_BULK_ASSIGN_JOB`. |
| AI usage metadata | Persisted on `AssessmentEvaluation` (`provider/model/promptVersion/schemaVersion/latencyMs/responseId/inputFingerprint/failureCode/failureMessageSafe`) and `AiScreeningResult` (`provider/model/promptVersion/providerResponseId/inputFingerprint/...`). **Phase 3 will persist the same fields for interview evaluations.** |
| Mature screening analogues | `ai-screening/` | `BackendScoringService` (deterministic 0–100 + SHORTLIST ≥72 / NOT_SHORTLIST ≤38 / HUMAN_REVIEW, `backend-scoring.service.ts:34-172`); prohibited-reasoning guard; redaction; `criterion-builder`; bulk screening. The score→recommendation mapping pattern (never model-authored) is the model for Phase 3's PASS/HOLD/FAIL derivation. |

Config conventions (`backend/src/config/loaders/`): `registerAs` loaders per domain (`assessment.config.ts`, `ai-interview.config.ts`, `tavus.config.ts`, `ai-screening.config.ts`), env guarded by `config/validation.ts` (Joi; clamped ranges). Phase 3 will add an `ai-interview-evaluation` config (or extend `ai-interview.config.ts`) with `provider`, `timeoutMs`, `promptVersion`, `schemaVersion`, `workerConcurrency`.

## E. Existing queue / retry / idempotency / notification / audit infra

- **Queue bootstrap** (`modules/queue/queue.module.ts`): global `BullModule.forRootAsync` (Redis) with defaults `attempts: 3`, exponential backoff 1000 ms, `removeOnComplete: 100`, `removeOnFail: 50`; registers `email/notifications/analytics/ai-processing/interview-reminder/interview-notification/ai-screening/resume-processing`. Assessment queue is registered **locally** in `assessments.module.ts:53` — Phase 3 will register an `ai-interview-evaluation` queue the same way in the ai-interviews module.
- **Idempotency** (`common/idempotency/idempotency.service.ts`): `executeTransactional` with unique `key+companyId+userId+operation`, Serializable tx, P2034 retry ×3, lease ownership, COMPLETED dedup/`requestHash` reuse check, FAILED reclaim. Used by Phase 2 mutation endpoints; the Tavus webhook path uses its own `tavusConversationId` + atomically guarded status transitions instead (both acceptable; Phase 3 webhook→evaluation handoff will guard with a unique per-interview evaluation row).
- **Notifications** (`modules/notifications/services/in-app-notifications.service.ts`): `create({userId, companyId, type, title, body, relatedEntityType, relatedEntityId, actionUrl})`; user-scope filter (`companyId = X OR null`); category filters. Phase 3 adds a new `NotificationType` (e.g. `AI_INTERVIEW_EVALUATED`) and a category mapping if desired.
- **Audit** (`modules/applications/services/application-audit.service.ts` + `ApplicationAuditEventType`): system/recruiter actors, `applicationId` linkage. Phase 3 adds `AI_INTERVIEW_*` event types (e.g. `AI_INTERVIEW_EVALUATED`, `AI_INTERVIEW_REVIEWED`).
- **Error shape / tenant guards**: `GlobalExceptionFilter` (structured `{errorCode, message, timestamp, path, requestId}`, passes sanitized `conflicts[]`/`issues[]`), `tenant-membership.guard.ts`, `PermissionsGuard`.

## F. Existing permissions & security

- Permissions follow `resource.action` (~80 codes in `backend/prisma/seed.ts`; phase-3 relevant: `interviews.create/read/update/cancel` already gate AI interviews). **No `ai-interviews.*`-specific codes and no `evaluation`/`review` codes exist — Phase 3 may add e.g. `interviews.evaluate`/`interviews.review-evaluation` (seed + migration backfill) or reuse `interviews.*` pending spec decision.**
- Security posture today (must be preserved/extended):
  - Raw codes never stored; callback secret-in-path; timing-safe comparisons (`secretsMatch`).
  - Candidate endpoints: 10 req/min throttle, purpose-scoped short-lived tokens, `cv` (codeHash prefix) binding, no candidate→recruiter data leakage in any public response DTO.
  - `GlobalExceptionFilter` + `ApplicationAuditService` for tenant-safe errors and audit trail.
  - CORS allows `Idempotency-Key`; `corsOrigin` config-driven.
  - Provider outputs validated at schema boundary; evidence verified against ground truth; fabricated evidence fails terminally; backend, never the model, computes scores/recommendations.

## G. Existing UI architecture

- **Recruiter AI-interviews page** `src/app/ai-interviews/page.tsx`: server-side list w/ search + status/job/language filters + pagination (58/66/72/77/84); sidebar entry `src/components/layout/sidebar.tsx:83-88` ("AI Interviews"); create via `src/components/ai-interview/send-ai-interview-modal.tsx` from both the list and `src/app/candidates/page.tsx:1274`.
- **Detail dialog** `src/components/ai-interview/ai-interview-detail-dialog.tsx`: status/provider/language badges, candidate/job/duration/timeline/invitation cards, accommodation banner, **recorded playback (watch/play signed URL + metadata/duration)** and **transcript read-only views** (speaker badges, seconds-from-start, scroll area), artifact Refresh/sync + bounded 20 s polling while artifacts process. **This is the natural anchor point for the evaluation/report UI (score, recommendation, competency breakdown, evidence, recruiter decision).**
- Candidate-facing flow `src/app/interview/*`: `access → welcome → device-check → preparation → session (mock or Tavus iframe) → complete`. **Consumed by `src/lib/api/ai-interviews.api.ts` public functions (verify/session/start/complete). Candidate pages must stay score-free.**
- State/data: zustand `store/useStore.ts`, `src/lib/api/*.api.ts` over `apiRequest` (JWT + refresh + skipAuth). No zod; manual DTO typing. Reusable UI primitives confirmed: `dialog, badge, progress, tabs, select, textarea, card, button, skeleton, separator, accordion`, `modal-header`; pattern blocks `progress + badge + evidence` exist (`screening-result-view.tsx`, Phase 2 result dialog) and Phase 2 added `aria-label`s on progress bars.
- There is **no AI-interview report surface, no applicant-workspace AI-interview evaluation panel reference, and no hard-coded interview score/PASS/HOLD/FAIL logic** in the FE today (FE score hits are screening `aiScore` concerns only).

## H. Existing tests

- Backend: jest specs colocated (`modules/*/{tests,__tests__}`) + e2e in `backend/test/` (`jest-e2e.json`, Postgres `:5433`). Reference test sets: assessments (validation/scoring/evaluation/idempotency/queue), screening (semantic scenarios, HTTP security matrices, concurrency, fingerprint), `ai-interview-token.service.spec.ts` in the module. Full backend suite at Phase 2 close: 1436/1436 (84 suites) — the Phase 3 gates must preserve this.
- Frontend: vitest colocation (jsdom; 293+ tests; `ai-interviews-page.test.tsx` exists with `aiScore: null` fixtures). Playwright installed; Playwright/browser proofs in `verification/*.mjs` (`phase1-smoke.mjs`, `phase2-assessment-journey.mjs`, `phase2-bulk-assign-proof.mjs`, `product-proof.mjs`).
- Conventions to follow: scenario-driven mock providers, strict output-schema specs, HTTP security matrices (no-token/invalid/cross-tenant/abuse), concurrency/at-least-once dedup proofs, fingerprint staleness, lint baselines (`scripts/lint-baseline.js`/`lint-changed.js`), `release:gate` (build → lint:baseline → typecheck).

## I. Existing gaps (what Phase 3 must build)

1. **No AI-interview evaluation data model.** No `AiInterviewEvaluation` (attempts/status/provider metadata), `AiInterviewCompetencyEvaluation`, `AiInterviewEvidence`, or normalized `AiInterviewTranscript`/segment tables. Transcript currently lives as one raw JSON blob on `AiInterview.transcript`.
2. **No evaluation trigger.** Nothing fires after `COMPLETED` + transcript `READY`; no queue job, no status (`e.g. EVALUATION_READY/EVALUATING/EVALUATED`), no re-evaluation path.
3. **No job-specific interview AI provider.** No `InterviewEvaluation` provider interface/token, no mock fallback provider (must remain default), no Qwen provider for interviews, no strict interview-evaluation output schema, no prompt with HARD RULES (untrusted candidate transcript, exact-quote-only evidence, no overall score).
4. **No evidence verification against the transcript** (the interplay of the interview transcript is new vs. assessment responses/resume text).
5. **No deterministic interview scoring.** No score authority on the backend, no recruiter-configurable PASS/HOLD/FAIL thresholds, no recommendation semantics; candidate never sees them (no leakage risk today precisely because nothing computes them).
6. **No recruiter evaluation/report UI**: score, recommendation, competency breakdown, evidence with verification badges, strengths/gaps/uncertainties, AI-usage metadata, and the recruiter decision action (with audit).
7. **No candidate-facing change is required by design** — but the public DTOs must be re-audited so no evaluation data can ever leak.
8. **Missing cross-cutting wires**: no `AI_INTERVIEW_*` audit event types, no AI-interview notification type/emission, no evaluation permissions/role grants (if new codes are adopted), no `ai-interview-evaluation` config block, no `BullModule.registerQueue` for the new queue, no schemaVersion/latency columns on the interview artifact side.
9. **No AI-usage/token accounting** and no per-interview evaluation attempt history; re-evaluation would overwrite the single JSON blob today (Phase 3 needs immutable moves + history preservation like `AssessmentEvaluation(@unique session+attempt)`).
10. **No in-app notification deaggregation** for "AI interview evaluated" (currently only screening/assessment/notification-type buckets exist).

**Non-goals (explicitly out of scope, per the Phase 3 plan):** rewriting the Tavus live-avatar flow; new microservices (reuse the existing BullMQ/storage/auth); hard-coded Qwen logic bypassing the provider abstraction; synthetic/fake scores or reports in production paths; the AI as a final decision maker (recruiter decides); exposing recruiter evaluation to candidates; implementing Qwen GPU infra; cross-module screening-score contamination (interview score is separate from screening score).