# TalentAI Project Status

**Updated:** 2026-08-15 (release-candidate preparation session)
**Branch:** `main` (release-candidate work uncommitted in the working tree)

---

## 1. Project overview

TalentAI is an enterprise-grade, AI-powered recruitment management platform (an "AI Recruiter Agent"). It automates the hiring workflow end to end:

- Job posting, publishing and lifecycle management (draft → active → closed → reopen)
- Candidate sourcing, management and application tracking
- Configurable recruitment pipeline (stage movement, bulk actions)
- Interview scheduling with tenant-scoped slot-conflict validation
- **AI resume screening** — resume upload → extraction → AI scoring with recommendation/confidence
- **AI interviews** — persisted, tenant-scoped interview sessions
- Dashboard, analytics, reports, notifications and company/settings administration

Every number shown in the UI is real and server-derived. The product explicitly avoids fabricated metrics or hardcoded demo data.

## 2. Goal

A production-ready recruitment platform where:

- all displayed metrics (AI scores, candidate counts, averages) come from the backend and represent the **whole company**, not a page of data;
- concurrent operations (interview scheduling, resume extraction, idempotent writes) are correct under real PostgreSQL concurrency;
- tenant isolation is enforced everywhere and conflict/error responses never leak cross-tenant or internal metadata;
- a verified release pipeline (build → lint baseline → typecheck → e2e → browser proof) gates every change.

## 3. Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15/16 (App Router), React 19, TypeScript, Tailwind CSS v4, Zustand, recharts, iconsax |
| Backend | NestJS, TypeScript, Clean Architecture / DDD modules |
| Database | PostgreSQL 16 (Prisma ORM, ~50 models) |
| Cache / Queue | Redis 7, BullMQ (email, notifications, analytics, AI screening, resume processing, interview reminders) |
| Auth | JWT, role/permission guards, email verification, idempotency keys |
| API | REST under `/api/v1`, Swagger, GlobalExceptionFilter with structured error codes |
| Infra | Docker Compose (postgres, postgres-test, redis, redis-test, backend), local file storage |
| Verification | Vitest (frontend), Jest (backend unit + e2e), Playwright browser proofs, release-gate scripts |

## 4. Feature maturity

| Feature area | Status |
|--------------|--------|
| Core recruitment workflow (jobs, candidates, applications, pipeline, interviews) | Complete (backend + frontend connected) |
| Company management, notifications, reports, analytics, settings | Complete |
| AI screening (resume upload → extraction → scoring) | Complete (mock/openai provider adapters; mock is default) |
| Resume extraction pipeline | Complete (PDF/DOCX parsers, BullMQ dispatch reconciler with backoff) |
| AI interviews | Backend + persistence complete; provider is MOCK |
| Public candidate portal | Backend exists, frontend not built |
| Provider capacity modeling (interview slots) | Documented P1, not implemented |
| SMTP email delivery | SMTP sink unavailable locally (harmless; verification activates users via DB) |

## 5. Phases so far

| Phase | Work | State |
|-------|------|-------|
| 0. UI foundation | Replace UI with AI-RECRUITER repo, landing page, redesigned sidebar, dark mode, verified backend baseline | Done |
| 1. Core recruitment workflow | Jobs CRUD + lifecycle, candidates, applications, dynamic pipeline stages, interviews, bulk actions | Done |
| 2. Supporting modules | Settings, company, notifications, analytics KPIs, reports, email templates + queue workers | Done |
| 3. AI screening | Provider contracts, tenant-safe API, idempotency, resume upload + extraction pipeline, UI workflow + polling | Done |
| 4. AI interviews | Backend module, invitation workflow, persisted tenant sessions | Done |
| 5. Hardening | Redis-outage fail-fast, auth 503 mapping, idempotency recovery, extraction dispatch reconciler, HTTP security matrix, lint gates | Done |
| 6. P0 product-completion | Real screening scores, honest Assistant/bulk-action wording, slot-conflict validation (Serializable tx + sanitized 409), Jobs Active/History + Reopen, persisted AI Interviews, browser proof | Done, merged to `main` |
| 7. Release-candidate prep | Churn cleanup, dashboard score-summary aggregate, physical resume-file cleanup, concurrent-conflict E2E, proof re-run | Done in working tree, uncommitted |
| 8. Post-release deployment | Shared dev + frontend deployment PRs, production seed runner fix | Done, merged |

## 6. Current state (2026-08-15)

- **Branch:** `main` @ `023ef3d` (P0 work and deployment PRs merged).
- **Uncommitted release-candidate work** (from the release-prep session, awaiting Codex audit):
  - Backend: `GET /api/v1/candidates/score-summary` whole-company aggregate (`totalCandidates`, `scoredCandidates`, `averageScore`, `topCandidates`); dashboard + store consume it (unscored excluded, real score 0 preserved, tenant-scoped).
  - `verification/cleanup.mjs`: exact physical resume-file deletion (containment-validated, idempotent, path-reported) + `verification/cleanup-files.test.mjs` (13 checks).
  - `backend/test/interviews.e2e-spec.ts`: concurrent slot test asserts exactly one 201 + one 409 `INTERVIEW_SLOT_CONFLICT`, sanitized conflict body, exactly one committed interview row, and full afterAll cleanup of both tenants.
  - Formatting-churn reduction on `jobs/page.tsx`, `use-ai-screening.ts`, `product-proof.mjs` (semantic-only diffs) + race-proof reopen check.
  - `.gitignore`: narrow rules for generated verification logs.
- **Newer uncommitted work in progress** (separate session): files module download/delete endpoints + tests, settings page refactor + utils/tests, AI-screener / add-candidate-dialog tweaks, browser-proof updates.
- **Test maturity:**
  - Frontend: 298/298 Vitest (23 files); typecheck clean; `next build` passes.
  - Backend: focused suites 202/202 (candidates service 43, controller 41, exception filter, interviews, ai-interviews); lint baseline 127 fingerprints; release gate 3/3.
  - E2E (real PostgreSQL `talentai_test`): interviews 34/34 with clean exit and zero leftover data.
  - Browser product proof: 23/23, zero unexpected console/HTTP errors, cleanup removes DB rows + physical resume files; report retained under `verification/reports/`.
- **Known leftovers:** 5 orphaned physical resume files + ~138 empty company dirs under `backend/uploads` from pre-fix proof runs — deliberately untouched (their DB rows are gone; exact matching is impossible).

## 7. Next steps

1. Independent audit of the release-candidate batch, then commit (6 grouped commits proposed in the session report).
2. Finish/integrate the newer in-progress files/settings work.
3. Product gaps: public candidate-facing portal, real AI providers (non-MOCK), provider capacity for interview slots (P1), SMTP sink for email verification.
