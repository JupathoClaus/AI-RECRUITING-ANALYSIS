# TalentAI — Staging Deployment Guide

**Created:** 2026-10-27 (ENG-019, verified ENG-020)  
**Compose file:** `docker-compose.staging.yml` (repository root)  
**Status:** **LOCALLY VERIFIED** — all 5 services started and healthy on 2026-10-27

## Architecture and Service Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Host Machine (localhost)                                      │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐               │
│  │  Frontend   │  │  Backend    │  │  MailHog     │               │
│  │  :3011      │  │  :3010      │  │  :8025 (web) │               │
│  │  (Next.js)  │  │  (NestJS)   │  │  :1025 (smtp)│               │
│  └──────┬──────┘  └──────┬──────┘  └──────────────┘               │
│         │                 │                                       │
│         │  /api/v1/* ────► │  (Next.js rewrite proxy)              │
│         │                 │                                       │
│  ┌──────┴─────────────────┴──────────────────────────┐            │
│  │         Docker Network: talentai-staging          │            │
│  │                                                    │            │
│  │  ┌──────────┐  ┌─────────┐  ┌──────────┐          │            │
│  │  │PostgreSQL│  │  Redis  │  │ MailHog │          │            │
│  │  │  :5432   │  │  :6379  │  │  :1025  │          │            │
│  │  │(internal)│  │(internal)│  │(internal)│         │            │
│  │  └──────────┘  └─────────┘  └──────────┘          │            │
│  └────────────────────────────────────────────────────┘            │
│                                                                  │
│  Volumes: staging_postgres_data, staging_redis_data,             │
│           staging_uploads                                       │
│  Ports: 3010 (backend), 3011 (frontend), 1025/8025 (MailHog)   │
│  All bound to 127.0.0.1 only                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- PostgreSQL and Redis are NOT exposed to the host — only accessible via Docker's internal network
- The frontend proxies API calls to the backend via Next.js rewrites (`BACKEND_URL=http://backend:3000`)
- MailHog web UI and SMTP are bound to `127.0.0.1` only (not `0.0.0.0`)
- Backend runs `prisma migrate deploy` on startup — migrations are applied automatically
- All AI providers default to MOCK for staging safety

## Prerequisites

1. **Docker** and **Docker Compose** installed
2. A `.env.staging` file in the repository root with required secrets (see below)
3. No conflicting containers on ports 3000, 3001, 1025, 8025

> **WARNING:** The existing local development environment (PostgreSQL on 5432, Redis on 6379, backend on 3000, frontend on 3001) is currently running. The staging compose uses different port bindings (localhost-bound only) and different container names (`talentai-staging-*`) to avoid conflicts. However, if your local PostgreSQL or Redis is running on the default ports, the staging stack will NOT expose those ports — it uses internal networking only.

## Environment Variable Checklist

Create `.env.staging` from `.env.staging.example`:

```bash
cp .env.staging.example .env.staging
```

**Required (app will not start without these):**

| Variable | Purpose | How to Generate |
|---|---|---|
| `POSTGRES_PASSWORD` | Database password | Choose a strong password |
| `JWT_SECRET` | JWT access token signing | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | JWT refresh token signing | Same command, different output |
| `ASSESSMENT_ACCESS_TOKEN_SECRET` | Assessment access token signing | Same command |

**Optional (have defaults):**

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` | `talentai` | Database user |
| `POSTGRES_DB` | `talentai_staging` | Database name |
| `FRONTEND_URL` | `http://localhost:3001` | Used in email links |
| `CORS_ORIGIN` | `http://localhost:3001` | CORS allowed origin |
| `EMAIL_FROM` | `noreply@ai-recruiter.com` | Sender email address |
| `AI_SCREENING_PROVIDER` | `mock` | AI screening provider |

## Startup Commands

```powershell
# 1. Create .env.staging from the example
cp .env.staging.example .env.staging
# Edit .env.staging and fill in the required secrets (JWT, ASSESSMENT_ACCESS_TOKEN_SECRET, POSTGRES_PASSWORD)

# 2. Build and start all services
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build

# 3. Wait for services to be healthy (check status)
docker compose -f docker-compose.staging.yml --env-file .env.staging ps

# 4. View logs (all services)
docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f

# 5. View specific service logs
docker compose -f docker-compose.staging.yml --env-file .env.staging logs -f backend
```

## Health Verification

After startup, verify all services are healthy:

```powershell
# Check container status (all should show "healthy" or "Up")
docker compose -f docker-compose.staging.yml --env-file .env.staging ps

# Backend health check (port 3010)
curl http://localhost:3010/api/v1/health/live
# Expected: {"status":"ok",...}

curl http://localhost:3010/api/v1/health/ready
# Expected: {"status":"ready","checks":{"database":{"status":"up",...},"redis":{"status":"up",...},"queues":{...}}}

# Frontend check (port 3011)
curl http://localhost:3011
# Expected: HTML response (200 OK)

# Frontend-to-backend proxy check (goes through Next.js rewrite)
curl http://localhost:3011/api/v1/health/live
# Expected: {"status":"ok",...}

# MailHog web UI
# Open http://localhost:8025 in a browser
```

## Database Migration

The backend container automatically runs `npx prisma migrate deploy` on startup (defined in `backend/Dockerfile`). This applies all pending migrations in order.

**To check migration status manually:**
```powershell
docker compose -f docker-compose.staging.yml exec backend npx prisma migrate status
```

**Never run `prisma migrate reset` on staging data.** This would destroy all data.

## Test Workflow (Synthetic Recruitment)

After the stack is healthy, exercise one recruitment cycle:

1. **Register a test company** at `http://localhost:3001/register`
2. **Create a job** from the recruiter dashboard
3. **Publish the job** using the lifecycle actions in the job workspace
4. **Submit a synthetic application** through the public careers page
5. **Request AI screening** from the application workspace (MOCK provider will produce a result)
6. **Verify screening status** appears in the application table and workspace
7. **Add a recruiter note** to the application
8. **Move the application** through a pipeline stage
9. **Check MailHog** at `http://localhost:8025` for any emails (e.g., if an AI interview invitation was sent)

All AI results in staging are **MOCK-generated** and clearly labeled as decision support. No real candidate data should be used.

## Shutdown and Restart

```powershell
# Stop all services (data is preserved in volumes)
docker compose -f docker-compose.staging.yml --env-file .env.staging down

# Stop and remove all data (DESTRUCTIVE — removes database, uploads)
docker compose -f docker-compose.staging.yml --env-file .env.staging down -v

# Restart after changes
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

## Verification Results (ENG-020, 2026-10-27)

| Check | Result |
|---|---|
| All 5 containers running | ✅ Verified |
| PostgreSQL healthy | ✅ Up 36 minutes (healthy) |
| Redis healthy | ✅ Up 36 minutes (healthy) |
| Backend healthy | ✅ Up 33 minutes (healthy) |
| Frontend running | ✅ Up 14 minutes |
| MailHog running | ✅ Up 36 minutes |
| Backend health/live | ✅ 200 `{"status":"ok",...}` |
| Backend health/ready | ✅ 200 — database up 26ms, redis up 18ms, 8 queues up |
| Frontend HTTP | ✅ 200 |
| Frontend→Backend proxy | ✅ 200 `{"status":"ok",...}` |
| MailHog web UI | ✅ 200 |
| Database migrations | ✅ 31 applied, 0 pending |
| Tables created | ✅ 84 tables |
| Database isolation | ✅ `talentai_staging` (separate from dev `talentai`) |
| Volume isolation | ✅ `staging_*` volumes (separate from dev volumes) |
| Dev services unaffected | ✅ All 4 dev containers still running |
| No secrets in logs | ✅ Only route names (auth/forgot-password etc.) |
| Ports non-conflicting | ✅ Staging: 3010, 3011, 1025, 8025; Dev: 3000, 3001, 5432, 6379 |

**Verdict: LOCALLY VERIFIED**

### Not Yet Verified (requires browser interaction)
- User registration and login through the UI
- Job creation, publishing, and public application submission
- MOCK AI screening request and result display
- Recruiter workflow actions (reject, shortlist, hire, move stage)
- Email capture in MailHog (no email-sending action performed yet)

## Backup and Recovery

**Backup the database:**
```powershell
docker compose -f docker-compose.staging.yml exec postgres pg_dump -U talentai talentai_staging > backup.sql
```

**Restore from backup:**
```powershell
Get-Content backup.sql | docker compose -f docker-compose.staging.yml exec -T postgres psql -U talentai talentai_staging
```

**Backup uploads volume:**
```powershell
docker run --rm -v talentai-staging_uploads:/data -v ${PWD}:/backup alpine tar czf /backup/uploads-backup.tar.gz /data
```

## Known Limitations

1. **No HTTPS** — the staging stack uses HTTP only. A reverse proxy (nginx, Caddy) is needed for TLS.
2. **No reverse proxy** — the frontend and backend are exposed directly. For production, use a reverse proxy to handle TLS, routing, and rate limiting.
3. **MailHog only** — all emails go to MailHog's local inbox. No real delivery occurs.
4. **MOCK AI only** — all AI results are synthetic. Switching to real providers requires additional configuration (see below).
5. **No monitoring/observability** — no Prometheus, Grafana, or log aggregation is configured.
6. **CORS configured for localhost** — change `CORS_ORIGIN` if accessing from a different host.
7. **No automated backup** — backups must be performed manually.

## Configuring Real AI Providers (Later)

### Qwen (local Ollama)
```env
AI_SCREENING_PROVIDER=qwen
QWEN_BASE_URL=http://host.docker.internal:11434/v1
QWEN_MODEL=qwen3.5:9b
QWEN_API_KEY=ollama
```

### Tavus (real video interviews)
```env
TAVUS_ENABLED=true
TAVUS_API_KEY=<real-key>
TAVUS_PERSONA_ID=<real-id>
TAVUS_REPLICA_ID=<real-id>
TAVUS_CALLBACK_BASE_URL=<publicly-accessible-backend-url>
```

### Real SMTP (replacing MailHog)
```env
SMTP_HOST=<your-smtp-host>
SMTP_PORT=<your-smtp-port>
SMTP_SECURE=true
SMTP_USER=<your-smtp-user>
SMTP_PASS=<your-smtp-password>
EMAIL_FROM=noreply@yourcompany.com
```

Remove the `mailhog` service from the compose file when switching to a real SMTP provider.

## Security Risks

- **No TLS** — all traffic is unencrypted. Do not use real candidate data over HTTP.
- **Secrets in .env.staging** — ensure this file is in `.gitignore` (it should be already).
- **Default passwords** — change `POSTGRES_PASSWORD` from the example value.
- **No rate limiting beyond NestJS defaults** — consider adding a reverse proxy with rate limiting.
- **No audit log retention policy** — logs grow indefinitely.
