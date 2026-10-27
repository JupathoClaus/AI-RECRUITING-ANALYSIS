# TalentAI — Controlled Pilot Readiness Assessment

**Date:** 2026-10-27  
**Assessed by:** ENG-018  
**Repository:** D:\TalentAI-GIT-RECOVERY @ ab37d307  
**Branch:** feat/mvp-resume-development

## Overall Assessment

**Status: CONDITIONAL GO for a limited, controlled pilot with one company using the MOCK AI provider.**

The core recruiter workflow is complete, tested, and running. The backend and frontend are operational with PostgreSQL, Redis, and all 8 BullMQ queues healthy. The complete journey (auth → job publish → public apply → review → screening → pipeline → decisions → audit) is wired end-to-end.

**Conditions:**
1. AI screening uses the MOCK provider only — no real AI inference
2. AI interviews use the MOCK provider only — no Tavus video interviews
3. Email delivery requires MailHog to be started (or manual handling)
4. No load testing has been performed
5. No staging environment — local development only

## Infrastructure Status (verified 2026-10-27)

| Service | Port | Status | Evidence |
|---|---|---|---|
| PostgreSQL | 5432 | ✅ UP | TCP connect successful; health/ready reports `database: up, 129ms` |
| Redis | 6379 | ✅ UP | TCP connect successful; health/ready reports `redis: up, 191ms` |
| Backend (NestJS) | 3000 | ✅ UP | `/api/v1/health/live` → 200; `/api/v1/health/ready` → 200 |
| Frontend (Next.js) | 3001 | ✅ UP | HTTP 200 response |
| MailHog SMTP | 1025 | ❌ DOWN | Not running |
| MailHog Web | 8025 | ❌ DOWN | Not running |

**Queue health (from /api/v1/health/ready):**
- email: up
- notifications: up
- analytics: up
- ai-processing: up
- interview-reminder: up
- interview-notification: up
- ai-screening: up
- resume-processing: up

## Verified Capabilities

### Core Recruiter Workflow (ENG-007–017)

| Capability | Status | Evidence |
|---|---|---|
| Job creation, editing, lifecycle (publish/pause/close/reopen/archive) | ✅ Verified | ENG-014: JobLifecycleActions in workspace; 22 tests |
| Public careers flow (listing → detail → apply) | ✅ Verified | `src/app/careers/[companySlug]/` route structure confirmed |
| Application workspace (overview, screening, assessment, activity, notes) | ✅ Verified | ENG-007–013: workspace has all panels; 38+ tests |
| AI screening request/rerun from workspace | ✅ Verified | ENG-009: RequestScreeningButton; 15 tests |
| Screening status in application table | ✅ Verified | ENG-008: ScreeningStatusBadge column; backend `latestScreening` field; 9 tests |
| Recruiter notes (add, view, visibility rules) | ✅ Verified | ENG-010: NotesCard; 15 tests; backend `applications.add_notes` permission |
| Candidate profile (education, employment, skills, applications, back-link) | ✅ Verified | ENG-012: CandidateProfile; 21 tests |
| Pipeline board (stage moves, refresh, All Positions) | ✅ Verified | ENG-011: fetchCandidates after mutations; 10 tests |
| AI interview scheduling and status from workspace | ✅ Verified | ENG-013: AiInterviewPanel + SendAiInterviewModal; 14 tests |
| Assessment panel in workspace | ✅ Verified | ApplicationAssessmentPanel already functional |
| Dashboard (real API data, attention panel, KPIs, charts) | ✅ Verified | ENG-016: all sections use real API data; 82 tests pass |
| Reports (7 report types, CSV export) | ✅ Verified | ENG-017: all use real API calls |
| Analytics page | ✅ Verified | `/analytics` page exists and renders |

### Backend Authorization

| Area | Guard | Permission Scope | Company Isolation |
|---|---|---|---|
| Jobs | JwtAuthGuard + PermissionsGuard | `jobs.create/read/update/publish/close/archive` | `companyId` in all queries |
| Applications | JwtAuthGuard + PermissionsGuard | `applications.read/create/update` | `companyId` in `findFirst`/`findMany` |
| AI screening | JwtAuthGuard + RolesGuard | `COMPANY_ADMIN/RECRUITER/HR_MANAGER` | `companyId` in all queries |
| AI interviews | JwtAuthGuard + PermissionsGuard | `interviews.create/read/update/cancel` | `companyId` in all queries |
| Notes | JwtAuthGuard + PermissionsGuard | `applications.read/add_notes/delete_notes` | `companyId` + visibility filter |
| Pipeline | (via applications) | `applications.read` | `companyId` in all queries |

Cross-tenant access returns 404 (not 403) — prevents ID enumeration.

### Email Service

| Aspect | Status |
|---|---|
| EmailService (11 templates) | ✅ Implemented |
| EmailWorker (12 job types) | ✅ Implemented |
| SMTP config (env vars) | ✅ Documented in `.env.example` and `EMAIL_SETUP.md` |
| Unit tests (mocked SMTP) | ✅ 43/43 passing |
| MailHog running | ❌ Not running |
| Real SMTP delivery | ❌ Unverified |

### Test Coverage

| Suite | Tests | Status |
|---|---|---|
| Frontend TypeScript | — | 0 errors in `src/` |
| Application workspace (screening) | 15 | ✅ Pass |
| Application workspace (notes) | 15 | ✅ Pass |
| Application workspace (AI interview) | 14 | ✅ Pass |
| Application table (screening column) | 9 | ✅ Pass |
| Candidate profile | 21 | ✅ Pass |
| Job workspace (lifecycle) | 22 | ✅ Pass |
| Pipeline page | 10 | ✅ Pass |
| AI screening components | 109 | ✅ Pass |
| Backend email (mocked) | 43 | ✅ Pass |
| Backend applications service | 13 | ✅ Pass |
| Backend AI screening | 100 | ✅ Pass |
| Jobs page (in isolation) | 7 | ✅ Pass (flaky under concurrent load) |

## Mock-Only Functionality

| Feature | Provider | What Works | What Doesn't |
|---|---|---|---|
| AI screening | MOCK | Creates PENDING → COMPLETED with deterministic scores; full state machine; fingerprint dedup | No real LLM inference; scores are generated, not assessed |
| AI interview evaluation | MOCK | Produces structured evaluation report with competencies | No real transcript analysis; evaluation is synthetic |
| AI interviews (video) | MOCK | Generates mock conversation URL; seeds deterministic transcript | No real Tavus video session; no real recording |
| Assessment AI | MOCK | Assessment scoring works | No real AI evaluation |

## Environment Prerequisites for Real Functionality

### Email Delivery (MailHog)
```powershell
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
```
Then verify at http://localhost:8025. See `docs/engineering/EMAIL_SETUP.md`.

### Real AI Screening (Qwen via Ollama)
```env
AI_SCREENING_PROVIDER=qwen
QWEN_BASE_URL=http://localhost:11434/v1
QWEN_MODEL=qwen3.5:9b
QWEN_API_KEY=ollama
```
Requires Ollama running locally with the model pulled.

### Real Tavus AI Interviews
```env
TAVUS_ENABLED=true
TAVUS_API_KEY=<real-key>
TAVUS_PERSONA_ID=<real-id>
TAVUS_REPLICA_ID=<real-id>
TAVUS_CALLBACK_BASE_URL=<public-backend-url>
```
Requires a Tavus account and configured persona/replica.

## Security and Data Protection

### Code-Review Evidence (not penetration-tested)
- JWT authentication with access (15m) + refresh (7d) tokens
- Bcrypt password hashing (10 rounds)
- PermissionsGuard on all authenticated routes
- Company-scoped queries — no cross-tenant data access possible
- Cross-tenant requests return 404 (prevents enumeration)
- Note visibility: PRIVATE notes only visible to their author
- Resume files stored with company scope; no public access
- Interview codes stored as hashes only; raw code returned once on creation
- Rate limiting configured (100 req/60s default)
- No secrets logged (email service logs recipient address only)
- Advisory notices on all AI result views: "AI results are decision support"

### Not Verified
- No penetration testing performed
- No GDPR/data-retention compliance review
- No security audit of third-party dependencies
- No production secret management review
- CORS configured for localhost:3001 only (dev setting)

## High-Priority Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Mock AI scores presented as real assessments | Misleading hiring decisions | Advisory notice on every AI result; recruiter must make final decision |
| Email not delivered (MailHog not running) | Candidates don't receive invitations | Start MailHog before pilot; or manually share interview codes |
| No load testing | Performance unknown at scale | Keep pilot to ≤100 candidates; monitor response times |
| No staging environment | Only local verification | Deploy to staging before real candidate data |
| Frontend flaky tests under load | CI noise | Run tests in groups; increase timeouts for jsdom |

## Go/No-Go Criteria for Limited Pilot

### GO conditions (all must be met):
- [x] Core recruiter workflow complete and tested
- [x] Backend, frontend, PostgreSQL, Redis all running and healthy
- [x] All BullMQ queues operational
- [x] Backend authorization and tenant isolation enforced
- [x] AI results clearly labeled as decision support
- [x] Recruiter retains final hiring decision
- [x] No hardcoded data or fabricated metrics

### Conditions (must be addressed before pilot):
- [ ] MailHog started OR manual email handling plan documented
- [ ] Pilot company onboarded with understanding that AI uses MOCK provider
- [ ] Pilot scope limited to ≤100 candidates (no load testing done)
- [ ] CORS and security settings reviewed for non-localhost access if needed

### NO-GO conditions (any one blocks):
- [ ] Real candidate data without email delivery verified
- [ ] Production SMTP credentials committed to the repository
- [ ] AI results presented without advisory notice
- [ ] Recruiter bypassed from final hiring decision

## Required Actions Before Real Candidate Data

1. Start MailHog (or configure real SMTP)
2. Send a test AI interview invitation and confirm delivery
3. Verify the candidate can access the interview using the code
4. Review CORS settings if accessing from non-localhost
5. Document the pilot company's onboarding process
6. Establish a monitoring/alerting baseline (logs at minimum)
7. Confirm the pilot company understands MOCK AI limitations
