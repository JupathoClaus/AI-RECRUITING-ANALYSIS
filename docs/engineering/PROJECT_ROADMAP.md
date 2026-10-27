# TalentAI Project Roadmap

**Purpose:** TalentAI is an AI-powered recruitment management platform initially targeting Uganda, with future expansion to other African markets and international customers.

**Current State:** feat/mvp-resume-development @ ab37d307ee678ef5d9876e103afc92f36b2bed53  
**Verification Level:** Local verification only - not production verified  
**Estimated Readiness:** ~70% toward a controlled-pilot MVP (estimate, not measured)

## Core MVP Outcome

The core MVP outcome is that **one company can configure its recruitment process, publish a job, receive applications, review evidence and AI-assisted evaluations, manage the recruitment pipeline, and make human hiring decisions**.

**Key Principle:** AI assists; a recruiter or authorized HR manager retains the final hiring decision.

**Acceptance Criteria for Core MVP:**
- [ ] Company/recruiter authentication and authorization functional
- [ ] Job creation, configuration, and publication functional  
- [ ] Public job/application entry accessible
- [ ] Candidate applications submitted and persisted
- [ ] CV/file handling with safe storage functional
- [ ] Applications retrievable by authorized company
- [ ] AI-assisted evaluation/screening functional where configured (with human oversight)
- [ ] Recruiter review and pipeline progression functional
- [ ] Human decision-making with audit trail functional

## Implementation Status (Evidence-Based)

| Area | Status | Evidence |
|------|--------|----------|
| Jobs, candidates, applications, pipeline, interviews (core CRUD) | Implemented & tested | Backend modules exist, unit/E2E tests pass (applications 32/32, app 37/37) |
| Authentication/Authorization | Implemented | Auth module, guards, role/permission system present |
| AI screening pipeline | Implemented & locally tested | Modules exist, upload/extraction flow, mock provider tested |
| Public application submission | Implemented & locally tested | 7/7 E2E tests pass, fixed DTO parsing and duplicate cleanup bugs |
| File upload/storage (local) | Implemented & locally tested | Files module, validation, safe storage patterns |
| E2E upload isolation | Implemented & verified | Test setup fixed for unique temp dirs per run, verified outside dev uploads |
| Backend watcher/TS compilation | Resolved locally | Stale watcher restarted, clean compile with 0 errors |
| AI interviews | Implemented (MOCK provider) | Module exists, persisted sessions |
| Assessments | Implemented | Module exists |
| Email delivery | Not verified | SMTP target localhost:1025, no listener; no real email sent |
| Real AI providers | Not verified | Mock provider used; external API integration not verified |
| Tavus video interviews | Not verified | Disabled/configured but not tested with real service |
| Load testing (5k/50k applicants) | Not done | Not measured |

## Remaining Work (Dependency Order)

### Phase 1: Complete Core Journey Verification (Current Priority)
1. **Map and verify full core journey** - Trace auth → job pub → public apply → review → pipeline → decision → audit (evidence-based)
2. **Identify smallest gaps** - Focus on unverified steps between existing working components
3. **Targeted fixes if safe** - Only fix clearly bounded defects blocking next acceptance criterion

### Phase 2: Production Readiness Hardening (After Journey Verified)
1. **Email delivery** - Configure and test SMTP or provider; verification flows
2. **Real AI provider integration** - Test with real APIs, rate limits, costs, failure modes
3. **Error handling & resilience** - Circuit breakers, retries, graceful degradation
4. **Audit completeness** - Ensure all decisions/actions audited

### Phase 3: Controlled Pilot Preparation (After Hardening)
1. **Pilot company onboarding** - Documentation, configuration guides
2. **Monitoring/observability** - Logs, metrics, alerts
3. **Backup/restore procedures** - Data protection
4. **Load testing** - Representative pilot-scale load

## Deferred Until After Controlled Pilot
- Multi-tenant architecture changes beyond current model
- Internationalization/localization beyond Uganda focus
- Advanced analytics/reporting features
- Marketplace/integrations expansion
- Horizontal scaling for 50k+ applicants (requires load testing first)

## Milestones & Exit Criteria

| Milestone | Exit Criteria | Status |
|-----------|---------------|--------|
| M1: Control System Bootstrapped | Engineering docs created/updated, state recorded | In Progress |
| M2: Core Journey Mapped & Verified | All 9 journey steps traced with evidence; gaps documented | Not Started |
| M3: Controlled Pilot Ready | Core journey verified, email/AI tested or mocked safely, audit complete | Not Started |
| M4: Production Ready | Load tested, monitoring, backups, security review complete | Deferred |

## Distinction: Controlled Pilot vs High-Volume Readiness
- **Controlled Pilot:** One company, manageable volume (hundreds/thousands), supervised rollout, with human oversight at every decision point. Requires core journey verified locally/integration tested.
- **High-Volume (50k):** Requires load testing, horizontal scaling validation, queue tuning, cost analysis, and production monitoring. Not claimed ready.
