# TalentAI Current System Architecture

**Generated:** 2026-07-26  
**Audited commit:** `7f3738f`  
**Branch:** `backend-stabilization`

---

## 1. Executive Summary

TalentAI is an enterprise AI-powered recruitment management platform consisting of a Next.js 15 frontend (App Router, React 19, Tailwind v4) and a NestJS backend (Prisma ORM, PostgreSQL, Redis, BullMQ queue system). The architecture follows a traditional monolithic backend with a modern React frontend.

**Current state:** The backend has 24 controllers exposing approximately 210–250 API endpoints across 32 modules (27 active, 5 empty placeholders). The frontend has 16 active Next.js App Router pages, many integrated with backend APIs through a centralized API client. However, several important integrations remain incomplete.

**Feature implementation maturity:**
- Core recruitment workflow (jobs, candidates, applications, pipeline, interviews): **Complete** — backend and frontend connected.
- Company management, notifications, reports, analytics: **Complete** — backend and frontend connected.
- AI screening: **Backend complete, frontend mocked** — all 4 API endpoints exist with full BullMQ orchestration, but the frontend `/ai-screener` page uses hardcoded mock data.
- Resume extraction pipeline: **Backend complete** — PDF and DOCX parsers, queue, processor, persisted extraction records, but extraction is not automatically triggered after upload (lazy on first screening request).
- AI interviews: **Not started** — no backend module, frontend page is a mock placeholder.
- Public candidate portal: **Backend exists, frontend not built** — no candidate-facing web pages for job search or application.
- Frontend testing: **Minimal** — 10 test files exist (Vitest), no component or e2e tests.

**Unit-test maturity:**
- Backend: 55 Jest suites, 893 passing tests
- Frontend: 10 Vitest suites, 124 passing tests

**Infrastructure/e2e validation maturity:**
- Frontend build: **Passes** — Next.js 16 Turbopack compiles all 19 pages including TypeScript.
- Backend TypeScript: **Passes** — 0 `tsc --noEmit` errors.
- HTTP e2e tests: **None** — Supertest is installed but no e2e test files exist.
- Database concurrency tests: **None** — require Docker test PostgreSQL.
- Redis-backed integration tests: **None** — require Docker test Redis.

**Production readiness assessment:** The backend is functionally complete for the core recruitment workflow and AI screening, but production readiness is limited by the absence of HTTP-level integration tests, database concurrency tests, and Redis-backed queue tests. The frontend is buildable but untested beyond the UI level.

---

## 2. Audit Scope and Repository State

- **Branch:** `backend-stabilization`
- **Commit:** `7f3738f`
- **Working tree:** Clean
- **Repository root:** `D:\AI interviewer\AI-Recruiter-Agent`
- **Top-level structure:**
  - `src/` — Next.js frontend application
  - `backend/` — NestJS backend application
  - `public/` — Static assets
  - `uploads/` — Local file storage
  - `docs/` — Documentation
  - `verification/` — Verification scripts
  - `awesome-design-md-main/` — Unrelated design assets
  - `test-results/` — Test output

---

## 3. Repository Structure

```
AI-Recruiter-Agent/
├── src/                          # Frontend (Next.js 15)
│   ├── app/                      # App Router pages
│   │   ├── page.tsx              # Landing page
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Global styles
│   │   ├── login/
│   │   ├── register/
│   │   ├── auth/verify-email/
│   │   ├── dashboard/
│   │   ├── jobs/
│   │   ├── candidates/
│   │   ├── pipeline/
│   │   ├── interviews/
│   │   ├── analytics/
│   │   ├── reports/
│   │   ├── ai-screener/         # FULLY MOCKED
│   │   ├── ai-interviews/       # FULLY MOCKED
│   │   ├── company/
│   │   ├── notifications/
│   │   ├── settings/
│   │   └── favicon.ico
│   ├── components/               # Shared components
│   │   ├── layout/               # AppLayout, Sidebar, TopNav
│   │   ├── ui/                   # 18 reusable UI primitives
│   │   └── ai-assistant.tsx      # Floating chatbot (mocked)
│   ├── lib/                      # API client, utils, contexts
│   │   ├── api/                  # 10 API modules + client + types
│   │   ├── auth-context.tsx
│   │   └── theme-context.tsx
│   ├── store/                    # Zustand stores (useStore, notification-store)
│   └── types/                    # Frontend domain types
├── backend/                      # NestJS backend
│   ├── src/
│   │   ├── app/app.module.ts     # Root module
│   │   ├── main.ts               # Entry point
│   │   ├── config/               # 10 config loaders
│   │   ├── database/             # Prisma service
│   │   ├── common/               # Guards, decorators, filters, interceptors
│   │   └── modules/              # 30 modules (20 active, 5 stubs)
│   ├── prisma/
│   │   ├── schema.prisma         # ~50 models
│   │   └── migrations/           # 10+ migrations
│   ├── test/                     # Test fixtures
│   └── package.json
├── uploads/                      # Uploaded resume files
└── docs/                         # Architecture documentation
```

---

## 4. Technology Stack

### Frontend

| Technology | Version (from package.json) | Notes |
|-----------|---------------------------|-------|
| Next.js | ^15.0.0 | App Router |
| React | ^19.0.0 (canary) | Latest |
| TypeScript | ~5.5.0 | |
| Tailwind CSS | ^4.0.0 | v4 with `@theme` |
| Radix UI | ^1.x (multiple) | Primitives (dialog, select, tabs, etc.) |
| Lucide React | (present) | Icons |
| Recharts | ^2.x | Charts (dashboard, analytics) |
| Swiper | ^11.x | Landing page carousel |
| Zustand | ^4.x | State management |
| class-variance-authority | (present) | Component variants |
| clsx / tailwind-merge | (present) | CSS utilities |
| date-fns | (present) | Date formatting |
| Vitest | (present) | Testing |

### Backend

| Technology | Version | Notes |
|-----------|---------|-------|
| NestJS | ^10.4.0 | Framework |
| Prisma | ^5.22.0 | ORM |
| PostgreSQL | - | Database |
| Redis | via ioredis ^5.4.1 | Cache + BullMQ |
| BullMQ | ^5.12.0 | Queue system (8 queues) |
| OpenAI | ^6.49.0 | AI provider |
| pdf-parse | ^2.4.5 | PDF text extraction |
| mammoth | ^1.12.0 | DOCX text extraction |
| passport-jwt | ^4.0.1 | JWT auth |
| Joi | ^18.2.3 | Config validation |
| nodemailer | ^9.0.3 | Email |
| pino (nestjs-pino) | ^10.x | Logging |
| Swagger | @nestjs/swagger v7 | API docs |
| class-validator / class-transformer | latest | DTO validation |
| helmet, compression, cookie-parser | latest | Security/middleware |
| Jest | ^29.7.0 | Testing |

### Infrastructure

| Component | Details |
|-----------|---------|
| Docker | Available (compose files present) |
| Compose profiles | `test` (postgres-test, redis-test) |
| Local storage | `./uploads/` directory |
| CI/CD | No active CI config found |

---

## 5. Runtime Architecture

```
                         ┌──────────────────────┐
                         │    Next.js Frontend   │
                         │    Port 3001 (dev)    │
                         └──────────┬───────────┘
                                    │ HTTP/HTTPS
                                    │ /api/v1/*
                                    ▼
┌──────────────────────────────────────────────────────────┐
│                  NestJS Backend :3000                     │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │ Controllers│ │ Services  │ │ Workers  │ │ Guards  │  │
│  └─────┬────┘  └─────┬────┘  └────┬─────┘ └────┬────┘  │
│        │              │            │             │       │
│  ┌─────┴──────────────┴────────────┴─────────────┴────┐ │
│  │                  Prisma ORM                         │ │
│  └────────────────────────┬───────────────────────────┘ │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         PostgreSQL      Redis       Local Storage
                                       ./uploads/
```

**Data flow hierarchy:**
1. Frontend Next.js calls `/api/v1/*` (proxied to NestJS backend)
2. NestJS controllers validate auth via JWT guards
3. Services execute business logic, query Prisma
4. Prisma reads/writes PostgreSQL
5. Background processing via BullMQ (Redis-backed) workers
6. Files stored in local filesystem `./uploads/`

---

## 6. Frontend Architecture

- **Framework:** Next.js 15 with App Router
- **Pages:** 16 active routes, all in `src/app/`
- **Layout:** Root layout wraps `<ThemeProvider>` > `<AuthProvider>`. Authenticated pages use `<AppLayout>` which provides `<Sidebar>` + `<TopNav>`
- **Auth:** Component-level protection via `AppLayout` — no `middleware.ts`
- **State:** Zustand stores (`useStore`, `useNotificationStore`) + React Context (`AuthProvider`, `ThemeProvider`)
- **API Layer:** Centralized `apiRequest()` client in `src/lib/api/client.ts` with auto-refresh, timeout, error handling
- **Components:** 18 reusable UI primitives + 3 layout components + 1 global AI assistant
- **Styles:** Tailwind CSS v4 with dark mode support
- **Testing:** Vitest (minimal)

---

## 7. Complete Frontend Route Catalogue

**16 route page.tsx files** found in `src/app/`. The Next.js build confirms 19 compiled pages (including `/_not-found` and two internal layout-related pages).

| # | Route | Page Title | Layout | Auth | Data Source | Status | Spec § |
|---|-------|-----------|--------|------|-------------|--------|--------|
| 1 | `/` | Landing | None | No (redirects if authed) | Hardcoded | **IMPLEMENTED** | 8.1 |
| 2 | `/login` | Sign in | None | No (redirects if authed) | API | **IMPLEMENTED** | 8.2 |
| 3 | `/register` | Create account | None | No (redirects if authed) | API | **IMPLEMENTED** | 8.3 |
| 4 | `/auth/verify-email` | Email Verification | None | No | API | **IMPLEMENTED** | 8.4 |
| 5 | `/dashboard` | Dashboard | AppLayout | Yes | Store (API-backed) | **IMPLEMENTED** | 8.5 |
| 6 | `/jobs` | Jobs | AppLayout | Yes | Direct API | **IMPLEMENTED** | 8.6 |
| 7 | `/candidates` | Candidates | AppLayout | Yes | Store (API-backed) | **IMPLEMENTED** | 8.7 |
| 8 | `/pipeline` | Pipeline | AppLayout | Yes | Store + Direct API | **IMPLEMENTED** | 8.8 |
| 9 | `/interviews` | Interviews | AppLayout | Yes | Store (API-backed) | **IMPLEMENTED** | 8.9 |
| 10 | `/analytics` | Analytics & Reporting | AppLayout | Yes | Store (API-backed) | **IMPLEMENTED** | 8.10 |
| 11 | `/reports` | Reports | AppLayout | Yes | Direct API | **IMPLEMENTED** | 8.11 |
| 12 | `/ai-screener` | AI Resume Screener | AppLayout | Yes | **100% MOCK** | **PLACEHOLDER** | 8.12 |
| 13 | `/ai-interviews` | AI Interviews | AppLayout | Yes | **100% MOCK** | **PLACEHOLDER** | 8.13 |
| 14 | `/company` | Company Profile | AppLayout | Yes | Direct API | **IMPLEMENTED** | 8.14 |
| 15 | `/notifications` | Notifications | AppLayout | Yes | Direct API + Store | **IMPLEMENTED** | 8.15 |
| 16 | `/settings` | Settings | AppLayout | Yes | Direct API | **IMPLEMENTED** | 8.16 |

**Route count verification:** 16 `page.tsx` files found in `src/app/`. All 16 are documented below. `/auth/verify-email` was previously counted but not given its own specification section — it now appears as §8.4.

---

## 8. Detailed Page-by-Page Specifications

### 8.1 Landing Page `/`

| Field | Detail |
|-------|--------|
| **File** | `src/app/page.tsx` |
| **Portal** | Public |
| **Permitted roles** | None (public) |
| **Navigation source** | Direct URL, `/login`, `/register` |
| **Purpose** | Marketing/sign-up landing page |
| **Current structure** | Hero with Swiper slideshow (5 slides), Features grid (6 cards), Stats row (4 stats: "10K+ hires", "500+ companies", "98% satisfaction", "24hr avg time-to-hire"), CTA to register, Footer |
| **Displayed info** | "Hire the best talent, powered by AI", feature descriptions, company stats |
| **User actions** | "Start Hiring Smarter" → `/register`, "Sign In to Dashboard" → `/login`, "Get Started" → `/register`, "Sign In" link |
| **Data source** | 100% hardcoded inline (`heroSlides`, `features`, `stats` arrays) |
| **Backend connection** | None |
| **Loading behavior** | None (static) |
| **Empty-state behavior** | N/A |
| **Error behavior** | None |
| **Status** | **IMPLEMENTED** |
| **Evidence** | `src/app/page.tsx` |

### 8.2 Login `/login`

| Field | Detail |
|-------|--------|
| **File** | `src/app/login/page.tsx` |
| **Portal** | Authentication |
| **Permitted roles** | None (public) |
| **Navigation source** | Landing page, sidebar |
| **Purpose** | User sign-in |
| **Current structure** | Email/password form, "Resend verification" link, "Create account" link, demo credentials display |
| **Displayed info** | Demo email/password |
| **User actions** | Submit credentials, resend verification email, navigate to register |
| **Data source** | `authApi.login()`, `authApi.resendVerification()` |
| **Backend connection** | `POST /api/v1/auth/login` |
| **Status** | **IMPLEMENTED** |

### 8.3 Register `/register`

| Field | Detail |
|-------|--------|
| **File** | `src/app/register/page.tsx` |
| **Portal** | Authentication |
| **Permitted roles** | None (public) |
| **Purpose** | New company registration |
| **Current structure** | Company name, first/last name, email, password, confirm password, terms checkbox |
| **User actions** | Submit registration, accept terms |
| **Data source** | `authApi.registerCompany()` |
| **Backend connection** | `POST /api/v1/auth/register-company` |
| **Status** | **IMPLEMENTED** |

### 8.4 Verify Email `/auth/verify-email`

| Field | Detail |
|-------|--------|
| **File** | `src/app/auth/verify-email/page.tsx` |
| **Portal** | Authentication |
| **Permitted roles** | None (public) |
| **Navigation source** | Email link only |
| **Purpose** | Email verification after registration |
| **Current structure** | Reads `?token=...&success=true&error=expired` query params. Shows spinner during verification, then success/expired/invalid state |
| **Displayed info** | "Email verified successfully", "Verification link expired", "Invalid verification link" |
| **User actions** | Resend verification email (expired state) |
| **Data source** | `authApi.verifyEmail(token)`, `authApi.resendVerification(email)` |
| **Backend connection** | `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification` |
| **Status** | **IMPLEMENTED** |
| **Evidence** | `src/app/auth/verify-email/page.tsx` |

### 8.5 Dashboard `/dashboard`

| Field | Detail |
|-------|--------|
| **File** | `src/app/dashboard/page.tsx` |
| **Portal** | HR/Recruiter |
| **Permitted roles** | Any authenticated user |
| **Navigation source** | Sidebar first item |
| **Purpose** | Main KPI overview and activity feed |
| **Current structure** | 4 KPI cards (Total Jobs, Active Candidates, Upcoming Interviews, Hired This Month), Pipeline Distribution bar chart, "Applications Over Time" placeholder, Recent Activity feed, Upcoming Interviews list, Top Candidates table |
| **Displayed info** | Counts, pipeline stage distribution, recent activities (type, description, time), upcoming interview cards, top rated candidates |
| **User actions** | "View All" links (broken for activities), interview click, candidate row actions |
| **Data source** | `useStore()` — `fetchCandidates()`, `fetchInterviews()` called on mount, `activities` initial empty |
| **Backend connection** | `GET /api/v1/jobs/summary`, `GET /api/v1/candidates`, `GET /api/v1/interviews`, `GET /api/v1/analytics/*` |
| **Status** | **IMPLEMENTED** (activities empty, "View All" links broken) |

### 8.6 Jobs `/jobs`

| Field | Detail |
|-------|--------|
| **File** | `src/app/jobs/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Job CRUD management |
| **Current structure** | Search bar, Status/Department/Type filters, Grid/Table view toggle, Job cards/rows, Create/Edit/Detail dialogs, Pagination |
| **Displayed info** | Job title, department, location, type, status, applicants count, created date, salary range |
| **User actions** | Create, Edit, Publish, Pause, Close, Resume, Archive, View Details, Grid/Table toggle |
| **Data source** | Direct API calls (not store) |
| **Backend connection** | `GET /api/v1/jobs`, `POST /api/v1/jobs`, `PATCH /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/publish`, etc. |
| **Status** | **IMPLEMENTED** — publish/pause/close/resume/archive all call real backend endpoints |
| **Evidence** | `src/app/jobs/page.tsx` handlers call `publishJob(jobId)`, `closeJob(jobId)`, `pauseJob(jobId)`, `resumeJob(jobId)`, `archiveJob(jobId)` from `jobs.api.ts`, which call `POST /api/v1/jobs/:id/publish` etc. Backend routes exist for all. |

### 8.7 Candidates `/candidates`

| Field | Detail |
|-------|--------|
| **File** | `src/app/candidates/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Candidate list and management |
| **Current structure** | Search bar, Status/Position/Rating filters, Table with checkboxes, Bulk actions bar, Add Candidate dialog, Candidate Details dialog |
| **Displayed info** | Name, email, phone, status, position, applied date, rating stars, skills |
| **User actions** | Add Candidate, Bulk move to Screening/Interview, Bulk Reject, View Profile, Edit, Schedule Interview, Reject, Advance stage |
| **Data source** | `useStore()` — `candidates`, `addCandidateApplication()`, `rejectCandidateApplication()`, `advanceCandidateApplication()` |
| **Backend connection** | `GET /api/v1/candidates`, `POST /api/v1/applications`, `POST /api/v1/applications/:id/reject`, `POST /api/v1/applications/:id/move` |
| **Status** | **IMPLEMENTED** (known bug: `advanceCandidateApplication` has identical branches) |

### 8.8 Pipeline `/pipeline`

| Field | Detail |
|-------|--------|
| **File** | `src/app/pipeline/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Kanban pipeline board |
| **Current structure** | Search bar, Job filter, "Add Stage" button, Kanban columns, Candidate cards, Detail dialog, Stage management |
| **Displayed info** | Candidate name, stage assignments, job matches per stage |
| **User actions** | Move candidates left/right, Add/Edit/Delete stages, View details, Reject, Advance |
| **Data source** | `useStore()` + Direct API for pipeline CRUD |
| **Backend connection** | `GET /api/v1/pipeline/jobs/:jobId`, `POST /api/v1/pipeline/jobs/:jobId/move`, `POST /api/v1/jobs/:jobId/pipeline/stages` |
| **Status** | **IMPLEMENTED** |

### 8.9 Interviews `/interviews`

| Field | Detail |
|-------|--------|
| **File** | `src/app/interviews/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Interview scheduling and management |
| **Current structure** | Stats row, Search + Type filter, Upcoming/Completed/All tabs, Interview cards, Schedule/Reschedule/Complete dialogs |
| **Displayed info** | Candidate name, job title, interview type, date/time, status, score |
| **User actions** | Schedule, View, Cancel, Reschedule, Mark Complete (Pass/Hold/Fail) |
| **Data source** | `useStore()` — `interviews`, `scheduleInterview()`, `cancelInterviewById()`, etc. |
| **Backend connection** | `GET /api/v1/interviews`, `POST /api/v1/interviews`, `POST /api/v1/interviews/:id/cancel`, `POST /api/v1/interviews/:id/result` |
| **Status** | **IMPLEMENTED** |

### 8.10 Analytics `/analytics`

| Field | Detail |
|-------|--------|
| **File** | `src/app/analytics/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Recruitment analytics dashboard |
| **Current structure** | Date range filter, 4 KPI cards, Applications by Dept (pie chart), Hiring Funnel (bar), Time to Hire Trend (line), Source Breakdown (bar), Dept Performance (table), AI Insights (3 hardcoded cards) |
| **Displayed info** | KPI metrics, charts, department data, source analysis |
| **User actions** | Date filter, view charts |
| **Data source** | `useStore()` — `fetchAnalytics()` |
| **Backend connection** | `GET /api/v1/analytics/*` |
| **Status** | **IMPLEMENTED** (AI Insights cards hardcoded) |

### 8.11 Reports `/reports`

| Field | Detail |
|-------|--------|
| **File** | `src/app/reports/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Downloadable recruitment reports |
| **Current structure** | 8 report type cards, report view with filters (date/job/dept/status), data table, pagination, export CSV button |
| **Displayed info** | Report-type specific tables |
| **User actions** | Select report type, Apply/Clear filters, Export CSV, Load More |
| **Data source** | `reports.api.*()` |
| **Backend connection** | `GET /api/v1/reports/*` |
| **Status** | **IMPLEMENTED** |

### 8.12 AI Screener `/ai-screener`

| Field | Detail |
|-------|--------|
| **File** | `src/app/ai-screener/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | AI resume screening (PLACEHOLDER) |
| **Current structure** | Upload area (disabled), Screening Criteria toggles (5 switches), "Start Screening" button, Results table, Evaluation cards |
| **Displayed info** | 6 hardcoded candidates with mock scores, criteria toggles |
| **User actions** | "Start Screening" (simulates progress), toggle criteria |
| **Data source** | **100% hardcoded** (`screenerCandidates`, `screeningCriteria` arrays) |
| **Backend connection** | **NONE** — no API module exists; no endpoints called |
| **Status** | **PLACEHOLDER / MOCKED** — no real upload, no real AI screening, no backend integration |
| **Missing work** | Create `src/lib/api/ai-screening.api.ts` with 4 endpoint functions. Rewrite page to select real application, request screening, display real results, handle extraction-pending/202/200 states. |

### 8.13 AI Interviews `/ai-interviews`

| Field | Detail |
|-------|--------|
| **File** | `src/app/ai-interviews/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | AI interview management (PLACEHOLDER) |
| **Current structure** | Stats row, Interview cards, "Create AI Interview" dialog (non-functional) |
| **Displayed info** | 8 hardcoded AI interviews with mock scores/transcripts |
| **User actions** | "Create AI Interview" (dialog only), Start/View Report (non-functional) |
| **Data source** | **100% hardcoded** |
| **Backend connection** | **NONE** |
| **Status** | **PLACEHOLDER / MOCKED** |
| **Missing work** | Full implementation — no backend for AI interviews exists (AiModule is empty) |

### 8.14 Company `/company`

| Field | Detail |
|-------|--------|
| **File** | `src/app/company/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | Company profile and team management |
| **Current structure** | Metrics row, Company info card, Team Members grid, Departments grid, Pending Invitations, Office Locations (placeholder) |
| **Displayed info** | Company name, slug, members, departments, pending invitations |
| **User actions** | Invite member, suspend/reactivate/remove member, create/archive department, resend/revoke invitation |
| **Data source** | `company.api.*()` |
| **Backend connection** | `GET /api/v1/company`, `GET /api/v1/company/members`, `GET /api/v1/departments`, `POST /api/v1/company/invitations`, etc. |
| **Status** | **IMPLEMENTED** (Office Locations is placeholder) |

### 8.15 Notifications `/notifications`

| Field | Detail |
|-------|--------|
| **File** | `src/app/notifications/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | View and manage in-app notifications |
| **Current structure** | All/Unread/System tabs, Grouped notification list, Delete dialog |
| **Displayed info** | Notification type, title, body, time, read status |
| **User actions** | Click to read, Mark all read, Delete, Load more |
| **Data source** | `notifications.api.*()` + `useNotificationStore` |
| **Backend connection** | `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read`, `DELETE /api/v1/notifications/:id` |
| **Status** | **IMPLEMENTED** |

### 8.16 Settings `/settings`

| Field | Detail |
|-------|--------|
| **File** | `src/app/settings/page.tsx` |
| **Portal** | HR/Recruiter |
| **Purpose** | User and company settings |
| **Current structure** | Profile/Company/Notifications/AI Settings/Integrations/Security tabs |
| **Displayed info** | Profile fields, company fields, notification toggles, integrations list, sessions table |
| **User actions** | Save profile, update company, toggle notifications, change password, revoke sessions |
| **Data source** | `auth.api.*()`, `company.api.*()` |
| **Backend connection** | `PATCH /api/v1/auth/profile`, `POST /api/v1/auth/change-password`, `GET /api/v1/company/settings`, etc. |
| **Status** | **IMPLEMENTED** (Profile photo, company logo, AI threshold, 2FA, API keys disabled) |

---

## 9. Frontend Component Architecture

### Layout Components
- **`AppLayout`** (`src/components/layout/app-layout.tsx`) — Auth-protected shell with sidebar + topnav
- **`Sidebar`** (`src/components/layout/sidebar.tsx`) — 4-section navigation, collapsible, notification badge
- **`TopNav`** (`src/components/layout/topnav.tsx`) — Page header, theme toggle, user dropdown

### UI Primitives (18 components)
All in `src/components/ui/`. Built on Radix UI primitives or native HTML, styled with Tailwind v4 + `class-variance-authority`. No component fetches its own data.

Components: `avatar`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `empty-state`, `input`, `modal-header`, `progress`, `select`, `separator`, `skeleton`, `switch`, `table`, `tabs`, `tooltip` (unused).

### Feature Components
- **`FloatingAIAssistant`** (`src/components/ai-assistant.tsx`) — Global chatbot with mock responses

### Report Components (page-specific)
- `async-combobox.tsx` — Async searchable dropdown
- `status-multi-select.tsx` — Multi-select status filter
- `export-feedback.tsx` — CSV export toast

---

## 10. Frontend State Management

### `useStore` (`src/store/useStore.ts`)

**State:** `jobs`, `candidates`, `interviews`, `activities`, analytics data, loading/error flags

**Actions:** `addJob`, `updateJobStatus`, `fetchJobs`, `fetchCandidates`, `addCandidateApplication`, `rejectCandidateApplication`, `advanceCandidateApplication`, `fetchInterviews`, `scheduleInterview`, `cancelInterviewById`, `rescheduleInterviewById`, `recordResultById`, `completeInterviewById`, `fetchAnalytics`

**API calls made:**
- `candidates.api.fetchCandidates/createCandidate`
- `applications.api.fetchApplications/createApplication/rejectApplication/shortlistApplication/moveApplication/submitApplication/markApplicationHired`
- `jobs.api.getJobs`
- `interviews.api.fetchInterviews/cancelInterview/completeInterview/createInterview`
- `analytics.api.getAnalyticsOverview/Funnel/Departments/Sources/TimeToHire`

**Known bug:** `advanceCandidateApplication` (lines 383-389) has identical branches — both DRAFT and non-DRAFT call `moveApplication` with `currentApp.stageId` instead of distinguishing DRAFT→submit vs non-DRAFT→move with `toStageId`.

### `useNotificationStore` (`src/store/notification-store.ts`)

**State:** `unreadCount`, `notifications`, `loading`, `error`

**Actions:** `fetchUnreadCount`, `decrementUnread`, `resetUnread`, `setUnreadCount`

**API calls:** `notifications.api.getUnreadCount()`

### `AuthProvider` (`src/lib/auth-context.tsx`)

**State:** `user`, `loading`

**Actions:** `login()`, `register()`, `logout()`, `refreshUser()`

**Token storage:** localStorage (`accessToken`, `refreshToken`)

### `ThemeProvider` (`src/lib/theme-context.tsx`)

**State:** `theme` (light/dark)

**Persistence:** localStorage `"ai-recruiter-theme"`

---

## 11. Frontend API Layer

### Base Client (`src/lib/api/client.ts`)

- **Function:** `apiRequest<T>(path, options)`
- **Base URL:** `/api/v1` (proxy via Next.js)
- **Auth injection:** Bearer token from `localStorage`
- **Auto-refresh:** On 401, attempts token refresh via `/auth/refresh`; retries original request
- **Error handling:** Returns `ApiErrorResponse` with `statusCode`, `errorCode`, `errors[]`
- **Pagination:** Auto-detects `PaginationMeta` in responses
- **Blob support:** For file downloads
- **Timeout:** Configurable

### API Modules (10 files in `src/lib/api/`)

| Module | Functions | Status |
|--------|-----------|--------|
| `auth.api.ts` | 11 functions | **COMPLETE** |
| `jobs.api.ts` | 18 functions | **COMPLETE** |
| `candidates.api.ts` | 6 functions (includes domain mappers) | **COMPLETE** |
| `applications.api.ts` | 7 functions | **COMPLETE** |
| `interviews.api.ts` | 12 functions | **COMPLETE** |
| `analytics.api.ts` | 5 functions | **COMPLETE** |
| `notifications.api.ts` | 5 functions | **COMPLETE** |
| `reports.api.ts` | 12 functions | **COMPLETE** |
| `company.api.ts` | 22 functions | **COMPLETE** |
| `export-helpers.ts` | 3 utility functions | **COMPLETE** |

### Missing API Modules
- **No AI screening API functions** — the `ai-screener` page uses inline mock data
- **No AI interview API functions** — the `ai-interviews` page uses inline mock data
- **No resume upload API function in API layer** — resume upload is done via `files.controller.ts` directly

---

## 12. Frontend Mock-Data Inventory

| Source | File | Data | Pages | Backend Exists? | Replacement |
|--------|------|------|-------|----------------|-------------|
| Inline | `src/app/ai-screener/page.tsx` | `screenerCandidates[6]`, `screeningCriteria[5]` | AI Screener | **NO frontend API functions** | Add AI screening API module + connect to backend |
| Inline | `src/app/ai-interviews/page.tsx` | `aiInterviews[8]`, `stats[4]` | AI Interviews | **NO backend exists** | Build AI interview backend first |
| Inline | `src/app/page.tsx` | `heroSlides[5]`, `features[6]`, `stats[4]` | Landing | Acceptable static | N/A (marketing content) |
| Inline | `src/app/analytics/page.tsx` | `aiInsights[3]` | Analytics | **PARTIAL** | Add AI insights endpoint or CMS |
| Inline | `src/app/settings/page.tsx` | `integrations[5]` | Settings | **NO** | Add integrations backend |
| Inline | `src/app/dashboard/page.tsx` | `activities` (empty) | Dashboard | **YES** | Connect to activity endpoint |
| Inline | `src/components/ai-assistant.tsx` | `WELCOME_MESSAGES`, `SUGGESTIONS`, keyword responses | All | **NO** | Add AI assistant backend |

**Mock-removal priority:**
1. **HIGHEST** — AI Screener: connect to real `POST /api/v1/applications/:id/ai-screenings` + show real results
2. **HIGH** — AI Assistant: add backend chat endpoint or remove (or connect to existing)
3. **MEDIUM** — Dashboard activities: connect to activity endpoint
4. **LOW** — Settings integrations, landing page content

---

## 13. Backend Architecture

- **Framework:** NestJS v10
- **Global prefix:** `/api/v1`
- **Entry:** `backend/src/main.ts`
- **Root module:** `backend/src/app/app.module.ts`
- **Global pipes:** ValidationPipe
- **Global filters:** `GlobalExceptionFilter`
- **Interceptors:** `TransformInterceptor`
- **Guards:** `JwtAuthGuard` (global), `RolesGuard`, `PermissionsGuard`, `ThrottlerGuard`, `CsrfGuard`
- **Swagger:** `/api/docs`
- **Logging:** `nestjs-pino` with pino-pretty (dev)
- **CORS:** Configured via ConfigService
- **Helmet:** Enabled
- **Rate limiting:** `@nestjs/throttler`

---

## 14. Backend Module Catalogue

### Active Modules (20)

| # | Module | Path | Controllers | Services | Routes | Status |
|---|--------|------|-------------|----------|--------|--------|
| 1 | Health | `modules/health/` | 1 | 1 | 4 | COMPLETE |
| 2 | Auth | `modules/auth/` | 1 | 7 | 16 | COMPLETE |
| 3 | Users | `modules/users/` | 0 | 1 | 0 | COMPLETE |
| 4 | Companies | `modules/companies/` | 1 | 1 | 15 | COMPLETE |
| 5 | Organization | `modules/organization/` | 0 | 2 | 0 | COMPLETE |
| 6 | Departments | `modules/departments/` | 1 | 1 | 8 | COMPLETE |
| 7 | Locations | `modules/locations/` | 1 | 1 | 8 | COMPLETE |
| 8 | Invitations | `modules/invitations/` | 1 | 1 | 8 | COMPLETE |
| 9 | Roles | `modules/roles/` | 0 | 1 | 0 | COMPLETE |
| 10 | Permissions | `modules/permissions/` | 0 | 1 | 0 | COMPLETE |
| 11 | Jobs | `modules/jobs/` | 2 | 4 | 48 | COMPLETE |
| 12 | Job Templates | `modules/job-templates/` | 1 | 1 | 7 | COMPLETE |
| 13 | Skills | `modules/skills/` | 1 | 1 | 4 | COMPLETE |
| 14 | Job Publications | `modules/job-publications/` | 1 | 1 | 4 | COMPLETE |
| 15 | Candidates | `modules/candidates/` | 1 | 4 | 48 | COMPLETE |
| 16 | Applications | `modules/applications/` | 3 | 10 | 25 | COMPLETE |
| 17 | Pipeline | `modules/pipeline/` | 1 | 0 | 2 | COMPLETE |
| 18 | Interviews | `modules/interviews/` | 3 | 4 | 14 | COMPLETE |
| 19 | Analytics | `modules/analytics/` | 1 | 1 | 5 | COMPLETE |
| 20 | Reports | `modules/reports/` | 1 | 2 | 16 | COMPLETE |
| 21 | Notifications | `modules/notifications/` | 1 | 2 | 5 | COMPLETE |
| 22 | Files | `modules/files/` | 1 | 1 | 4 | COMPLETE |
| 23 | Email | `modules/email/` | 0 | 1 | 0 | COMPLETE |
| 24 | AI Screening | `modules/ai-screening/` | 1 | 1 | 4 | COMPLETE |
| 25 | Resume Processing | `modules/resume-processing/` | 0 | 3 | 0 | **PARTIAL** (no controllers) |
| 26 | Queue | `modules/queue/` | 0 | 1 | 0 | COMPLETE |
| 27 | Redis | `modules/redis/` | 0 | 1 | 0 | COMPLETE |

### Placeholder Modules (5)

| Module | Path | Status |
|--------|------|--------|
| Activities | `modules/activities/` | PLACEHOLDER (empty) |
| Assessments | `modules/assessments/` | PLACEHOLDER (empty) |
| Recruiters | `modules/recruiters/` | PLACEHOLDER (empty) |
| Settings | `modules/settings/` | PLACEHOLDER (empty) |
| AI | `modules/ai/` | PLACEHOLDER (empty) — intended for future AI interview features |

**Module count:** 32 directories in `backend/src/modules/`. 27 are active (have controllers, services, queue processors, or service exports consumed by other modules). 5 are empty placeholders.

---

## 15. Complete API Route Catalogue

**Total: 254 HTTP-method decorators** across 24 controller files (approximately 210–250 unique routes depending on HTTP-HEAD/OPTIONS overloads). Verified by counting `@Get(`, `@Post(`, `@Put(`, `@Patch(`, `@Delete(` decorator occurrences in all controller files.

### Key endpoint groups:

| Group | Count | Prefix |
|-------|-------|--------|
| Health | 4 | `/api/v1/health` |
| Auth | 16 | `/api/v1/auth` |
| Company | 15 | `/api/v1/company` |
| Departments | 8 | `/api/v1/departments` |
| Locations | 8 | `/api/v1/company/locations` |
| Invitations | 8 | `/api/v1/company/invitations` |
| Jobs (internal) | 48 | `/api/v1/jobs` |
| Jobs (public) | 2 | `/api/v1/public/companies/...` |
| Job Templates | 7 | `/api/v1/job-templates` |
| Skills | 4 | `/api/v1/skills` |
| Job Publications | 4 | `/api/v1/jobs/:jobId/publications` |
| Candidates | 48 | `/api/v1/candidates` |
| Applications | 25 | `/api/v1/applications` |
| Pipeline | 2 | `/api/v1/pipeline` |
| Interviews | 14 | `/api/v1/interviews` |
| AI Screening | 4 | `/api/v1/applications/:id/ai-screenings` |
| Analytics | 5 | `/api/v1/analytics` |
| Reports | 16 | `/api/v1/reports` |
| Notifications | 5 | `/api/v1/notifications` |
| Files | 4 | `/api/v1/files` / `/api/v1/applications/:id/resume` |
| Interview Confirm | 4 | `/api/v1/public/interview-confirmation` |
| Public Applications | 2 | `/api/v1/public/...` |

---

## 16. Database Architecture

**62 models** in `backend/prisma/schema.prisma` verified by counting `^model ` declarations. Plus **59 enums**.

### Key Models

| Model | Purpose | Tenant-scoped | Key Relations |
|-------|---------|---------------|---------------|
| `User` | User accounts | No (global) | memberships, sessions |
| `Company` | Tenant/company | Self | memberships, jobs, candidates |
| `CompanyMembership` | User↔Company membership | Company | user, company, role |
| `Role` | Role definition | Company or Platform | permissions |
| `Permission` | Permission definition | Global | roles |
| `Session` | User session | No | user |
| `Job` | Job posting | Company | company, skills, applications, pipeline |
| `JobPipeline` | Pipeline config | Job | stages |
| `JobPipelineStage` | Pipeline stage | Pipeline | applications (currentStage) |
| `Candidate` | Candidate profile | No (global) but linked via CompanyCandidate | companyCandidates, applications |
| `CompanyCandidate` | Candidate within company | Company | candidate, applications, tags |
| `Application` | Job application | Company | job, candidate, currentStage |
| `StoredFile` | Uploaded file | Company | application, textExtractions |
| `ResumeTextExtraction` | Parsed resume text | Company | storedFile |
| `AiScreeningResult` | AI screening outcome | Company | application |
| `Interview` | Interview scheduling | Company | application, participants |
| `UserNotification` | In-app notification | Company/User | user |
| `ApplicationAuditEvent` | Application audit log | Company | application |

### Tenant Architecture
- **Company-scoped models:** Job, Application, CompanyCandidate, StoredFile, ResumeTextExtraction, AiScreeningResult, Interview, UserNotification, ApplicationAuditEvent
- **User-scoped models:** User, Session
- **Global models:** Permission, Skill (global or company)

---

## 17. Authentication and Authorization

### Flow

1. **Register:** `POST /api/v1/auth/register-company` → Creates User + Company + Membership (admin role)
2. **Login:** `POST /api/v1/auth/login` → Returns access token + refresh token (cookie + body)
3. **Session:** JWT access token + opaque refresh token with family tracking
4. **Verify email:** Token-based verification flow
5. **Multi-company:** Users can switch active company via `POST /api/v1/auth/select-company`
6. **Logout:** Token revocation, family rotation for refresh

### Token Storage (Frontend)
- `accessToken` in `localStorage`
- `refreshToken` in `localStorage` (also set as cookie by backend for `/auth/refresh`)

### Authorization

**Two systems co-exist:**

1. **Role-based (`RolesGuard`):** Checks `user.role` against allowed values. Uses `@Roles()` decorator. Role codes: `COMPANY_ADMIN`, `HR_MANAGER`, `RECRUITER`, `HIRING_MANAGER`, `INTERVIEWER`, `VIEWER`.

2. **Permission-based (`PermissionsGuard`):** Checks `user.permissions` array. Uses `@RequirePermissions()` decorator. Granular permissions like `jobs.read`, `candidates.create`, `applications.move`.

### Authorization Matrix

| Feature | Candidate | Recruiter | HR Manager | Company Admin |
|---------|-----------|-----------|------------|---------------|
| View jobs | Public only | Backend+Frontend | Backend+Frontend | Backend+Frontend |
| Manage jobs | No | Backend+Frontend | Backend+Frontend | Backend+Frontend |
| View candidates | No | Backend+Frontend | Backend+Frontend | Backend+Frontend |
| AI screening | No | Backend+Frontend* | Backend+Frontend* | Backend+Frontend* |
| Manage interviews | No | Backend+Frontend | Backend+Frontend | Backend+Frontend |
| Company settings | No | Some | Some | Backend+Frontend |
| Notifications | No | Backend+Frontend | Backend+Frontend | Backend+Frontend |

*AI screening backend is enforced; frontend AI screener page is mocked.

---

## 18. Job Management Workflow

### Complete Flow
1. **Create Draft** → `POST /api/v1/jobs` (status: DRAFT)
2. **Edit** → `PATCH /api/v1/jobs/:id` (optimistic versioning)
3. **Add Requirements** → `PUT /api/v1/jobs/:id/requirements`
4. **Configure Screening** → `PATCH /api/v1/jobs/:id/screening`
5. **Add Questions** → `POST /api/v1/jobs/:id/screening/questions`
6. **Setup Pipeline** → `PUT /api/v1/jobs/:id/pipeline`
7. **Add Collaborators** → `POST /api/v1/jobs/:id/collaborators`
8. **Submit for Approval** → `POST /api/v1/jobs/:id/submit-for-approval` (PENDING_APPROVAL)
9. **Approve/Reject** → `POST /api/v1/jobs/:id/approve` | `reject` (APPROVED/REJECTED)
10. **Publish** → `POST /api/v1/jobs/:id/publish` (PUBLISHED)
11. **Schedule Publication** → `POST /api/v1/jobs/:id/schedule-publication`
12. **Pause/Resume** → `POST /api/v1/jobs/:id/pause` | `resume`
13. **Close** → `POST /api/v1/jobs/:id/close` (CLOSED)
14. **Mark Filled** → `POST /api/v1/jobs/:id/mark-filled` (FILLED)
15. **Archive/Restore** → `POST /api/v1/jobs/:id/archive` | `restore`

**Frontend pages:** Jobs (full CRUD), Public jobs (public listing)
**Backend:** Jobs module (48 routes) + JobPublications module (4 routes)
**Database models:** Job, JobPipeline, JobPipelineStage, JobSkill, JobScreeningQuestion, JobScreeningConfiguration, JobCollaborator, JobApproval, JobPublication, JobActivityEvent

**Status:** **COMPLETE**

---

## 19. Candidate and Application Workflow

### Steps

| Step | Frontend | Backend | Status |
|------|----------|---------|--------|
| 1. Candidate creation (by recruiter) | Candidates page | `POST /api/v1/candidates` | COMPLETE |
| 2. Job discovery | Jobs page + Public jobs | `GET /api/v1/public/companies/:slug/jobs` | COMPLETE |
| 3. Application (public) | Not in frontend | `POST /api/v1/public/.../applications` | COMPLETE (backend only) |
| 4. Application (recruiter) | Candidates page | `POST /api/v1/applications` | COMPLETE |
| 5. Resume upload | Files controller | `POST /api/v1/applications/:id/resume` | COMPLETE |
| 6. Application submit | Candidates page | `POST /api/v1/applications/:id/submit` | COMPLETE |
| 7. Recruiter review | Pipeline, Candidates | `GET /api/v1/applications` | COMPLETE |
| 8. AI screening | **MOCKED PAGE** | `POST /api/v1/applications/:id/ai-screenings` | **NOT INTEGRATED** |
| 9. Human review | Pipeline, Candidates | N/A (manual) | COMPLETE |
| 10. Stage advancement | Pipeline, Candidates | `POST /api/v1/applications/:id/move` | COMPLETE |
| 11. Interview scheduling | Interviews | `POST /api/v1/interviews` | COMPLETE |
| 12. Outcome | Candidates, Pipeline | `POST /api/v1/applications/:id/reject` | COMPLETE |

### Candidate Portal
- **Public application:** `POST /api/v1/public/companies/:slug/jobs/:slug/applications` (backend exists, no frontend public page)
- **Status check:** `GET /api/v1/public/applications/:reference/status`
- Candidates currently **cannot see**: AI scores, AI recommendations, recruiter notes, risk flags, screening evidence

---

## 20. Resume Processing Workflow

```
Upload → StoredFile → ResumeTextExtraction → ExtractionProcessor → Parser → Extraction Record → Loader → AI Screening
```

### Implementation Status

| Step | Backend | Frontend | Status |
|------|---------|----------|--------|
| Resume upload | `POST /api/v1/applications/:id/resume` | Via file controller | **COMPLETE** |
| StoredFile (DB) | `StoredFile` model | Not displayed | **COMPLETE** |
| Local storage | `./uploads/{companyId}/{uuid}.{ext}` | N/A | **COMPLETE** |
| Checksum | SHA-256 during upload | N/A | **COMPLETE** |
| ResumeTextExtraction | Model + persistence | N/A | **COMPLETE** |
| Extraction queue | `resume-processing` queue | N/A | **COMPLETE** |
| ResumeExtractionProcessor | Worker | N/A | **COMPLETE** |
| PDF parser | `pdf-parse@2.4.5` | N/A | **COMPLETE** |
| DOCX parser | `mammoth@1.12.0` | N/A | **COMPLETE** |
| Extraction recorded | DB persistence | N/A | **COMPLETE** |
| ResumeTextLoaderService | Loads for AI screening | N/A | **COMPLETE** |
| Auto-trigger after upload | **NOT IMPLEMENTED** | N/A | **MISSING** |
| Frontend resume display | In candidate details | N/A | **NOT VERIFIED** |

**Extraction trigger behavior:** Extraction is **not automatically triggered after resume upload**. The upload endpoint only stores the raw file. Extraction is created **lazily** when AI screening is first requested (via `AiScreeningService` → `ResumeExtractionService`).

**First screening request behavior:**
1. No extraction exists → extraction is created (PENDING) → queued → 409 returned to client (`RESUME_EXTRACTION_PENDING`)
2. Extraction is PENDING or PROCESSING → 409 returned
3. Extraction COMPLETED → screening proceeds
4. Extraction FAILED → 409 returned (`RESUME_EXTRACTION_FAILED`)
5. Client retries after extraction completes → same extraction reused → screening proceeds

**Architecture decision: Lazy vs. Immediate extraction**

| Approach | Pros | Cons |
|----------|------|------|
| **Lazy** (current) | No wasted extractions for candidates never screened; simpler upload endpoint | First screening request delayed by extraction time (~1-3s for PDF) |
| **Immediate** | First screening request returns immediately | All uploaded resumes processed — CPU/storage cost even if never screened |

**Current verdict:** Lazy extraction is a valid product decision. It avoids processing resumes that HR never screens. If a future requirement mandates immediate availability, extraction can be triggered in `FilesService.uploadResume()` by adding `ResumeExtractionService.requestExtraction()` after the `StoredFile` transaction commits.

---

## 21. AI Screening Workflow

```
HTTP POST → JwtAuth + RolesGuard → AiScreeningService → Idempotency (Serializable tx) → BullMQ → AiScreeningProcessor → Redact → Build Input → Provider → Validate → Persist → Return
```

### Implementation Status

| Component | Backend | Frontend | Status |
|-----------|---------|----------|--------|
| Controller (4 routes) | `ai-screening.controller.ts` | N/A | **COMPLETE** |
| Service | `AiScreeningService` | N/A | **COMPLETE** |
| Provider interface | `AiScreeningProvider` | N/A | **COMPLETE** |
| OpenAI provider | `OpenAiScreeningProvider` | N/A | **COMPLETE** |
| Mock provider | `MockScreeningProvider` | N/A | **COMPLETE** |
| Queue | `ai-screening` queue | N/A | **COMPLETE** |
| Processor | `AiScreeningProcessor` | N/A | **COMPLETE** |
| Resume redaction | `redactResumeText()` | N/A | **COMPLETE** |
| Screening input builder | `ScreeningInputBuilderService` | N/A | **COMPLETE** |
| Fingerprint | SHA-256 deterministic | N/A | **COMPLETE** |
| Idempotency | Serializable tx + P2034 retry | N/A | **COMPLETE** |
| Prompt | `resume-screening.prompt.ts` | N/A | **COMPLETE** |
| Output schema | JSON schema + validation | N/A | **COMPLETE** |
| Prohibited reasoning | Guard | N/A | **COMPLETE** |
| HTTP 202/200/409 | Controller | N/A | **COMPLETE** |
| AI Screener page | N/A | `src/app/ai-screener/` | **MOCKED** |
| API module | N/A | Not created | **MISSING** |

**Safety confirmations:**
- AI output is **advisory only** — never automatically shortlists, rejects, advances, schedules, emails, or notifies
- Results are stored as `AiScreeningResult` with `recommendation`, `overallScore`, `confidence`, `evidence`, `uncertainties`, `riskFlags`
- Provider failure never becomes `NOT_SHORTLIST`
- Prohibited reasoning produces `HUMAN_REVIEW`
- Application status and pipeline stage remain unchanged

---

## 22. Interview Architecture

### Human Interviews
| Component | Status |
|-----------|--------|
| Scheduling | **COMPLETE** (backend + frontend) |
| Rescheduling | **COMPLETE** |
| Cancellation | **COMPLETE** |
| Confirmation | **COMPLETE** (+ public confirm/decline via token) |
| Result recording | **COMPLETE** (Pass/Hold/Fail) |
| Notifications | **COMPLETE** (interview-reminder + interview-notification queues) |
| Video call | **NOT IMPLEMENTED** |

### AI Interviews
| Component | Status |
|-----------|--------|
| Backend module | **PLACEHOLDER** (`modules/ai/` is empty) |
| Frontend page | **MOCKED** (`/ai-interviews`) |
| Question generation | **NOT IMPLEMENTED** |
| Avatar | **NOT IMPLEMENTED** |
| Transcript | **NOT IMPLEMENTED** |
| Scoring | **NOT IMPLEMENTED** |

---

## 23. Reports, Analytics and Notifications

### Analytics Backend (`/api/v1/analytics/*`)
- 5 endpoints: overview, funnel, departments, sources, time-to-hire
- Uses Prisma aggregation queries
- Frontend analytics page uses all 5 via `useStore`

### Reports Backend (`/api/v1/reports/*`)
- 8 report types: candidate evaluation, interview summary, pipeline, time-to-hire, source effectiveness, job summary, activity
- Each has CSV export endpoint
- Frontend reports page uses all 8 with filters and export

### Notifications
- Backend: Full in-app notification system (`/api/v1/notifications/`)
- Worker: None for notification generation (notifications created inline in services)
- Queue: `notifications` queue exists but no registered processor
- Frontend: Notification page + sidebar badge

**Notification types** (from Prisma enum): `APPLICATION_SUBMITTED`, `APPLICATION_STAGE_CHANGED`, `INTERVIEW_SCHEDULED`, `INTERVIEW_RESCHEDULED`, `INTERVIEW_CANCELLED`, `INTERVIEW_COMPLETED`, `INVITATION_SENT`, `INVITATION_ACCEPTED`, `CANDIDATE_HIRED`, `CANDIDATE_REJECTED`, `NOTE_ADDED`, `AI_SCREENING_COMPLETED`, `SYSTEM`

---

## 24. Page-to-Endpoint Mapping

| Frontend Page | Route | Data Source | API Endpoint | Backend Module | Status |
|--------------|-------|-------------|-------------|----------------|--------|
| Landing | `/` | Hardcoded | None | None | **COMPLETE** |
| Login | `/login` | API | `POST /api/v1/auth/login` | Auth | **COMPLETE** |
| Register | `/register` | API | `POST /api/v1/auth/register-company` | Auth | **COMPLETE** |
| Dashboard | `/dashboard` | Store | `GET /api/v1/jobs/summary`, `GET /api/v1/candidates`, `GET /api/v1/interviews`, `GET /api/v1/analytics/*` | Multiple | **COMPLETE** |
| Jobs | `/jobs` | API | `GET /api/v1/jobs`, `POST /api/v1/jobs`, `PATCH /api/v1/jobs/:id`, etc. | Jobs | **COMPLETE** |
| Candidates | `/candidates` | Store | `GET /api/v1/candidates`, `POST /api/v1/applications`, etc. | Candidates + Applications | **COMPLETE** |
| Pipeline | `/pipeline` | Store + API | `GET /api/v1/pipeline/jobs/:jobId`, pipeline stage endpoints | Pipeline + Jobs | **COMPLETE** |
| Interviews | `/interviews` | Store | `GET /api/v1/interviews`, `POST /api/v1/interviews`, etc. | Interviews | **COMPLETE** |
| Analytics | `/analytics` | Store | `GET /api/v1/analytics/*` | Analytics | **COMPLETE** |
| Reports | `/reports` | API | `GET /api/v1/reports/*` | Reports | **COMPLETE** |
| AI Screener | `/ai-screener` | **MOCK** | None | AI Screening | **MOCKED** |
| AI Interviews | `/ai-interviews` | **MOCK** | None | None | **MOCKED** |
| Company | `/company` | API | `GET /api/v1/company`, `GET /api/v1/company/members`, etc. | Companies | **COMPLETE** |
| Notifications | `/notifications` | API | `GET /api/v1/notifications` | Notifications | **COMPLETE** |
| Settings | `/settings` | API | `PATCH /api/v1/auth/profile`, `GET /api/v1/company/settings`, etc. | Auth + Companies | **COMPLETE** |

---

## 25. Backend-to-Frontend Coverage

### Backend endpoints NOT used by frontend
- `POST /api/v1/jobs/:id/duplicate`, `POST /api/v1/jobs/:id/save-as-template` — Jobs page could use these
- `DELETE /api/v1/jobs/:id` — Job deletion not exposed in UI
- `POST /api/v1/auth/select-company` — Multi-company switching not in frontend
- `GET /api/v1/company/audit-events` — Not shown
- `GET /api/v1/company/permissions` — Not shown
- `POST /api/v1/applications/:id/flags`, `/resolve` — Flags management not in frontend
- `POST /api/v1/applications/:id/decisions`, `/override` — Decisions not shown
- `POST /api/v1/applications/:id/assignments` — Assignments not shown
- `GET /api/v1/candidates/:id/duplicates`, merge endpoints — Duplicate detection not in frontend
- `POST /api/v1/public/companies/:slug/jobs/:slug/applications` — Public application page not built
- All 4 AI screening endpoints — Not integrated into frontend

### Frontend pages with missing backend
- AI Interviews (`/ai-interviews`) — Full AI interview backend missing
- AI Screener (`/ai-screener`) — Backend exists but frontend not connected

---

## 26. Contract Mismatches

| Mismatch | Frontend | Backend | Severity | Location |
|----------|----------|---------|----------|----------|
| Job `status` | `"Active"`, `"Paused"`, `"Closed"`, `"Draft"` | Prisma enum `JobStatus`: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SCHEDULED`, `PUBLISHED`, `PAUSED`, `CLOSED`, `FILLED`, `CANCELLED`, `ARCHIVED` | **HIGH** | Mapping needed |
| `ApplicationStatus` | Frontend `DisplayApplicationStatus`: `"Applied"`, `"Screening"`, etc. | Prisma `ApplicationStatus`: 14 values | **MEDIUM** | `mapToDisplayStatus()` handles this |
| Role codes | Frontend `UserRole`: `ADMIN`, `RECRUITER`, `HIRING_MANAGER` | Backend role codes: `COMPANY_ADMIN`, `RECRUITER`, `HR_MANAGER`, `HIRING_MANAGER` | **MEDIUM** | `ADMIN` vs `COMPANY_ADMIN` mismatch |
| Pagination shape | Frontend expects `PaginationMeta` type | Backend returns various pagination shapes | **LOW** | API client auto-detects |
| Auth tokens | `localStorage` | Cookie + body | **LOW** | Both work |
| AI screening status | Not in frontend types | `AiScreeningStatus`: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED` | **HIGH** | Frontend needs these types |

---

## 27. Testing Architecture and Results

### Frontend Tests
- **Framework:** Vitest (minimal)
- **Coverage:** Low – only 1 test file found (`src/__tests__/candidates-domain.test.ts`)
- **No component tests, no e2e tests**

### Backend Tests
- **Framework:** Jest 29 with ts-jest
- **Pattern:** `*.spec.ts` (standard), `*.test.ts` (binary/ESM tests requiring `--experimental-vm-modules`)
- **Total suites:** 55 (standard) + 2 (binary)
- **Total tests:** 893 (standard) + 13 (binary) = **906 passing**
- **Duration:** ~212s (standard) + ~28s (binary)
- **Coverage:** All active modules have tests
- **Docker requirements:** Database tests require `postgres-test` and `redis-test` containers

### Test Results (2026-07-26)
```
Standard: 55 suites, 893 tests, all pass, 212s, exit 0
Binary: 2 suites, 13 tests, all pass, 28s, exit 0
```

### Major Untested Areas
- No HTTP e2e tests (Supertest available but no e2e test files)
- No database integration tests (require Docker)
- No concurrency tests (require Docker)
- Frontend largely untested

---

## 28. Environment and Startup Guide

### Required Environment Variables

| Variable | App | Required | Purpose | .env.example |
|----------|-----|----------|---------|--------------|
| `DATABASE_URL` | Backend | Yes | PostgreSQL connection | Yes |
| `JWT_SECRET` | Backend | Yes | JWT signing | Yes |
| `JWT_REFRESH_SECRET` | Backend | Yes | Refresh token signing | Yes |
| `REDIS_HOST` | Backend | No | Redis host (default localhost) | Yes |
| `REDIS_PORT` | Backend | No | Redis port (default 6379) | Yes |
| `AI_SCREENING_PROVIDER` | Backend | No | mock/openai (default mock) | Yes |
| `OPENAI_API_KEY` | Backend | Conditional | Required when provider=openai | Yes |
| `NEXT_PUBLIC_API_URL` | Frontend | No | API base URL | No (uses proxy) |

### Startup Commands

```bash
# Database + Redis (Docker)
docker compose up -d

# Backend
cd backend
npm install
npx prisma migrate dev
npm run start:dev

# Frontend (separate terminal)
cd src  # root
npm install
npm run dev

# Workers (separate terminal)
cd backend
node dist/workers/email.worker.js  # etc.

# Tests
cd backend
npm test                          # Standard tests (893)
npm run test:binary               # Binary/ESM tests (13)
```

---

## 29. Security and Privacy Findings

| Finding | Severity | Evidence |
|---------|----------|----------|
| No middleware.ts for route protection | **HIGH** | Auth enforced only at component level in `AppLayout` — unprotected server components could leak data |
| localStorage token storage | **MEDIUM** | Access and refresh tokens in `localStorage` — vulnerable to XSS |
| Frontend role checks not enforced | **MEDIUM** | UI hides elements based on role but no server-side middleware enforces frontend routes |
| No public application form | **MEDIUM** | Public job listing exists but public application form (`POST /api/v1/public/.../applications`) has no frontend |
| Audit events exist but not visible | **LOW** | Backend records audit events but frontend doesn't display them |
| AI screening has no frontend | **LOW** | Backend is production-ready but completely disconnected from frontend |
| Test infrastructure not used | **LOW** | Docker test profiles exist but concurrency tests not run |
| Passwords hashed (bcrypt) | **INFO** | Confirmed via `PasswordService` |
| CSRF protection | **INFO** | Present for sensitive endpoints |
| Rate limiting | **INFO** | Configured |
| Helmet security headers | **INFO** | Enabled |

---

## 30. UX and Accessibility Findings

- **No middleware** — unauthenticated users can potentially access protected pages before JS renders
- **Loading states:** Skeleton components used on Jobs, Candidates, Analytics, Company, Notifications, Reports
- **Empty states:** `EmptyState` component used on Jobs, Candidates, Pipeline, Interviews
- **Error states:** Limited — most pages show inline error messages from API calls
- **Responsive:** Sidebar is collapsible with mobile drawer overlay
- **Accessibility:** Radix UI primitives provide some ARIA support but no dedicated accessibility audit
- **Dark mode:** Full implementation with localStorage persistence and FOUC prevention
- **Terminology:** Consistent across pages (Job, Candidate, Application, Pipeline, Interview)
- **AI Screener page:** Reveals mock AI scores to HR users — real implementation should display actual backend results

---

## 31. Dead Code and Duplication

| Item | Type | Path |
|------|------|------|
| `ActivitiesModule` | Dead (empty placeholder) | `backend/src/modules/activities/` |
| `AssessmentsModule` | Dead (empty placeholder) | `backend/src/modules/assessments/` |
| `RecruitersModule` | Dead (empty placeholder) | `backend/src/modules/recruiters/` |
| `SettingsModule` | Dead (empty placeholder) | `backend/src/modules/settings/` |
| `AiModule` | Dead (empty placeholder) | `backend/src/modules/ai/` |
| `Tooltip` component | Exported but unused | `src/components/ui/tooltip.tsx` |
| `ai-processing` queue | Registered but no processor | `backend/src/modules/queue/` |
| Frontend `deleteJob` API function | Exists but not called from any page | `src/lib/api/jobs.api.ts` |
| Backend `DELETE /api/v1/jobs/:id` | Exists but not called from frontend | Jobs controller |

---

## 32. Current Completion Matrix

| Feature | Frontend | Backend | Database | Integration | Tests | Overall | Production Blocker |
|---------|----------|---------|----------|-------------|-------|---------|-------------------|
| Authentication | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| User management | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Company management | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Roles & permissions | PARTIAL | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **MOSTLY COMPLETE** | Frontend doesn't show/assign permissions |
| Jobs (CRUD) | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Job publication | MOSTLY COMPLETE | COMPLETE | COMPLETE | MOSTLY COMPLETE | COMPLETE | **MOSTLY COMPLETE** | External job-board posting adapters not integrated |
| Public jobs (candidate-facing) | NOT STARTED | COMPLETE | COMPLETE | NONE | COMPLETE | **PARTIAL** | No candidate-facing pages exist — only backend API |
| Candidates | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Applications | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | Known bug in advanceCandidate |
| Resume upload | **NOT IMPLEMENTED** | COMPLETE | COMPLETE | NONE | COMPLETE | **PARTIAL** | No frontend upload form/API module — backend endpoint exists; no auto-extraction trigger |
| Resume extraction | N/A | COMPLETE | COMPLETE | PARTIAL | COMPLETE | **MOSTLY COMPLETE** | Not triggered after upload |
| AI screening | **MOCKED** | COMPLETE | COMPLETE | **NONE** | COMPLETE | **PARTIAL** | Frontend not integrated |
| Pipeline | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Human interviews | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| AI interviews | **MOCKED** | **NOT STARTED** | **NOT STARTED** | **NONE** | **NONE** | **NOT STARTED** | Full implementation needed |
| Scheduling | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Notifications | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Reports | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |
| Analytics | MOSTLY COMPLETE | COMPLETE | COMPLETE | MOSTLY COMPLETE | COMPLETE | **MOSTLY COMPLETE** | AI Insights hardcoded |
| Email | N/A | COMPLETE | COMPLETE | N/A | COMPLETE | **COMPLETE** | None |
| File storage | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** | None |

---

## 33. Production Blockers

| Blocker | Component | Impact | Complexity |
|---------|-----------|--------|------------|
| 1. AI screening frontend not integrated | AI Screener page | Recruiters cannot use AI screening | **LOW** — backend complete, just connect frontend |
| 2. Resume extraction not auto-triggered | Resume processing | First screening always delayed | **MEDIUM** — add queue job after upload |
| 3. AI interview not implemented | AI module | Cannot conduct AI interviews | **HIGH** — full backend + frontend needed |
| 4. No public application form | Public apps | Candidates cannot apply via web | **LOW** — backend exists, build form |
| 5. `advanceCandidateApplication` bug | Store | Stage advancement broken for DRAFT apps | **LOW** — fix two lines |
| 6. No frontend route middleware | Auth | Unauthenticated page flash | **LOW** — add middleware.ts |
| 7. No database concurrency tests | Testing | Race conditions unproven | **MEDIUM** — requires Docker |

---

## 34. Recommended Implementation Roadmap

### Phase 1: Connect AI Screening (Priority: Critical)

**Objective:** Replace the mock AI Screener page with real backend integration.

**Frontend work:**
- Create `src/lib/api/ai-screening.api.ts` with functions for all 4 AI screening endpoints
- Rewrite `src/app/ai-screener/page.tsx` to fetch real screening results
- Add AI screening status types to frontend types
- Show real screening results (recommendation, scores, evidence)

**Backend work:** None needed (already complete)

**Tests:** Update existing AI screening tests, add frontend API tests

**Dependencies:** None

**Acceptance:** A recruiter can upload a resume, request AI screening, and see real results.

**Backend note:** No planned backend feature work is currently identified, but integration may reveal backend defects because application-level HTTP, PostgreSQL and Redis integration tests remain incomplete. The AI screening controller returns 202 (CREATED), 200 (REUSED), and 409 (extraction-pending/failed). Frontend must handle:
- `POST /api/v1/applications/:applicationId/ai-screenings` — request screening (returns 202 or 200 or 409)
- `GET /api/v1/applications/:applicationId/ai-screenings` — list attempts (paginated)
- `GET /api/v1/applications/:applicationId/ai-screenings/latest` — latest result
- `GET /api/v1/ai-screenings/:screeningId` — specific result
- Status values: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
- 409 response codes: `RESUME_EXTRACTION_PENDING`, `RESUME_EXTRACTION_FAILED`
- Authorization: `COMPANY_ADMIN`, `RECRUITER`, `HR_MANAGER` roles required

### Phase 2: Auto-Trigger Resume Extraction (Priority: High)

**Objective:** Trigger resume extraction immediately after upload.

**Backend work:**
- Modify `FilesService.uploadResume()` to create extraction record + queue job
- Add error handling for extraction failures after upload

**Tests:** Update file upload tests

**Dependencies:** Phase 1 for full pipeline

**Acceptance:** Resume extraction starts automatically after upload, completing before screening is requested.

### Phase 3: Candidate Portal (Priority: High)

**Objective:** Build public candidate-facing pages.

**Frontend work:**
- Create public career page listing published jobs
- Create public application form with resume upload
- Create application status page

**Backend work:** None needed (endpoints exist)

**Tests:** Add frontend component tests, add e2e tests

**Dependencies:** None

**Acceptance:** A candidate can browse jobs, submit an application, and check status.

### Phase 4: Fix Test Infrastructure (Priority: Medium)

**Objective:** Enable database-level and HTTP-level integration tests.

**Infrastructure:**
- Start Docker test containers for PostgreSQL + Redis
- Add Jest global setup for test database
- Add Supertest HTTP e2e tests for all modules

**Tests:** Add concurrency tests, add HTTP contract tests

**Dependencies:** None

### Phase 5: Fix Frontend–Backend Contract Issues (Priority: Medium)

**Objective:** Align frontend assumptions with backend reality.

**Work:**
- Fix `ADMIN` → `COMPANY_ADMIN` role mapping
- Add proper `JobStatus` mapping (10 backend values → frontend display)
- Add middleware.ts for route-level protection
- Fix `advanceCandidateApplication` store bug

### Phase 6: AI Interview Foundation (Priority: Low)

**Objective:** Begin AI interview implementation.

**Work:**
- Build interview question generation service
- Build AI interview session model
- Build basic scoring

---

## 35. Immediate Next Milestone

**Connect AI Screening frontend to backend.**

This is the single highest-value integration task. The backend is complete with:
- 4 working API endpoints for requesting, listing, and retrieving screening results
- Full BullMQ async processing pipeline
- Resume text extraction and redaction
- Deterministic idempotency
- Proper retry and failure handling
- Tenant-scoped authorization

The frontend `/ai-screener` page currently shows 6 hardcoded candidates with mock scores. It needs to be rewritten to:
1. Select a real candidate/application from the system
2. Request AI screening via `POST /api/v1/applications/:id/ai-screenings`
3. Display real screening results (status, recommendation, scores, evidence)
4. Handle the extraction-pending state (HTTP 409)

This milestone requires **no backend changes** — only frontend API integration and UI work.

---

## 36. Evidence Index

All file paths are relative to repository root `D:\AI interviewer\AI-Recruiter-Agent`.

### Frontend
- App router: `src/app/`
- Root layout: `src/app/layout.tsx`
- Shared components: `src/components/`
- API client: `src/lib/api/client.ts`
- API modules: `src/lib/api/`
- Stores: `src/store/useStore.ts`, `src/store/notification-store.ts`
- Auth context: `src/lib/auth-context.tsx`
- Theme context: `src/lib/theme-context.tsx`
- Types: `src/types/index.ts`
- API types: `src/lib/api/types.ts`

### Backend
- Root module: `backend/src/app/app.module.ts`
- Main entry: `backend/src/main.ts`
- Config: `backend/src/config/`
- Common: `backend/src/common/`
- Database: `backend/src/database/prisma/prisma.service.ts`
- All modules: `backend/src/modules/`
- Prisma schema: `backend/prisma/schema.prisma`
- Migrations: `backend/prisma/migrations/`
- Test fixtures: `backend/test/fixtures/resumes/`

### Key Module Files
- Auth controller: `backend/src/modules/auth/auth.controller.ts`
- Jobs controller: `backend/src/modules/jobs/controllers/jobs.controller.ts`
- Applications controller: `backend/src/modules/applications/controllers/applications.controller.ts`
- AI screening controller: `backend/src/modules/ai-screening/ai-screening.controller.ts`
- AI screening service: `backend/src/modules/ai-screening/ai-screening.service.ts`
- AI screening processor: `backend/src/modules/ai-screening/queue/ai-screening.processor.ts`
- Resume extraction processor: `backend/src/modules/resume-processing/queue/resume-extraction.processor.ts`
- Resume text extractor: `backend/src/modules/resume-processing/services/resume-text-extractor.service.ts`
- Resume redaction: `backend/src/modules/ai-screening/utils/resume-redaction.ts`
- Screening input builder: `backend/src/modules/ai-screening/services/screening-input-builder.service.ts`
- Resume text loader: `backend/src/modules/ai-screening/services/resume-text-loader.service.ts`

### Configuration
- AI screening config: `backend/src/config/loaders/ai-screening.config.ts`
- Resume extraction config: `backend/src/config/loaders/resume-extraction.config.ts`
- Validation schema: `backend/src/config/validation.ts`
- Redis config: `backend/src/config/loaders/redis.config.ts`
- Queue module: `backend/src/modules/queue/queue.module.ts`

### Tests
- Backend standard tests: `backend/src/**/*.spec.ts` (893 tests, 55 suites)
- Backend binary tests: `backend/src/**/*.test.ts` (13 tests, 2 suites)
- Real binary extraction: `backend/src/modules/resume-processing/__tests__/resume-text-extractor.real-binary.test.ts`
- Extraction-to-screening: `backend/src/modules/resume-processing/__tests__/resume-extraction-to-screening.test.ts`
