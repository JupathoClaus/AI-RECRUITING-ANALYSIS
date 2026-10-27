# Current Task

**Task ID:** ENG-021  
**Title:** Browser-based synthetic recruitment workflow verification  
**Status:** NOT_STARTED  
**Priority:** High  
**Assigned:** Next agent  
**Created:** 2026-10-27  
**Updated:** 2026-10-27

## Background

ENG-020 complete. The staging stack is LOCALLY VERIFIED — all 5 services running and healthy:
- Backend: http://localhost:3010 (healthy)
- Frontend: http://localhost:3011 (running)
- MailHog: http://localhost:8025 (running)
- PostgreSQL + Redis: internal only (healthy)
- Database: talentai_staging (31 migrations, 84 tables, empty/fresh)

What was NOT verified (requires browser):
- User registration and login
- Job creation and publishing
- Public application submission
- MOCK AI screening request
- Recruiter workflow actions
- Email capture in MailHog

## Objective

Complete a full synthetic recruitment workflow through the staging UI:

1. Register a test company at http://localhost:3011/register
2. Log in and create a synthetic job
3. Publish the job
4. Submit a synthetic application through the public careers page
5. Request MOCK AI screening from the application workspace
6. Verify screening status and results
7. Exercise recruiter actions (shortlist, move stage, add note)
8. Create an AI interview invitation and verify email in MailHog
9. Verify AI results are clearly labeled as MOCK/synthetic

## Next Safe Action

1. Open http://localhost:3011 in a browser
2. Register a test company
3. Follow the workflow above
4. Document each step with screenshots or notes

---
## Previous Task: ENG-020 (COMPLETED)

**Title:** Safe staging startup and end-to-end verification  
**Status:** LOCALLY VERIFIED  
**Completed:** 2026-10-27

### Result
- Staging stack started with 5 containers (postgres, redis, mailhog, backend, frontend)
- All health checks passed: backend 200, frontend 200, proxy 200, MailHog 200
- 31 Prisma migrations applied (84 tables)
- Database isolation confirmed (talentai_staging separate from dev talentai)
- Dev services unaffected
- No secrets in logs
- Fixed: QWEN_BASE_URL validation + Next.js BACKEND_URL build arg

See MILESTONE_LOG.md ML-019
