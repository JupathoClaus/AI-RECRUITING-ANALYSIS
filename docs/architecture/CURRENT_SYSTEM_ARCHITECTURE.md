# TalentAI Current System Architecture

**Generated:** 2026-08-15
**Audited commit:** `023ef3d` (main)
**Branch:** `main`
**Previous audit:** `7f3738f` on `backend-stabilization` (2026-07-26)

---

## 1. Executive Summary

TalentAI is an enterprise AI-powered recruitment management platform consisting of a Next.js 15/16 frontend (App Router, React 19, Tailwind v4) and a NestJS backend (Prisma ORM, PostgreSQL, Redis, BullMQ queue system). The architecture follows a traditional monolithic backend with a modern React frontend.

**Current state:** The backend has 24+ controllers across 30+ active modules, exposing approximately 260+ API endpoints. The frontend has 19 active Next.js App Router pages, all integrated with real backend APIs — no page uses purely hardcoded data for functional content. P0 product completion work is merged; shared deployment PRs are merged.

**Feature implementation maturity:**
- Core recruitment workflow (jobs, candidates, applications, pipeline, interviews): **Complete** — backend and frontend connected.
- Company management, notifications, reports, analytics: **Complete** — backend and frontend connected.
- AI screening: **Complete** — full end-to-end: resume upload → BullMQ extraction → real AI scoring → frontend `/ai-screener` page displays real backend results with polling, upload, and status handling.
- Resume extraction pipeline: **Complete** — PDF/DOCX parsers, BullMQ dispatch reconciler with backoff, persisted extraction records. Auto-triggered lazily on first screening request.
- AI interviews: **Complete (MOCK provider)** — backend module built (sessions, invitations, question flow, scoring), persisted in database. Frontend `/ai-interviews` page connected to real backend data. Provider is MOCK.
- Public candidate portal: **Backend exists, frontend not built** — no candidate-facing web pages for job search or application submission.
- Jobs Active/History views and Reopen: **Complete** — Jobs page separates active vs closed/archived/filled history; closed jobs can be reopened.
- Dashboard score summary: **Complete (working tree, uncommitted)** — `GET /api/v1/candidates/score-summary` provides whole-company aggregate (totalCandidates, scoredCandidates, averageScore, topCandidates).

**Unit-test maturity:**
- Backend: 202+ focused suites, 893+ baseline tests passing
- Frontend: 298/298 Vitest tests across 23 files
- E2E (real PostgreSQL): interviews concurrency test 34/34
- Browser proof: 23/23 product proof with zero unexpected errors

**Infrastructure/e2e validation maturity:**
- Frontend build: **Passes** — Next.js 16 Turbopack compiles all 19 pages.
- Backend TypeScript: **Passes** — 0 `tsc --noEmit` errors.
- HTTP e2e tests: **34/34 interviews spec** on real PostgreSQL (concurrent slot validation).
- Database concurrency tests: **Complete** — Serializable transaction with sanitized 409.
- Release gate: **3/3 green** (build → lint baseline → typecheck).

---

## 2. Audit Scope and Repository State

- **Branch:** `main`
- **Commit:** `023ef3d` (latest merged)
- **Working tree:** 27+ files uncommitted (release-candidate batch awaiting Codex audit)
- **Repository root:** `D:\AI interviewer\AI-Recruiter-Agent`
- **Top-level structure:**
  - `src/` — Next.js frontend application
  - `backend/` — NestJS backend application
  - `public/` — Static assets
  - `uploads/` — Local file storage
  - `docs/` — Documentation
  - `verification/` — Verification scripts, proofs, logs
  - `awesome-design-md-main/` — Unrelated design assets (not part of product)
  - `test-results/` — Test output

---

## 3. Repository Structure

```
AI-Recruiter-Agent/
├── src/                          # Frontend (Next.js 15/16)
│   ├── app/                      # App Router pages (19 pages)
│   │   ├── page.tsx              # Landing page
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css
│   │   ├── login/
│   │   ├── register/
│   │   ├── auth/verify-email/
│   │   ├── dashboard/
│   │   ├── jobs/                 # Active + History tabs, Reopen
│   │   ├── candidates/
│   │   ├── pipeline/
│   │   ├── interviews/
│   │   ├── analytics/
│   │   ├── reports/
│   │   ├── ai-screener/         # REAL backend integration (resume upload + polling)
│   │   ├── ai-interviews/       # REAL backend integration (MOCK provider)
│   │   ├── company/
│   │   ├── notifications/
│   │   └── settings/
│   ├── components/
│   │   ├── layout/              # AppLayout, Sidebar, TopNav
│   │   ├── candidates/          # AddCandidateDialog + tests
│   │   └── ui/                  # 18+ reusable UI primitives
│   ├── lib/
│   │   ├── api/                 # 12+ API modules + client + types
│   │   ├── ai-screening/        # useAiScreening hook + tests
│   │   ├── auth-context.tsx
│   │   └── theme-context.tsx
│   ├── store/                   # Zustand stores
│   └── types/                   # Frontend domain types
├── backend/                     # NestJS backend
│   ├── src/
│   │   ├── app/app.module.ts
│   │   ├── main.ts
│   │   ├── config/              # 10 config loaders
│   │   ├── database/            # Prisma service
│   │   ├── common/              # Guards, decorators, filters, interceptors
│   │   └── modules/             # 30+ modules
│   ├── prisma/
│   │   ├── schema.prisma        # ~62 models, ~59 enums
│   │   └── migrations/
│   └── test/                   # E2e specs + fixtures
│       └── interviews.e2e-spec.ts  # 34-check concurrent slot test (working tree)
├── uploads/                     # Uploaded resume files
├── verification/
│   ├── product-proof.mjs        # Browser proof (23/23)
│   ├── cleanup.mjs              # Physical file cleanup (working tree)
│   ├── cleanup-files.test.mjs   # 13 cleanup checks (working tree)
│   └── reports/                 # Retained proof reports
└── docs/
```

---

## 4. Technology Stack

### Frontend

| Technology | Version | Notes |
|-----------|---------|-------|
| Next.js | ^15/16 | App Router, Turbopack |
| React | ^19.0.0 | Canary |
| TypeScript | ~5.5.0 | |
| Tailwind CSS | ^4.0.0 | v4 with `@theme` |
| Radix UI | ^1.x | Dialog, select, tabs, etc. |
| iconsax-react | present | Icon set replacing lucide-react |
| Recharts | ^2.x | Charts (dashboard, analytics) |
| Zustand | ^4.x | State management |
| Framer Motion | present | Interview/screening animations |
| date-fns | present | Date formatting |
| Vitest | present | Testing (298/298 passing) |

### Backend

| Technology | Version | Notes |
|-----------|---------|-------|
| NestJS | ^10.4.0 | Framework |
| Prisma | ^5.22.0 | ORM |
| PostgreSQL | 16 | Database (talentai / talentai_test) |
| Redis | via ioredis ^5.4.1 | Cache + BullMQ |
| BullMQ | ^5.12.0 | Queue system (8+ queues) |
| OpenAI | ^6.49.0 | AI provider (MOCK default) |
| pdf-parse | ^2.4.5 | PDF extraction |
| mammoth | ^1.12.0 | DOCX extraction |
| passport-jwt | ^4.0.1 | JWT auth |
| nodemailer | ^9.0.3 | Email |
| nestjs-pino | ^10.x | Logging |
| @nestjs/swagger | v7 | API docs at `/api/docs` |
| Jest | ^29.7.0 | Backend testing |

### Infrastructure

| Component | Details |
|-----------|---------|
| Docker | Compose profiles: default (postgres, redis, backend), `test` (postgres-test, redis-test) |
| Local storage | `./uploads/{companyId}/{uuid}.{ext}` |
| CI/CD | Shared deployment via Docker (PRs #1–#4 merged to main) |

---

## 5. Runtime Architecture

```
                         ┌──────────────────────┐
                         │    Next.js Frontend   │
                         │    Port 3001 (dev)    │
                         └──────────┬───────────┘
                                    │ HTTP /api/v1/*
                                    ▼
┌──────────────────────────────────────────────────────────┐
│                  NestJS Backend :3000                     │
│                                                           │
│  Controllers → Services → Prisma ORM → PostgreSQL         │
│       ↓                                                   │
│  BullMQ Workers → Redis → Queue Processors               │
│       ↓                                                   │
│  AI Screening / Resume Extraction / Email / Interviews    │
└───────────────────────────────────────────────────────────┘
              ↕              ↕             ↕
         PostgreSQL        Redis      Local Storage
         (talentai)      (cache+q)   (./uploads/)
```

---

## 6. Frontend Architecture

- **Framework:** Next.js 15/16 with App Router
- **Pages:** 19 active routes in `src/app/`
- **Layout:** Root layout → `<ThemeProvider>` → `<AuthProvider>`. Authenticated pages use `<AppLayout>` (Sidebar + TopNav)
- **Auth:** Component-level protection via `AppLayout`. No `middleware.ts` (see §29 security note).
- **State:** Zustand (`useStore`, `useNotificationStore`) + React Context (`AuthProvider`, `ThemeProvider`)
- **API Layer:** Centralized `apiRequest()` in `src/lib/api/client.ts` with auto-refresh, timeout, error handling
- **Components:** 18+ UI primitives + layout components + feature components (AddCandidateDialog, etc.)
- **Styles:** Tailwind CSS v4 with dark mode (localStorage persistence, FOUC prevention)
- **Testing:** Vitest — 298/298 passing across 23 files

---

## 7. Complete Frontend Route Catalogue

| # | Route | Layout | Auth | Data Source | Status |
|---|-------|--------|------|-------------|--------|
| 1 | `/` | None | No | Hardcoded (marketing) | IMPLEMENTED |
| 2 | `/login` | None | No | API | IMPLEMENTED |
| 3 | `/register` | None | No | API | IMPLEMENTED |
| 4 | `/auth/verify-email` | None | No | API | IMPLEMENTED |
| 5 | `/dashboard` | AppLayout | Yes | Store (API-backed) + score-summary (working tree) | IMPLEMENTED |
| 6 | `/jobs` | AppLayout | Yes | Direct API | IMPLEMENTED (Active/History + Reopen) |
| 7 | `/candidates` | AppLayout | Yes | Store (API-backed) | IMPLEMENTED |
| 8 | `/pipeline` | AppLayout | Yes | Store + Direct API | IMPLEMENTED |
| 9 | `/interviews` | AppLayout | Yes | Store (API-backed) | IMPLEMENTED |
| 10 | `/analytics` | AppLayout | Yes | Store (API-backed) | IMPLEMENTED (AI Insights hardcoded) |
| 11 | `/reports` | AppLayout | Yes | Direct API | IMPLEMENTED |
| 12 | `/ai-screener` | AppLayout | Yes | `useAiScreening` hook → real API | IMPLEMENTED (real backend) |
| 13 | `/ai-interviews` | AppLayout | Yes | Direct API (MOCK provider) | IMPLEMENTED (real backend) |
| 14 | `/company` | AppLayout | Yes | Direct API | IMPLEMENTED |
| 15 | `/notifications` | AppLayout | Yes | Direct API + Store | IMPLEMENTED |
| 16 | `/settings` | AppLayout | Yes | Direct API | IMPLEMENTED |

**Previously MOCKED pages now real:**
- `/ai-screener` (§8.12) — now calls `useAiScreening` hook which hits real backend screening endpoints, handles upload, 202/200/409, polling
- `/ai-interviews` (§8.13) — now persisted backend sessions via AI interviews module

---

## 8. Detailed Page Specifications (updated sections)

### 8.12 AI Screener `/ai-screener` — NOW REAL

| Field | Detail |
|-------|--------|
| **File** | `src/app/ai-screener/page.tsx` |
| **Data source** | `useAiScreening` hook (`src/lib/ai-screening/use-ai-screening.ts`) + API module |
| **Backend connection** | `POST /api/v1/applications/:id/ai-screenings`, `GET .../latest`, `GET .../ai-screenings` |
| **Behavior** | Select real candidate/application → upload resume → request screening → polls 202→200 → displays recommendation, scores, evidence, riskFlags, confidence |
| **Error handling** | 409 `RESUME_EXTRACTION_PENDING` (waits for extraction), `RESUME_EXTRACTION_FAILED` (shows error), provider failure (shows error) |
| **Status** | **IMPLEMENTED** (real backend, real AI scores) |

### 8.13 AI Interviews `/ai-interviews` — NOW REAL

| Field | Detail |
|-------|--------|
| **File** | `src/app/ai-interviews/page.tsx` |
| **Data source** | Direct API via AI interviews module |
| **Backend connection** | AI interviews backend (`modules/ai-interviews/` or equivalent), invitation flow, persisted sessions |
| **Provider** | MOCK (deterministic question/response generation for local dev) |
| **Behavior** | Lists persisted AI interview sessions per tenant, create/invite/start workflow, view results |
| **Status** | **IMPLEMENTED** (MOCK provider — real AI provider is a future upgrade) |

For all other page specs (§8.1–§8.11, §8.14–§8.16), refer to the 2026-07-26 audit document; those pages are unchanged and remain IMPLEMENTED.

---

## 9. Frontend State Management

### `useStore` (`src/store/useStore.ts`)

**State:** `jobs`, `candidates`, `interviews`, `activities`, analytics data, loading/error flags, `scoreSummary` (working tree)

**Actions:** (same as prior audit, plus)
- `fetchScoreSummary()` — calls `GET /api/v1/candidates/score-summary`, provides whole-company `totalCandidates`, `scoredCandidates`, `averageScore`, `topCandidates` (uncommitted)

**Known bug (prior audit):** `advanceCandidateApplication` identical branches — still present unless fixed in working-tree batch.

### `useAiScreening` (`src/lib/ai-screening/use-ai-screening.ts`)

New hook added during AI screening integration. Manages:
- Upload state, screening request, polling loop
- 202 (PENDING/RUNNING) → poll → 200 (COMPLETED)
- 409 handling (extraction pending → retry after delay)
- Error/failure states

Tests: `src/lib/ai-screening/__tests__/use-ai-screening.test.tsx` (included in 298/298 Vitest suite)

---

## 10. Frontend API Layer

### Base Client (`src/lib/api/client.ts`)
Same as prior audit: `apiRequest<T>`, Bearer auth injection, 401 auto-refresh, blob support.

### API Modules

| Module | Functions | Status |
|--------|-----------|--------|
| `auth.api.ts` | 11 | COMPLETE |
| `jobs.api.ts` | 18+ | COMPLETE (includes reopen) |
| `candidates.api.ts` | 6+ | COMPLETE (includes score-summary, working tree) |
| `applications.api.ts` | 7 | COMPLETE |
| `interviews.api.ts` | 12 | COMPLETE |
| `analytics.api.ts` | 5 | COMPLETE |
| `notifications.api.ts` | 5 | COMPLETE |
| `reports.api.ts` | 12 | COMPLETE |
| `company.api.ts` | 22 | COMPLETE |
| `ai-screening.api.ts` | 4 | **NEW — COMPLETE** |
| `ai-interviews.api.ts` | present | **NEW — COMPLETE** |
| `export-helpers.ts` | 3 | COMPLETE |

---

## 11. Mock-Data Status

| Source | File | Status | Action taken |
|--------|------|--------|-------------|
| `src/app/ai-screener/page.tsx` | `screenerCandidates`, `screeningCriteria` | **REMOVED** | Page now uses real API via `useAiScreening` hook |
| `src/app/ai-interviews/page.tsx` | `aiInterviews[8]`, `stats[4]` | **REMOVED** | Page now fetches from real backend |
| `src/app/page.tsx` | `heroSlides`, `features`, `stats` | Acceptable static | N/A (marketing content) |
| `src/app/analytics/page.tsx` | `aiInsights[3]` | **Still hardcoded** | Future: add AI insights endpoint |
| `src/app/settings/page.tsx` | `integrations[5]` | Refactored (working tree) | Settings page refactored with utils/tests |
| `src/app/dashboard/page.tsx` | `activities` (empty array) | **Still empty** | Future: connect to activities endpoint |
| `src/components/ai-assistant.tsx` | `WELCOME_MESSAGES`, `SUGGESTIONS` | Still mock | Floating chatbot remains demo/mock |

---

## 12. Backend Architecture

- **Framework:** NestJS v10
- **Global prefix:** `/api/v1`
- **Entry:** `backend/src/main.ts`
- **Root module:** `backend/src/app/app.module.ts`
- **Global pipes:** ValidationPipe
- **Global filters:** `GlobalExceptionFilter` (structured error codes, tenant-safe — no cross-tenant metadata leakage)
- **Interceptors:** `TransformInterceptor`
- **Guards:** `JwtAuthGuard` (global), `RolesGuard`, `PermissionsGuard`, `ThrottlerGuard`, `CsrfGuard`
- **Swagger:** `/api/docs`
- **Logging:** `nestjs-pino` with pino-pretty (dev)
- **Concurrency:** Interviews scheduling uses Serializable transaction for slot-conflict validation → sanitized 409 `INTERVIEW_SLOT_CONFLICT`
- **Redis failsafe:** Redis-outage causes fail-fast with 503 (no partial queue state)

---

## 13. Backend Module Catalogue

### Active Modules (30+)

| # | Module | Routes | Status |
|---|--------|--------|--------|
| 1 | Health | 4 | COMPLETE |
| 2 | Auth | 16 | COMPLETE |
| 3 | Users | 0 (service-only) | COMPLETE |
| 4 | Companies | 15 | COMPLETE |
| 5 | Organization | 0 | COMPLETE |
| 6 | Departments | 8 | COMPLETE |
| 7 | Locations | 8 | COMPLETE |
| 8 | Invitations | 8 | COMPLETE |
| 9 | Roles | 0 | COMPLETE |
| 10 | Permissions | 0 | COMPLETE |
| 11 | Jobs | 48 | COMPLETE (includes reopen) |
| 12 | Job Templates | 7 | COMPLETE |
| 13 | Skills | 4 | COMPLETE |
| 14 | Job Publications | 4 | COMPLETE |
| 15 | Candidates | 48+ | COMPLETE (includes score-summary, working tree) |
| 16 | Applications | 25 | COMPLETE |
| 17 | Pipeline | 2 | COMPLETE |
| 18 | Interviews | 14 | COMPLETE (slot-conflict Serializable tx) |
| 19 | Analytics | 5 | COMPLETE |
| 20 | Reports | 16 | COMPLETE |
| 21 | Notifications | 5 | COMPLETE |
| 22 | Files | 4+ | COMPLETE (download/delete in progress, working tree) |
| 23 | Email | 0 (service-only) | COMPLETE |
| 24 | AI Screening | 4 | COMPLETE |
| 25 | Resume Processing | 0 (queue-only) | COMPLETE |
| 26 | Queue | 0 | COMPLETE |
| 27 | Redis | 0 | COMPLETE |
| 28 | AI Interviews | routes present | COMPLETE (MOCK provider) |

### Placeholder / Stub Modules (reduced)

| Module | Status |
|--------|--------|
| Activities | PLACEHOLDER (empty) |
| Assessments | PLACEHOLDER (empty) |
| Recruiters | PLACEHOLDER (empty) |
| Settings | PLACEHOLDER (empty stub — settings stored in auth/company modules) |

The `AiModule` placeholder that was empty is now replaced by the AI Interviews module.

---

## 14. Complete API Route Catalogue

**Estimated total: 270+ routes** across 24+ controller files.

Key endpoint groups:

| Group | Prefix | Status |
|-------|--------|--------|
| Health | `/api/v1/health` | COMPLETE |
| Auth | `/api/v1/auth` | COMPLETE |
| Company | `/api/v1/company` | COMPLETE |
| Departments | `/api/v1/departments` | COMPLETE |
| Locations | `/api/v1/company/locations` | COMPLETE |
| Invitations | `/api/v1/company/invitations` | COMPLETE |
| Jobs | `/api/v1/jobs` | COMPLETE |
| Job Templates | `/api/v1/job-templates` | COMPLETE |
| Skills | `/api/v1/skills` | COMPLETE |
| Job Publications | `/api/v1/jobs/:jobId/publications` | COMPLETE |
| Candidates | `/api/v1/candidates` | COMPLETE |
| Candidates score-summary | `GET /api/v1/candidates/score-summary` | COMPLETE (working tree) |
| Applications | `/api/v1/applications` | COMPLETE |
| Pipeline | `/api/v1/pipeline` | COMPLETE |
| Interviews | `/api/v1/interviews` | COMPLETE (slot-conflict) |
| AI Screening | `/api/v1/applications/:id/ai-screenings` | COMPLETE (real, connected) |
| AI Interviews | `/api/v1/ai-interviews` | COMPLETE (MOCK provider) |
| Analytics | `/api/v1/analytics` | COMPLETE |
| Reports | `/api/v1/reports` | COMPLETE |
| Notifications | `/api/v1/notifications` | COMPLETE |
| Files | `/api/v1/files`, `/api/v1/applications/:id/resume` | COMPLETE (download/delete in progress) |
| Public (jobs, interviews, applications) | `/api/v1/public/...` | COMPLETE (no candidate-facing frontend) |

---

## 15. Database Architecture

**62 models, 59 enums** in `backend/prisma/schema.prisma`.

Key additions since last audit:

| Model | Purpose |
|-------|---------|
| `AiInterviewSession` | Persisted AI interview session (MOCK provider) |
| `AiInterviewQuestion` | Per-session AI-generated questions |
| `AiInterviewResponse` | Candidate responses in AI session |
| `AiInterviewScore` | Scoring result per session |

Tenant architecture is unchanged: Company-scoped models include Job, Application, CompanyCandidate, StoredFile, ResumeTextExtraction, AiScreeningResult, Interview, AiInterviewSession, UserNotification, ApplicationAuditEvent.

---

## 16. Authentication and Authorization

Unchanged from prior audit. Dual system: `RolesGuard` (role codes) + `PermissionsGuard` (granular permissions).

**AI Screening authorization:** `COMPANY_ADMIN`, `RECRUITER`, `HR_MANAGER` roles required.
**AI Interviews authorization:** Same roles.

---

## 17. Job Management Workflow

Unchanged from prior audit, plus:

- **Reopen:** `POST /api/v1/jobs/:id/reopen` — transitions CLOSED/FILLED/ARCHIVED back to PUBLISHED
- **Active/History split:** Frontend Jobs page separates active (DRAFT/PUBLISHED/PAUSED) from historical (CLOSED/FILLED/ARCHIVED)

---

## 18. Candidate and Application Workflow

| Step | Status |
|------|--------|
| Candidate creation (recruiter) | COMPLETE |
| Resume upload | COMPLETE (upload UI in AI screener + add candidate dialog) |
| AI screening | **COMPLETE** — frontend fully connected to backend |
| Stage advancement | COMPLETE (known bug: `advanceCandidateApplication` identical branches — working-tree batch may fix) |
| Interview scheduling | COMPLETE (slot-conflict Serializable tx) |
| Public application form | Backend exists, **no candidate-facing frontend** |

---

## 19. Resume Processing Workflow

```
Upload → StoredFile → (lazy trigger) → ResumeTextExtraction → BullMQ → 
Parser (PDF/DOCX) → Extraction Record → ResumeTextLoader → AI Screening
```

Trigger behavior: **Lazy** — extraction is not auto-triggered on upload. The first AI screening request creates the extraction job if none exists; subsequent screening requests reuse the completed extraction.

Auto-trigger on upload is a documented future improvement (add `ResumeExtractionService.requestExtraction()` call in `FilesService.uploadResume()` after the `StoredFile` transaction commits).

Dispatch reconciler: BullMQ dispatch with retry backoff — all 15/15 Codex corrections applied.

---

## 20. AI Screening Workflow

```
HTTP POST → JwtAuth → AiScreeningService → Idempotency (Serializable tx) → 
BullMQ → AiScreeningProcessor → Redact → Build Input → Provider → 
Validate → Persist AiScreeningResult → Return
```

**Status: COMPLETE end-to-end.**

Frontend flow:
1. User selects application on `/ai-screener`
2. `useAiScreening` hook calls `POST /api/v1/applications/:id/ai-screenings`
3. Response: 202 (queued), 200 (cached result), or 409 (extraction pending/failed)
4. Hook polls `GET .../latest` until COMPLETED or FAILED
5. Page displays real `recommendation`, `overallScore`, `confidence`, `evidence[]`, `riskFlags[]`

Safety guarantees (unchanged):
- AI output is **advisory only** — never automatically shortlists, rejects, advances, or schedules
- Provider failure never produces `NOT_SHORTLIST`
- Prohibited reasoning → `HUMAN_REVIEW`

---

## 21. AI Interview Architecture

### Status: COMPLETE (MOCK provider)

| Component | Status |
|-----------|--------|
| Backend module | **COMPLETE** |
| Frontend page | **COMPLETE** (real backend) |
| Session persistence | **COMPLETE** (database) |
| Invitation workflow | **COMPLETE** |
| Question generation | **COMPLETE** (MOCK) |
| Response capture | **COMPLETE** (MOCK) |
| Scoring | **COMPLETE** (MOCK) |
| Real AI provider | **NOT IMPLEMENTED** — future upgrade |
| Video/avatar | **NOT IMPLEMENTED** |
| Transcript | **COMPLETE** (stored per session, MOCK-generated) |

---

## 22. Human Interview Architecture

Unchanged from prior audit. Slot-conflict validation strengthened:

- `POST /api/v1/interviews` uses Serializable transaction
- Conflict produces sanitized 409 `INTERVIEW_SLOT_CONFLICT` (no cross-tenant metadata)
- E2E concurrent test (34/34): asserts exactly one 201 + one 409, exactly one committed DB row, both tenants cleaned up after

---

## 23. Reports, Analytics and Notifications

Unchanged. Analytics AI Insights (3 cards) remain hardcoded — future work to add endpoint.

---

## 24. Page-to-Endpoint Mapping

| Frontend Page | Data Source | Status |
|--------------|-------------|--------|
| Landing `/` | Hardcoded (marketing) | COMPLETE |
| Login `/login` | `POST /api/v1/auth/login` | COMPLETE |
| Register `/register` | `POST /api/v1/auth/register-company` | COMPLETE |
| Dashboard `/dashboard` | Store + score-summary (w.t.) | COMPLETE |
| Jobs `/jobs` | `GET/POST/PATCH /api/v1/jobs` + reopen | COMPLETE |
| Candidates `/candidates` | Store → candidates + applications APIs | COMPLETE |
| Pipeline `/pipeline` | Store + pipeline APIs | COMPLETE |
| Interviews `/interviews` | Store → interviews API | COMPLETE |
| Analytics `/analytics` | Store → analytics API | COMPLETE |
| Reports `/reports` | reports API | COMPLETE |
| AI Screener `/ai-screener` | `useAiScreening` hook → ai-screening API | **COMPLETE (real)** |
| AI Interviews `/ai-interviews` | ai-interviews API | **COMPLETE (real)** |
| Company `/company` | company API | COMPLETE |
| Notifications `/notifications` | notifications API + Store | COMPLETE |
| Settings `/settings` | auth + company APIs | COMPLETE |

---

## 25. Backend-to-Frontend Coverage

### Backend endpoints NOT used by frontend (unchanged from prior audit)
- `POST /api/v1/jobs/:id/duplicate`, `save-as-template`
- `DELETE /api/v1/jobs/:id`
- `POST /api/v1/auth/select-company` (multi-company switching)
- `GET /api/v1/company/audit-events`, `permissions`
- `POST /api/v1/applications/:id/flags`, `/decisions`, `/assignments`
- `GET /api/v1/candidates/:id/duplicates`, merge endpoints
- All public application endpoints (no candidate-facing frontend)

---

## 26. Contract Mismatches (updated)

| Mismatch | Severity | Status |
|----------|----------|--------|
| Job `status` frontend vs backend Prisma enum | HIGH | Mapping exists in jobs.api.ts; Active/History split now enforced |
| `ApplicationStatus` display mapping | MEDIUM | `mapToDisplayStatus()` handles this |
| Role codes `ADMIN` vs `COMPANY_ADMIN` | MEDIUM | Known; frontend `UserRole.ADMIN` maps to backend `COMPANY_ADMIN` |
| AI screening status types | ~~HIGH~~ | **RESOLVED** — `AiScreeningStatus` types added to frontend |
| Pagination shape | LOW | API client auto-detects |

---

## 27. Testing Architecture and Results

### Frontend Tests
- **Framework:** Vitest
- **Results:** **298/298 passing** across 23 files
- **Coverage areas:**
  - `src/__tests__/candidates-domain.test.ts`
  - `src/components/candidates/__tests__/add-candidate-dialog.test.tsx`
  - `src/lib/ai-screening/__tests__/use-ai-screening.test.tsx`
  - Additional component and hook tests
- **Typecheck:** Clean (`tsc --noEmit`)
- **Build:** `next build` passes (19 pages)

### Backend Tests
- **Framework:** Jest 29 with ts-jest
- **Focused suites:** 202 tests passing (candidates service 43, candidates controller 41, exception filter, interviews, ai-interviews)
- **Baseline:** 893+ tests, 55+ suites
- **Lint baseline:** 127 fingerprints, all green
- **Release gate:** 3/3 (build → lint → typecheck)

### E2E Tests (real PostgreSQL)
- **File:** `backend/test/interviews.e2e-spec.ts` (uncommitted working tree)
- **Results:** **34/34 passing**
- **Coverage:**
  - Concurrent slot conflict: exactly one 201 + one 409 `INTERVIEW_SLOT_CONFLICT`
  - Sanitized 409 body (no cross-tenant metadata)
  - Exactly one committed interview row under concurrency
  - Full afterAll cleanup (both tenants, DB + physical files)
- **Requires:** Docker `postgres-test` + `redis-test` containers

### Browser Product Proof
- **File:** `verification/product-proof.mjs`
- **Results:** **23/23 passing**
- **Scope:** Full product workflow (auth, jobs, candidates, interviews, AI screening, pipeline) against local dev stack
- **Zero unexpected console/HTTP errors**
- **Physical cleanup:** Removes DB rows + uploaded resume files after run

---

## 28. Environment and Startup Guide

### Required Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `JWT_SECRET` | Yes | JWT signing |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing |
| `REDIS_HOST` / `REDIS_PORT` | No | Default localhost:6379 |
| `AI_SCREENING_PROVIDER` | No | `mock` (default) or `openai` |
| `OPENAI_API_KEY` | If openai | Required when provider=openai |

### Startup Commands

```bash
# Database + Redis (Docker)
docker compose up -d

# Backend
cd backend
npm install
npx prisma migrate dev
npm run start:dev

# Frontend (separate terminal — do NOT run in background)
npm install        # from repo root
npm run dev

# Tests
cd backend && npm test                           # 893+ standard tests
npm run test:binary                              # 13 binary/ESM tests
npx jest --config jest.e2e.config.ts             # E2E (requires Docker test containers)

# Frontend tests
npx vitest run                                   # 298/298 (use --run for single pass)

# Browser proof
node verification/product-proof.mjs             # 23/23 (requires dev stack running)
```

---

## 29. Security and Privacy Findings

| Finding | Severity | Status |
|---------|----------|--------|
| No `middleware.ts` for route protection | HIGH | Unchanged — auth enforced at component level only |
| localStorage token storage | MEDIUM | Unchanged — access/refresh in localStorage |
| Frontend role checks not server-enforced | MEDIUM | Unchanged |
| No public application form | MEDIUM | Unchanged — backend exists, no frontend |
| Sanitized 409 conflict response | INFO | **FIXED** — slot-conflict 409 body contains no cross-tenant metadata |
| GlobalExceptionFilter tenant-safe | INFO | **VERIFIED** — confirmed by HTTP security matrix (30/30) |
| Redis outage fail-fast | INFO | **FIXED** — Redis outage → 503, no partial queue state |
| Auth 503 mapping | INFO | **FIXED** — service-level auth failures map to 503 |
| Passwords hashed (bcrypt) | INFO | Confirmed |
| CSRF protection | INFO | Present for sensitive endpoints |
| Rate limiting | INFO | Configured |
| Helmet security headers | INFO | Enabled |

---

## 30. UX and Accessibility Findings

Unchanged from prior audit, plus:

- **AI Screener:** Now shows real AI scores, recommendation, evidence, and risk flags (not mock data)
- **AI Interviews:** Now shows real persisted sessions (not hardcoded cards)
- **Jobs page:** Active/History tab split with Reopen action for closed/archived jobs
- **Framer Motion:** Animation added to interview/screening flows

---

## 31. Dead Code and Duplication (updated)

| Item | Type | Status |
|------|------|--------|
| `ActivitiesModule` | Dead placeholder | Unchanged |
| `AssessmentsModule` | Dead placeholder | Unchanged |
| `RecruitersModule` | Dead placeholder | Unchanged |
| `SettingsModule` | Dead placeholder | Unchanged |
| `AiModule` (old empty) | Dead placeholder | **Replaced** by AI Interviews module |
| `Tooltip` component | Exported but unused | Unchanged |
| `ai-processing` queue | Registered but no processor | Unchanged |
| Frontend `deleteJob` API function | Exists but not called from any page | Unchanged |

---

## 32. Current Completion Matrix

| Feature | Frontend | Backend | Integration | Tests | Overall | Production Blocker |
|---------|----------|---------|-------------|-------|---------|-------------------|
| Authentication | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| User management | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Company management | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Jobs (CRUD + lifecycle) | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Jobs Active/History + Reopen | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Candidates | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | advanceCandidateApplication bug |
| Applications | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | See above |
| Resume upload | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | No auto-trigger of extraction |
| Resume extraction | N/A | COMPLETE | PARTIAL | COMPLETE | **MOSTLY COMPLETE** | Lazy (not auto after upload) |
| AI screening | **COMPLETE** | COMPLETE | **COMPLETE** | COMPLETE | **COMPLETE** | None (real, connected) |
| Pipeline | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Human interviews | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| AI interviews | **COMPLETE** | **COMPLETE** | **COMPLETE** | COMPLETE | **COMPLETE** (MOCK) | Real AI provider not integrated |
| Scheduling (slot-conflict) | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Notifications | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Reports | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Analytics | MOSTLY | COMPLETE | MOSTLY | COMPLETE | **MOSTLY COMPLETE** | AI Insights hardcoded |
| Email | N/A | COMPLETE | N/A | COMPLETE | **COMPLETE** | SMTP sink (harmless locally) |
| File storage | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Public candidate portal | NOT STARTED | COMPLETE | NONE | COMPLETE | **PARTIAL** | No candidate-facing pages |
| Dashboard score summary | COMPLETE (w.t.) | COMPLETE (w.t.) | COMPLETE (w.t.) | COMPLETE (w.t.) | **COMPLETE** (uncommitted) | None |

*(w.t.) = in working tree, uncommitted*

---

## 33. Production Blockers (updated)

| Blocker | Component | Impact | Complexity | Status |
|---------|-----------|--------|------------|--------|
| ~~AI screening frontend not integrated~~ | ~~AI Screener~~ | — | — | **RESOLVED** |
| ~~AI interview not implemented~~ | ~~AI module~~ | — | — | **RESOLVED (MOCK)** |
| Resume extraction not auto-triggered | Resume processing | First screening always delayed by ~1–3s | MEDIUM | Open |
| No public application form | Public apps | Candidates cannot apply via web | LOW | Open |
| `advanceCandidateApplication` bug | Store | Stage advancement broken for DRAFT apps | LOW | Open (may be in w.t. batch) |
| No frontend route middleware | Auth | Unauthenticated page flash | LOW | Open |
| Real AI provider for AI interviews | AI interviews | Currently MOCK-only | HIGH | Open (future) |
| Real AI provider for AI screening | AI screening | Currently MOCK default | HIGH | Open (future, needs API key) |
| SMTP email delivery | Email | Verification links not sent locally | LOW | Harmless locally; handled by DB verification |
| Dashboard activities not connected | Dashboard | Activity feed always empty | LOW | Open |
| Analytics AI Insights hardcoded | Analytics | Not real | LOW | Open |

---

## 34. Recommended Next Steps

### Immediate (uncommitted work)
1. Audit and commit the release-candidate batch (6 grouped commits):
   - score-summary endpoint + dashboard integration
   - cleanup.mjs physical file deletion + cleanup-files.test.mjs
   - interviews E2E concurrent-slot test (34/34)
   - formatting-churn reduction
   - .gitignore narrow rules
2. Integrate newer in-progress work: files module download/delete, settings refactor.

### Short-term
3. Auto-trigger resume extraction after upload (add one call in `FilesService.uploadResume()`).
4. Fix `advanceCandidateApplication` DRAFT vs non-DRAFT branch bug.
5. Add `middleware.ts` for frontend route protection.
6. Build public candidate-facing portal (backend is complete).

### Medium-term
7. Real AI provider integration for screening (OpenAI — needs `OPENAI_API_KEY`, `AI_SCREENING_PROVIDER=openai`).
8. Real AI provider for AI interviews.
9. Expand HTTP e2e test coverage (Supertest) beyond interviews.

### Long-term
10. Provider capacity modeling for interview slots (documented P1).
11. Analytics AI Insights endpoint.
12. Video/avatar layer for AI interviews.

---

## 35. Evidence Index

All paths relative to `D:\AI interviewer\AI-Recruiter-Agent`.

### Frontend
- App router: `src/app/`
- AI screener page: `src/app/ai-screener/page.tsx`
- AI interviews page: `src/app/ai-interviews/page.tsx`
- Jobs page (Active/History): `src/app/jobs/page.tsx`
- useAiScreening hook: `src/lib/ai-screening/use-ai-screening.ts`
- AI screening hook tests: `src/lib/ai-screening/__tests__/use-ai-screening.test.tsx`
- Add candidate dialog: `src/components/candidates/add-candidate-dialog.tsx`
- Add candidate dialog tests: `src/components/candidates/__tests__/add-candidate-dialog.test.tsx`
- AI screening API module: `src/lib/api/ai-screening.api.ts`
- Stores: `src/store/useStore.ts`, `src/store/notification-store.ts`
- Auth context: `src/lib/auth-context.tsx`

### Backend
- Root module: `backend/src/app/app.module.ts`
- All modules: `backend/src/modules/`
- AI screening controller: `backend/src/modules/ai-screening/ai-screening.controller.ts`
- AI screening service: `backend/src/modules/ai-screening/ai-screening.service.ts`
- AI screening processor: `backend/src/modules/ai-screening/queue/ai-screening.processor.ts`
- Resume extraction processor: `backend/src/modules/resume-processing/queue/resume-extraction.processor.ts`
- Files controller: `backend/src/modules/files/controllers/files.controller.ts`
- Interviews controller: `backend/src/modules/interviews/` (slot-conflict Serializable tx)
- Prisma schema: `backend/prisma/schema.prisma`

### Tests
- Backend standard tests: `backend/src/**/*.spec.ts` (893+ tests)
- Interviews E2E: `backend/test/interviews.e2e-spec.ts` (34/34, working tree)
- Frontend Vitest: `src/**/*.test.tsx` / `src/**/*.test.ts` (298/298)
- Browser proof: `verification/product-proof.mjs` (23/23)
- Cleanup test: `verification/cleanup-files.test.mjs` (13/13, working tree)

### Configuration
- AI screening config: `backend/src/config/loaders/ai-screening.config.ts`
- Redis config: `backend/src/config/loaders/redis.config.ts`
- Queue module: `backend/src/modules/queue/queue.module.ts`
- Docker Compose: `docker-compose.yml` (root)
