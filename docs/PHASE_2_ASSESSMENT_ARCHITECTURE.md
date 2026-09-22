# Phase 2 — Assessment Engine Architecture (TalentAI)

> Status: **implemented and verified** against the live backend (real Postgres + real BullMQ) and the Next.js frontend.
> Companion docs: `PHASE_2_CURRENT_STATE_AUDIT.md`, `PHASE_2_IMPLEMENTATION_REPORT.md`, `PHASE_2_ACCEPTANCE.md`.

## 1. Goals and design principles

Recruiters need job-specific, auditable, candidate-facing assessments that cannot be gamed by
editing the client, that survive brief network loss, and whose scores are **trustworthy**:

1. **Backend is the score authority.** Choice items are scored deterministically; AI evaluates only
   free-text responses against the recruiter's rubric, and the AI's own overall score is discarded at
   the schema boundary. Total score is always a backend-weighted, clamped 0–100 number.
2. **Leak-proof candidate DTOs.** Every candidate-facing payload is constructed by backend mappers
   that *never* emit `isCorrect`, rubric criteria, competencies, weights, or peer answers. Verified by
   an e2e assertion.
3. **Immutable published versions.** A publication is a copy-on-write draft; once published, a version
   is immutable. Concurrent publishes race on `updateMany DRAFT→PUBLISHED` so only one wins.
4. **Hard submission boundary.** Submissions are idempotent (existing `IdempotencyService`), once-only,
   and permanently lock the session against further response writes.
5. **Failure transparency.** AI provider failures surface as retryable evaluation failures, never as
   fabricated scores. Fabricated/unverifiable evidence is a terminal failure whose deterministic score
   is preserved.
6. **Reuse over rebuild.** The existing AI-provider abstraction, BullMQ queue, permission/guard stack,
   idempotency, audit, and in-app notifications are reused; only assessment-specialized code is new.

## 2. Data model

New Prisma schema (migration `20260922090000_add_assessment_engine`,
amended by `20260922100000_assessment_audit_extra`):

```
Company ──< Assessment ──< AssessmentVersion ──< AssessmentQuestion ──< AssessmentQuestionOption
                            │                        │
                            │                        └ AssessmentRubricCriterion
                            │
                            ├── AssessmentAssignment >── Application (company-scoped)
                            │        └──< AssessmentSession ──< AssessmentResponse
                            │                 └──< AssessmentEvaluation
                            │                 └── AssessmentResult (1:1)
                            └── AssessmentResult ──... 
```

Enums added:

| Entity | Contents |
|---|---|
| `AssessmentStatus` | `DRAFT, IN_REVIEW, APPROVED, PUBLISHED, ARCHIVED` |
| `AssessmentVersionStatus` | `DRAFT, PUBLISHED` |
| `AssessmentQuestionType` | `SINGLE_CHOICE, MULTIPLE_CHOICE, SHORT_TEXT, LONG_TEXT, TRUE_FALSE` |
| `AssessmentAssignmentStatus` | `ASSIGNED, STARTED, SUBMITTED, EVALUATED, EXPIRED` |
| `AssessmentSessionStatus` | `NOT_STARTED, IN_PROGRESS, SUBMITTED, EXPIRED, CANCELLED` |
| `AssessmentEvaluationStatus` | `PENDING, RUNNING, COMPLETED, FAILED` |
| `NotificationType` (+3) | `ASSESSMENT_ASSIGNED, ASSESSMENT_SUBMITTED, ASSESSMENT_EVALUATED` |
| `ApplicationAuditEventType` (+9) | `ASSESSMENT_CREATED, …_UPDATED, …_PUBLISHED, …_ARCHIVED, …_ASSIGNED, …_STARTED, …_SUBMITTED, …_EXPIRED, …_EVALUATED` |

Deliberately dropped at migration time (never used by the backend): the draft enums
`AssessmentCriterionStatus` and `AssessmentEvidenceVerification` — evidence-verification levels are a
string-literal union in `assessment-evidence.service.ts`, not a DB enum.

Scoring fields:
- `AssessmentQuestion.points` — max deterministic points for the item.
- `AssessmentRubricCriterion.maxScore` + `weight` — how AI evaluation points translate into item points.
- `AssessmentEvaluation` (one per attempt) records `provider/model/promptVersion/schemaVersion/latencyMs`
  (persisted from day one — closing the auditing gap noted in the current-state audit).
- `AssessmentResult` holds `totalScore` (0–100), the deterministic component, and any AI component.

## 3. Tenancy, permissions, audit, notifications

- **Permissions** (`assessments.read/create/update/publish/assign/review`) are the canonical source in
  `backend/prisma/seed.ts` and `backend/src/modules/auth/constants/auth.constants.ts`; the migration
  backfills existing databases (`ON CONFLICT (code) DO NOTHING`). Enforced per controller route via
  `PermissionsGuard` + `@RequirePermissions`. All queries are tenant-filtered by `companyId`; cross-company
  access returns `403/404` (e2e-verified).
- **Audit**: assessment lifecycle events re-use `ApplicationAuditService` with the new event types.
- **Notifications**: assignment/submission/evaluation events reuse `InAppNotificationsService`;
  `sendAssessmentAssignedEmail` (with the candidate code and `/assessments/start` link) is backed by the
  existing email worker (`recruitment.assessment-assigned`).

## 4. Candidate access (mirrors the AI-interview pattern)

- `AssessmentCodeService` generates `XXXX-XXXX` codes from an unambiguous charset
  (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `O/0/I/1`), stores only `codeHash` (sha256), and
  normalizes/validates input.
- `AssessmentTokenService` mints a short-lived JWT (purpose `talentai-assessment-access`, default TTL
  120 min via `ASSESSMENT_ACCESS_TOKEN_TTL_MINUTES`) containing the code-hash prefix. The candidate
  keeps it in `sessionStorage` (`ai-recruiter-assessment-token`).
- Public endpoints are all rate-limited (`10–120/min`), bearer-aware, and never resolve to recruiter data.

## 5. Evaluation pipeline

```
POST submit (public) ─► AssessmentSessionsService (session lock, idempotent)
      └─► AssessmentEvaluationService.enqueue ─► BullMQ 'assessment-evaluation'
            └─► AssessmentProcessor ('evaluate-submission' job, concurrency configurable)
                  ├─ deterministic scoring  (assessment-scoring.service)
                  ├─ AI evaluation         (assessment-ai-provider, injectable 'mock'|'qwen')
                  │    └─ strict JSON schema (assessment-output.schema) with evidence
                  │    └─ evidence verification (VERBATIM/SUPPORTED/INFERRED/UNVERIFIED)
                  └─ AssessmentEvaluationService records COMPLETED/FAILED + latency/schemaVersion
```

- **Deterministic path**: correct-choice matching per `QuestionType`, fractional credit for
  `MULTIPLE_CHOICE`, point weighting, clamped 0–100. Always succeeds even if AI is absent.
- **AI path**: only `LONG_TEXT`/`SHORT_TEXT` items marked `aiEvaluated` go to the provider; the provider
  returns per-criterion verdict/evidence/score and *no* overall score. Backend maps criterion scores via
  rubric weights and recomputes the total. Evidence that cannot be tied to the candidate text is
  `UNVERIFIED` → terminal failure + deterministic-only result retained.
- **Failure handling**: `PROVIDER_UNAVAILABLE`/timeout/parse errors write a `FAILED` evaluation with a
  safe message and a `PENDING` retry entry; the recruiter can `POST /sessions/:id/retry-evaluation`.
  Submission state is never lost or wrong—there is always a deterministic floor.

## 6. Bulk assignment

- `assignments/:versionId/bulk-assignments` enqueues one `bulk-assign` job (chunked at 100, job id
  `bulk-assign-${sha256(...)}`). Within the job, each assignment is deduplicated by
  `(versionId, applicationId)`; per-row outcomes (`ASSIGNED`/`ALREADY_ASSIGNED`/`SKIPPED`/`FAILED`) are
  recorded. `GET /assessments/bulk-jobs/:jobId` returns truthful per-row results, not blanket success.

## 7. Question generation (AI) and publisher guard-rails

- `assessment-generation.service`: given job requirements + existing config, calls the provider for a
  candidate question set inside the strict schema; generated questions are marked `aiGenerated=true,
  aiApproved=false`.
- `assessment-validation.service` (pure, fully unit-tested):
  - rejects **unapproved AI content** at publish time (`AI_CONTENT_UNAPPROVED`);
  - enforces at least one question, no duplicate prompts, positive points/weights;
  - `SINGLE_CHOICE`/`TRUE_FALSE` must have exactly one correct option; `MULTIPLE_CHOICE` ≥2 correct;
  - text items must not ship options; choice items must not ship rubric criteria with weight >0.
- `assessment-code/approve-ai` marks AI content approved (`assessments.update` permission).

## 8. Frontend architecture

- **Recruiter surfaces** (all in `src/components/assessments/`, wired into existing workspace shells):
  - `assessment-manager.tsx` — Job Workspace "Assessments" tab (`assessments.*` guarded): list, create,
    draft-version, publish, archive, assign, summary cards, AI generation dialog, result dialog.
  - `question-builder.tsx` — drag-order question editing with option/rubric editors and per-question
    AI-evaluation toggles; validates before save.
  - `assessment-result-view.tsx` — authoritative score via `GET /assessments/sessions/:id/result`;
    deterministic floor; progress with threshold context; honest failure/retry state.
  - `application-assessment-panel.tsx` — per-application status, start/expiry, review link.
- **Candidate surfaces** (`src/app/assessments/*`, API client `src/lib/api/assessments.api.ts`):
  - `/assessments/start` — code entry → verify → store token.
  - `/assessments/take` — welcome → start → timed answering with **debounced (800 ms) text autosave** and
    immediate choice saves, save-state indicators (`saved/saving/error/offline`), optimistic-collision
    handling via `baseUpdatedAt` (STALE_WRITE → rebase on the server version and retry once), server-timer
    resync after every save, review step, on-screen countdown, submit locks the session.
- `lib/assessments/assessment-helpers.ts` — countdown/status-lookup formatting (unit-tested).

## 9. Configuration (`registerAs('assessment')`)

| Env | Default | Meaning |
|---|---|---|
| `ASSESSMENT_ACCESS_TOKEN_SECRET` | `''` | JWT signing secret (required in production) |
| `ASSESSMENT_ACCESS_TOKEN_TTL_MINUTES` | `120` | Candidate session token lifetime |
| `ASSESSMENT_DEFAULT_DURATION_MINUTES` | `30` | Default assessment duration |
| `ASSESSMENT_MAX_BULK_ASSIGN` | `500` | Cap per bulk-assign request |
| `ASSESSMENT_WORKER_CONCURRENCY` | `3` | Processor concurrency (clamped 1–20) |
| `ASSESSMENT_AI_PROVIDER` | `mock` | `mock` (default) or `qwen` |
| `ASSESSMENT_AI_TIMEOUT_MS` | `60000` | Provider timeout (clamped 5 s–180 s) |
| `ASSESSMENT_AI_PROMPT_VERSION` / `ASSESSMENT_AI_SCHEMA_VERSION` | `v1` | Audit metadata persisted per evaluation |

The assessment queue lives inside `AssessmentsModule`
(`BullModule.registerQueue({ name: 'assessment-evaluation' })`) and inherits the global connection from
the existing `QueueModule` root.

## 10. Non-goals (unchanged from audit)

Semantic search/pgvector, unified candidate intelligence, Qwen GPU infra, screening/Tavus rewrites,
code execution, proctoring/biometrics.