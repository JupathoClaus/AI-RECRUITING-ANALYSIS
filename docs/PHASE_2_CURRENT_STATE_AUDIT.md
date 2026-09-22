# Phase 2 — Current-State Audit (TalentAI Assessment Engine)

> Source of truth: the GitHub repository, inspected 2026-09-22.
> Product code lives in `AI-Recruiter-Agent/` (frontend: Next.js root, backend: `AI-Recruiter-Agent/backend/` NestJS).
> This document records what actually exists so Phase 2 reuses infrastructure instead of duplicating it.

## A. Repository state

| Item | Value |
|---|---|
| Branch | `UI-code` (tracking `origin/UI-code`) |
| HEAD SHA | `ceeffa039f0b32a5c414cfe81dd93a0f09e5dac0` ("Initial frontend UI") |
| Working tree | Dirty: many deleted `awesome-design-md-main/**` + `README.md` design-reference files (staged deletions), plus untracked `AI-Recruiter-Agent/`, `backend/`, logs, screenshots. Product code itself is in untracked `AI-Recruiter-Agent/`. |
| Recent commits | Only 3 (`ceeffa0`, `014a2b8`, `a4d8f27`); no Phase 1 commit history on this branch — Phase 1 acceptance docs live in `AI-Recruiter-Agent/docs/` |
| Remote | `https://github.com/AkademiaLimited/AI-Recruiter-Agent.git` |

Phase 1 references: `AI-Recruiter-Agent/docs/PHASE_1_FINAL_ACCEPTANCE.md`,
`IMPLEMENTATION_PHASE_1_REMEDIATION_REPORT.md`, `PHASE_1_EXTERNAL_VERIFICATION_REPORT.md`,
`backend/JOBS_DOMAIN_REPORT.md`, `IMPLEMENTATION_PHASE_1_REPORT.md`.

## B. Existing domain model (Prisma, `backend/prisma/schema.prisma`)

```
Company ──< Job ──< Application >── CompanyCandidate >── Candidate (global)
   │            │         │
   │            │         ├──< ApplicationScreeningAnswer >── JobScreeningQuestion
   │            │         ├──< ApplicationStageHistory (from/to JobPipelineStage)
   │            │         ├──< ApplicationAssignment / Note / Flag / Decision
   │            │         ├──< Interview ──< InterviewParticipant / InterviewHistory
   │            │         ├──< AiInterview (Tavus)
   │            │         └──< AiScreeningResult (+ Batch / BatchItem)
   │            ├──< JobPipeline ──< JobPipelineStage (ASSESSMENT stage type exists)
   │            ├──< JobScreeningConfiguration / JobAccessibilityConfiguration
   │            └──< JobSkill / Education / Experience / Language requirements
```

- `ApplicationStatus` includes `ASSESSMENT`; `PipelineStageType` includes `ASSESSMENT` (`ApplicationStatus`/`PipelineStageType` enums). No automatic advancement: `autoAdvanceEnabled` exists on stages but workflow service requires recruiter action.
- `Candidate` is global; tenancy is via `CompanyCandidate (@unique[companyId, candidateId])` and `Application.companyId`.
- `JobPipelineStage.assessmentTemplateId: String?` is a free-text placeholder (no FK) — the only assessment hook in the pipeline.
- **No dedicated Assessment models exist.** `backend/src/modules/assessments/` is an empty stub (`AssessmentsModule` with no controllers/providers) and is **not** registered in `src/app/app.module.ts`. This is the Phase 2 extension point.

## C. Existing assessment-related / reusable functionality

| Search term | Finding |
|---|---|
| `assessment` (frontend) | Only `assessmentTemplateId` passthrough, `status-badge` ASSESSMENT variant, copy text. No quiz/question UI. |
| `JobScreeningQuestion` | Types `SHORT_TEXT/LONG_TEXT/SINGLE_CHOICE/MULTIPLE_CHOICE/YES_NO/NUMBER/DATE/FILE/VIDEO/AUDIO/URL` with `options Json?`, `expectedAnswer Json?`, `weight`, `sortOrder`, `aiEvaluationAllowed`; answers in `ApplicationScreeningAnswer (@unique[applicationId,questionId])`. Reusable **pattern**, but screening answers ≠ assessment sessions (no versioning, no timer, no autosave). |
| `screening-ethics.validator.ts` | Deterministic prohibited-criteria validation for screening config — pattern to copy for assessment fairness validation. |
| Scoring | `ai-screening/services/backend-scoring.service.ts` — backend computes authoritative 0–100 score from per-criterion statuses; AI overall score ignored. Reuse pattern (not the class; criteria shapes differ). |
| Evidence | `ai-screening/services/evidence-verification.service.ts` — `VERBATIM/SUPPORTED/INFERRED/UNVERIFIED` verification. Reuse algorithm for assessment AI evaluation. |
| Rubric/criterion | `CriterionBuilderService` (screening) builds criteria from job; assessment needs its own recruiter-owned rubric tables. |

## D. Existing candidate-facing flow

- Public careers: `src/app/careers/[companySlug]/page.tsx`, `.../jobs/[jobSlug]/page.tsx`, `.../apply/page.tsx` → `lib/api/public-careers.api.ts` (`skipAuth:true`, `FormData POST /public/companies/{c}/jobs/{j}/applications`, `Idempotency-Key: crypto.randomUUID()`, honeypot `websiteUrl`, 120s timeout) → `{publicReference, applicationNumber}`; status via `GET /public/applications/{ref}/status`.
- AI interview candidate flow: `src/app/interview/access|welcome|device-check|preparation|session|complete/page.tsx`; short `XXXX-XXXX` code (`ai-interview-code.service.ts`: unambiguous charset, sha256 `codeHash @unique`, normalize/format/validate) → short-lived JWT (`ai-interview-token.service.ts`, purpose `talentai-ai-interview-access`, `cv` = codeHash prefix, TTL 60m) in `sessionStorage` (`lib/interview-session.ts`); public endpoints `POST /ai-interviews/public/verify-code|start|complete`, `GET /public/session`, all `@Throttle(10/min)`, bearer extraction, no recruiter data leakage. **Phase 2 copies this pattern for assessment candidate access.**
- No autosave/session infrastructure exists for candidates — Phase 2 builds it (server-persisted responses, debounced client saves, save-state indicators).

## E. Existing AI architecture

- Provider interface: `ai-screening/providers/ai-screening-provider.interface.ts` — single method `screen(input, options?)`. Implementations: `mock` (scenario fixtures incl. `PROVIDER_FAILURE`, `malformedResult`), `qwen` (OpenAI-compatible `QWEN_BASE_URL`, default model `qwen3.5:9b`, `temperature 0.1`, `response_format json_object`, timeout 5–180s, classified errors: timeout/auth/rate-limit/unavailable), `openai`, `deepseek`. Selected by `AI_SCREENING_PROVIDER` env via factory in `ai-screening.module.ts`.
- Structured output: `schemas/qwen-output.schema.ts` (`validateQwenOutput`) and `schemas/screening-output.schema.ts` (strict unknown-key rejection, bounds, cross-field invariants).
- Evidence verification, deterministic backend scoring (thresholds SHORTLIST ≥72 / NOT_SHORTLIST ≤38), prohibited-reasoning guard, resume redaction — all in `ai-screening/services|utils`.
- Queue: `queue/ai-screening.processor.ts` (`@Processor('ai-screening', {concurrency:3})`, PENDING→RUNNING `updateMany` claim, `STALE_FINGERPRINT` recheck, retryable vs `UnrecoverableError`, `jobId = screening.id` dedup). Enqueue in `ai-screening.service.ts` (Serializable-tx create + in-tx reuse recheck, P2034 retry ×3).
- AI metadata persisted on `AiScreeningResult`: `provider/model/promptVersion/providerResponseId/inputFingerprint/status/scores/...`. Gaps (not persisted): `schemaVersion`, latency. Phase 2 persists both for assessments.
- Config: `src/config/loaders/ai-screening.config.ts` (`registerAs('aiScreening')`, clamped timeouts, worker concurrency 1–20).

## F. Existing permissions

- Canonical list `backend/prisma/seed.ts:15-95` (~80 codes, `resource.action` convention). Role grants `ROLE_PERMISSIONS:97-164`. Runtime `findOrCreate` (`permissions.service.ts`), enforcement `PermissionsGuard + @RequirePermissions()` (`modules/auth/guards/permissions.guard.ts`), tenant gate `tenant-membership.guard.ts` (`activeCompanyId+membershipId` from JWT `cid/mid`).
- **No `assessments.*` codes exist.** Phase 2 adds: `assessments.read/create/update/publish/assign/review` (seed.ts + migration backfill + guard usage). No `ai-screening.*` codes exist either (screening piggybacks on `applications.*`/`jobs.manage_screening`) — assessment gets explicit codes because it is recruiter-facing CRUD.

## G. Existing UI architecture

- Job Workspace: `components/recruitment/job-workspace.tsx` (`section` = overview|applications|pipeline|screening|interviews|analytics tabs; routes `app/jobs/[jobId]/*`). Application Workspace: `components/recruitment/application-workspace.tsx` (`app/applications/[applicationId]`). Candidate profile: `components/candidates/candidate-profile.tsx`.
- Reusable: `ui/{dialog,input,select,checkbox,table,tabs,badge,progress,skeleton,empty-state,modal-header}`, `recruitment/{status-badge,application-table,pagination,table-skeleton}`, `ai-screening/screening-result-view.tsx` (score Badge+Progress+evidence pattern, `lib/utils:getScoreColor/getScoreBgColor`), `ai-interview/send-ai-interview-modal.tsx`.
- State: `store/useStore.ts` (zustand), `lib/api/*.api.ts` (`apiRequest()` + JWT localStorage + refresh), no zod/yup (manual validation).
- Loading/error/empty: `Skeleton` → `EmptyState{title,description,action}` → inline error div (consistent across workspaces).
- Navigation: dark sidebar (`layout/sidebar.tsx`), no top-level assessment item — Phase 2 stays contextual (`Job → Assessments` tab, `Application → Assessment` panel, candidate `/assessments/*`).

## H. Existing tests

- Backend: jest (`testRegex: *.spec.ts`, `testEnvironment: node`), unit specs colocated (`modules/*/{tests,__tests__}`), e2e in `backend/test/` (`jest-e2e.json`, needs `postgres-test:5433` + seed), scripts `test / test:ai / test:e2e / verify:migration / release:gate`.
- Frontend: vitest colocation (`src/**/*.test.{ts,tsx}`, jsdom, 35 files), Playwright installed, `verification/browser-proof.mjs` + `product-proof.mjs` (19 checks).
- Conventions: scenario-driven mock providers, HTTP security matrices, concurrency specs, lint baselines. Phase 2 follows: service specs (validation/scoring/versioning), processor spec, HTTP matrix (tenant isolation, code/token abuse, correct-answer leakage), vitest builder/result specs.

## I. Existing gaps (what Phase 2 must build)

1. No Assessment/Version/Question/Option/Rubric/Assignment/Session/Response/Evaluation/Result tables.
2. No immutable versioning; `assessmentTemplateId` is an untyped string.
3. No recruiter builder, preview, publish validation, AI question generation.
4. No candidate assessment access (code/token), session, autosave, timer/expiry, submit-once.
5. No deterministic choice scoring; no rubric-based AI text evaluation for assessments.
6. No `assessments.*` permissions; no assessment audit events; no assessment notification types/email templates.
7. No assessment queue; bulk assignment path missing.
8. No Job/Application workspace assessment surfaces; no result-review UI; no analytics aggregates.
9. `AiScreeningResult` lacks `schemaVersion`/latency — Phase 2 persists both from day one.

Non-goals (explicitly out of scope): semantic search/pgvector, unified candidate intelligence, Qwen GPU infra, screening/Tavus rewrites, code execution, proctoring/biometrics.
