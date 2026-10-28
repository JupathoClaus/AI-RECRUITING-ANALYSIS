# TalentAI — Local UI Verification Report

**Date:** 2026-10-27  
**Branch:** feat/mvp-resume-development  
**Commit:** a4aaf9a433178d66c390723127c0e7c11a249237  
**Verdict:** **UI RUNNING — CORE FLOW PARTIALLY VERIFIED**

## Quick Start

**Frontend:** http://localhost:3011  
**Test login:** `sarah@airecruiter.com` / `admin123`  
**MailHog inbox:** http://localhost:8025  

---

## Service Status

| Service | Container | Status | Host Port |
|---|---|---|---|
| PostgreSQL | talentai-staging-postgres | ✅ healthy | internal only |
| Redis | talentai-staging-redis | ✅ healthy | internal only |
| MailHog | talentai-staging-mailhog | ✅ running | 1025 (SMTP), 8025 (UI) |
| Backend (NestJS) | talentai-staging-backend | ✅ healthy | 3010 |
| Frontend (Next.js) | talentai-staging-frontend | ✅ running | 3011 |

## Commands Actually Run

```powershell
# Check services
docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

# Health checks
Invoke-WebRequest http://localhost:3010/api/v1/health/ready   → 200
Invoke-WebRequest http://localhost:3011                        → 200
Invoke-WebRequest http://localhost:3011/api/v1/health/live    → 200 (proxy works)
Invoke-WebRequest http://localhost:8025                        → 200

# Seed base data (roles, permissions, skills)
docker exec talentai-staging-backend sh -c "cd /app && node dist/prisma/seed.js"
# Result: 7 roles updated, 320 role-permission mappings created, 21 skills created

# Seed dev data (test company and user)
docker exec talentai-staging-backend sh -c "cd /app && node dist/prisma/seed-dev.js"
# Result: User, Company, 2 jobs, pipeline, 4 candidates, applications created

# Verify login
POST http://localhost:3010/api/v1/auth/login {"email":"sarah@airecruiter.com","password":"admin123"}
# Result: 200, JWT access token returned, role: COMPANY_ADMIN
```

## Database Migration Status

- 31 migrations applied, 0 pending (verified at container startup)
- 84 tables created
- Database: `talentai_staging` (isolated from dev database)

## Test Account

| Field | Value |
|---|---|
| Email | `sarah@airecruiter.com` |
| Password | `admin123` |
| Name | Sarah Chen |
| Company | AI Recruiter Co |
| Role | COMPANY_ADMIN (full permissions) |

## Seeded Synthetic Data

| Item | Details |
|---|---|
| Company | AI Recruiter Co (slug: `ai-recruiter-dev`) |
| Job 1 | "Product Manager" — PUBLISHED — 6-stage pipeline |
| Job 2 | "Senior Software Developer" — PUBLISHED |
| Candidate 1 | Alice Johnson → Applied |
| Candidate 2 | Bob Smith → Screening |
| Candidate 3 | Carol Davis → Interview |
| Candidate 4 | Daniel Kato → Applied (AI Interview target) |

## API-Level Verification (confirmed by test)

| Check | Result |
|---|---|
| Backend health/live | ✅ 200 `{"status":"ok"}` |
| Backend health/ready | ✅ 200 — database up, redis up, 8 queues up |
| Frontend HTTP | ✅ 200 |
| Frontend→Backend proxy (`/api/v1/*`) | ✅ 200 |
| MailHog web UI | ✅ 200 |
| Login API (`sarah@airecruiter.com`) | ✅ 200, JWT returned, COMPANY_ADMIN role |

## Not Yet Verified (requires browser)

These checks require opening the browser — no automated browser control was available:

- [ ] Login page renders in browser
- [ ] Dashboard loads with real data
- [ ] Jobs list shows "Product Manager" and "Senior Software Developer"
- [ ] Application workspace loads for Alice, Bob, Carol, Daniel
- [ ] AI screening request (MOCK provider)
- [ ] Pipeline board shows candidates in correct stages
- [ ] MailHog captures a test email
- [ ] Recruiter actions (shortlist, move stage, notes)

## AI Provider Status

All AI providers are MOCK — no external API keys required:
- `AI_SCREENING_PROVIDER=mock`
- `ASSESSMENT_AI_PROVIDER=mock`
- `AI_INTERVIEW_EVALUATION_PROVIDER=mock`
- `TAVUS_ENABLED=false`

AI results will be **synthetic/generated** — clearly labeled as decision support in the UI.

## Start / Stop Commands

```powershell
# Start (from D:\TalentAI-GIT-RECOVERY)
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# Check status
docker compose -f docker-compose.staging.yml --env-file .env.staging ps

# View logs
docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f backend

# Stop (preserves data)
docker compose -f docker-compose.staging.yml --env-file .env.staging down

# Stop AND remove all staging data (DESTRUCTIVE)
docker compose -f docker-compose.staging.yml --env-file .env.staging down -v
```

## Re-seed After Restart

If you stop and start the stack with volumes intact, data is preserved.
If you remove volumes (`down -v`), re-run:

```powershell
docker exec talentai-staging-backend sh -c "cd /app && node dist/prisma/seed.js"
docker exec talentai-staging-backend sh -c "cd /app && node dist/prisma/seed-dev.js"
```

## Known Limitations

- No HTTPS — HTTP only. Do not use real candidate data.
- No real email delivery — MailHog captures all emails at http://localhost:8025
- MOCK AI only — screening scores are synthetic
- No Tavus video interviews
- Stack uses ports 3010/3011 (not 3000/3001) to avoid conflicting with local dev
