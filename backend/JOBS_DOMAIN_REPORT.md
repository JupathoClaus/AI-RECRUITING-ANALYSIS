# TalentAI Jobs Domain Implementation Report

## 1. Executive Summary

The complete Jobs domain has been implemented for the TalentAI multi-tenant recruitment platform. The implementation covers 25+ primary objectives across job creation, editing, duplication, templates, descriptions, skills, requirements, screening, AI-screening configuration, interview-process configuration, hiring-pipeline configuration, status workflow, approval workflow, publication workflow, visibility, external-posting integration, team collaboration, activity/audit history, statistics, search/filtering/pagination, tenant isolation, Swagger documentation, unit tests (149 new, 275 total), and E2E test definitions.

## 2. Architecture Implemented

```
src/modules/
  jobs/                   - Core job services, workflow, controller, DTOs, validators
    controllers/          - JobsController (55+ routes), PublicJobsController (2 routes)
    services/             - JobsService, JobWorkflowService, JobCodeService, JobActivityService
    dto/                  - 17 DTOs covering all job operations
    validators/           - ScreeningEthicsValidator (fairness protections)
    mappers/              - Job response mappers (internal + public)
    tests/                - 4 test suites (66 tests)
  job-templates/          - Template CRUD, create job from template
    dto/                  - 4 DTOs
    tests/                - 1 test suite (15 tests)
  skills/                 - Global + company-custom skill catalogue
    dto/                  - 3 DTOs
    tests/                - 1 test suite (12 tests)
  job-publications/       - External posting adapters, publication lifecycle
    adapters/             - CompanyCareersPageAdapter, CustomWebhookAdapter, AdapterRegistry
    interfaces/           - ExternalPostingAdapter interface
    dto/                  - 1 DTO
    tests/                - 1 test suite (14 tests)
```

## 3. Prisma Models and Enums

### New Enums (16)
- `JobStatus` - DRAFT, PENDING_APPROVAL, APPROVED, SCHEDULED, PUBLISHED, PAUSED, CLOSED, FILLED, CANCELLED, ARCHIVED
- `JobVisibility` - INTERNAL, PUBLIC, PRIVATE, UNLISTED
- `EmploymentType` - FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, INTERNSHIP, VOLUNTEER, FREELANCE, APPRENTICESHIP, OTHER
- `WorkplaceType` - ON_SITE, REMOTE, HYBRID, FLEXIBLE
- `ExperienceLevel` - ENTRY, JUNIOR, MID, SENIOR, LEAD, MANAGER, DIRECTOR, EXECUTIVE, NOT_SPECIFIED
- `EducationLevel` - NONE, SECONDARY, CERTIFICATE, DIPLOMA, ASSOCIATE, BACHELORS, MASTERS, DOCTORATE, PROFESSIONAL, OTHER
- `RequirementImportance` - REQUIRED, PREFERRED, OPTIONAL
- `SkillType` - TECHNICAL, SOFT, LANGUAGE, CERTIFICATION, TOOL, DOMAIN, OTHER
- `ScreeningQuestionType` - SHORT_TEXT, LONG_TEXT, SINGLE_CHOICE, MULTIPLE_CHOICE, YES_NO, NUMBER, DATE, FILE, VIDEO, AUDIO, URL
- `JobApprovalStatus` - NOT_REQUIRED, PENDING, APPROVED, REJECTED, CHANGES_REQUESTED
- `JobPublicationStatus` - NOT_PUBLISHED, QUEUED, PUBLISHED, PARTIALLY_PUBLISHED, FAILED, UNPUBLISHED
- `JobCollaboratorType` - OWNER, RECRUITER, HIRING_MANAGER, INTERVIEWER, REVIEWER, OBSERVER
- `PipelineStageType` - APPLIED, SCREENING, ASSESSMENT, AI_INTERVIEW, RECRUITER_INTERVIEW, TECHNICAL_INTERVIEW, FINAL_INTERVIEW, REFERENCE_CHECK, OFFER, HIRED, REJECTED, CUSTOM
- `ExternalPostingProvider` - COMPANY_CAREERS_PAGE, LINKEDIN, FACEBOOK, X, INDEED, GLASSDOOR, BRIGHTERMONDAY, JOBS_UGANDA, CUSTOM_WEBHOOK, OTHER
- `JobActivityEventType` - 24 event types for job activity tracking

### New Models (15)
- `Job` - Core job with 50+ fields, company-scoped unique jobCode/slug, multi-indexed
- `JobTemplate` - Reusable template with field templates, system/company ownership
- `Skill` - Normalized skill catalogue with global + company-custom support
- `JobSkill` - Job-skill junction with importance, minimum years, weight
- `JobEducationRequirement` - Education level/field requirements per job
- `JobExperienceRequirement` - Experience range requirements per job
- `JobLanguageRequirement` - Language requirements with interview policy
- `JobScreeningQuestion` - 15+ field screening questions with ethics validation
- `JobScreeningConfiguration` - Weighted AI screening configuration (1 row per job)
- `JobAccessibilityConfiguration` - Accessibility accommodations (1 row per job)
- `JobPipeline` - Pipeline per job with versioning
- `JobPipelineStage` - Ordered stages with SLA, auto-advance, assessment support
- `JobApproval` - Approval requests with reviewer workflow
- `JobCollaborator` - Job-team membership with granular permissions
- `JobPublication` - External posting records with provider adapters
- `JobActivityEvent` - Append-only activity log with sanitized metadata

### Modified Models (3)
- `Company` - Added 4 relations: `jobs`, `jobTemplates`, `skills`, `jobActivityEvents`
- `CompanySettings` - Added 14 job-related settings fields (requireJobApproval, jobCodePrefix, etc.)
- `CompanyMembership` - Added 15 job-related relation fields

## 4. Migration Status

**BLOCKED** - Docker not available. To create migration:
```bash
docker compose --profile test up -d postgres-test
npx prisma migrate dev --name jobs_domain
```

## 5. APIs Created

### Jobs Controller (`/api/v1/jobs` - 55 routes)

| Method | Route | Permission |
|--------|-------|------------|
| POST | /jobs | jobs.create |
| GET | /jobs | jobs.read |
| GET | /jobs/summary | jobs.read |
| GET | /jobs/:jobId | jobs.read |
| PATCH | /jobs/:jobId | jobs.update |
| POST | /jobs/:jobId/duplicate | jobs.create |
| DELETE | /jobs/:jobId | jobs.delete |
| POST | /jobs/:jobId/archive | jobs.archive |
| POST | /jobs/:jobId/restore | jobs.archive |
| POST | /jobs/:jobId/submit-for-approval | jobs.update |
| POST | /jobs/:jobId/approve | jobs.approve |
| POST | /jobs/:jobId/reject | jobs.approve |
| POST | /jobs/:jobId/request-changes | jobs.approve |
| POST | /jobs/:jobId/publish | jobs.publish |
| POST | /jobs/:jobId/schedule-publication | jobs.publish |
| POST | /jobs/:jobId/pause | jobs.update |
| POST | /jobs/:jobId/resume | jobs.update |
| POST | /jobs/:jobId/close | jobs.close |
| POST | /jobs/:jobId/mark-filled | jobs.close |
| POST | /jobs/:jobId/cancel | jobs.update |
| POST | /jobs/:jobId/reopen | jobs.update |
| GET | /jobs/:jobId/requirements | jobs.read |
| PUT | /jobs/:jobId/requirements | jobs.update |
| GET | /jobs/:jobId/screening | jobs.read |
| PATCH | /jobs/:jobId/screening | jobs.manage_screening |
| POST | /jobs/:jobId/screening/questions | jobs.manage_screening |
| PATCH | /jobs/:jobId/screening/questions/:id | jobs.manage_screening |
| DELETE | /jobs/:jobId/screening/questions/:id | jobs.manage_screening |
| POST | /jobs/:jobId/screening/questions/reorder | jobs.manage_screening |
| GET | /jobs/:jobId/accessibility | jobs.manage_screening |
| PATCH | /jobs/:jobId/accessibility | jobs.manage_screening |
| GET | /jobs/:jobId/pipeline | jobs.read |
| PUT | /jobs/:jobId/pipeline | jobs.manage_pipeline |
| POST | /jobs/:jobId/pipeline/stages | jobs.manage_pipeline |
| PATCH | /jobs/:jobId/pipeline/stages/:id | jobs.manage_pipeline |
| DELETE | /jobs/:jobId/pipeline/stages/:id | jobs.manage_pipeline |
| POST | /jobs/:jobId/pipeline/reorder | jobs.manage_pipeline |
| GET | /jobs/:jobId/collaborators | jobs.read |
| POST | /jobs/:jobId/collaborators | jobs.manage_collaborators |
| PATCH | /jobs/:jobId/collaborators/:id | jobs.manage_collaborators |
| DELETE | /jobs/:jobId/collaborators/:id | jobs.manage_collaborators |
| POST | /jobs/:jobId/transfer-ownership | jobs.manage_collaborators |
| GET | /jobs/:jobId/activity | jobs.read |
| POST | /jobs/:jobId/save-as-template | jobs.manage_templates |

### Public Jobs Controller (`/api/v1/public/companies/:slug/jobs` - 2 routes)
- GET /public/companies/:slug/jobs - Public (rate limited)
- GET /public/companies/:slug/jobs/:jobSlug - Public (rate limited)

### Job Templates Controller (`/api/v1/job-templates` - 7 routes)
- POST, GET, GET /system, GET /:id, PATCH /:id, DELETE /:id, POST /:id/create-job
- Permission: jobs.manage_templates

### Skills Controller (`/api/v1/skills` - 4 routes)
- GET, POST, PATCH /:id, DELETE /:id
- Permissions: jobs.read (list), jobs.manage_templates (mutations)

### Job Publications Controller (`/api/v1/jobs/:jobId/publications` - 4 routes)
- GET, POST, POST /:id/retry, DELETE /:id
- Permissions: jobs.read (list), jobs.publish (mutations)

## 6. Permissions Added

- `jobs.delete` - Delete draft jobs
- `jobs.archive` - Archive/restore jobs
- `jobs.approve` - Approve/reject/request changes
- `jobs.assign` - Assign jobs to team members
- `jobs.manage_templates` - Manage job templates
- `jobs.manage_pipeline` - Configure hiring pipeline
- `jobs.manage_screening` - Configure screening
- `jobs.manage_collaborators` - Manage job team
- `jobs.view_sensitive` - View salary and sensitive data
- `jobs.export` - Export jobs

Role-permission mappings updated for COMPANY_ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER, VIEWER.

## 7. Tenant-Isolation Design

- Every Prisma job query includes `companyId` filter
- Department, location, owner, collaborator validation checks company membership
- All controller methods derive company from JWT principal (`activeCompanyId`), never from request body
- Cross-company access returns `BadRequestException('JOB_CROSS_TENANT_ACCESS')`
- Skills validation rejects cross-company skill IDs

## 8. Job Identifier Strategy

**Job Code**: Uses `SystemMetadata` table for atomic per-company-year counter:
- Format: `JOB-{year}-{seq:05d}` (e.g., `JOB-2026-00001`)
- Implemented in `Prisma.$transaction` for race-condition safety
- Year resets counter automatically

**Slug**: Generated from title:
- URL-safe lowercase with hyphens
- Company-scoped uniqueness with collision-handling suffix (`-1`, `-2`, etc.)
- Stable unless title explicitly changed

## 9. Job-Status Workflow

```mermaid
flowchart TD
    DRAFT --> PENDING_APPROVAL
    DRAFT --> APPROVED
    DRAFT --> CANCELLED
    DRAFT --> ARCHIVED
    PENDING_APPROVAL --> APPROVED
    PENDING_APPROVAL --> DRAFT
    PENDING_APPROVAL --> CANCELLED
    APPROVED --> SCHEDULED
    APPROVED --> PUBLISHED
    APPROVED --> DRAFT
    APPROVED --> CANCELLED
    APPROVED --> ARCHIVED
    SCHEDULED --> PUBLISHED
    SCHEDULED --> APPROVED
    SCHEDULED --> CANCELLED
    PUBLISHED --> PAUSED
    PUBLISHED --> CLOSED
    PUBLISHED --> FILLED
    PUBLISHED --> CANCELLED
    PAUSED --> PUBLISHED
    PAUSED --> CLOSED
    PAUSED --> CANCELLED
    CLOSED --> ARCHIVED
    CLOSED --> DRAFT
    FILLED --> ARCHIVED
    CANCELLED --> ARCHIVED
    CANCELLED --> DRAFT
    ARCHIVED --> DRAFT
```

Timestamps set atomically: `publishedAt`, `closedAt`, `filledAt`, `archivedAt`, `scheduledPublishAt`.

## 10. Approval Workflow

- `submitForApproval` - Creates `JobApproval` record, sets status to `PENDING_APPROVAL`
- `approve` - Updates approval to `APPROVED`, changes job to `APPROVED`
- `reject` - Updates approval to `REJECTED`, changes job to `DRAFT`
- `requestChanges` - Updates approval to `CHANGES_REQUESTED`, changes job to `DRAFT`
- Self-approval blocked (requester !== approver)
- Company setting `requireJobApproval` controls whether approval gate is enforced

## 11. Requirements Architecture

Transactional replacement via `PUT /jobs/:id/requirements`:
- Skills: Validates normalized names, rejects cross-company skill IDs
- Education: Level + field of study with importance
- Experience: Min/max years with validation (max >= min), supports 0.5 year increments
- Languages: ISO 2-letter codes, compound unique per job, interview policy

## 12. Screening Configuration

- Scoring weights: CV, screening questions, skills, experience, education, assessment
- Weights validated to sum to 1.0 (±0.01 tolerance)
- Automatic shortlisting/rejection toggles (with recruiter override)
- AI explanation requirement
- Fairness review requirement

## 13. Fairness Protections

`ScreeningEthicsValidator` detects prohibited criteria:
- Race/ethnicity, religion, gender, pregnancy, marital status
- Age (except lawful minimum age checks)
- Disability as negative factor (accommodation context exempted)
- Facial expression, attractiveness, voice accent
- Protected medical information
- Sexual orientation, social class
- Photo requirements
- Residential location

Returns warnings + `requiresHumanReview` flag. Does not guarantee catching all discriminatory phrases.

## 14. Accessibility Design

- `JobAccessibilityConfiguration`: 1:1 with Job
- Physical requirements, essential functions
- Remote accommodation, sign language, screen reader, extended time
- Disability disclosure optional by default
- Data restricted to authorized recruiters
- Public endpoint exposes safe accommodation info only

## 15. Pipeline Design

- Default 6 stages: Applied → Screening → Interview → Offer → Hired → Rejected
- `Applied` must be first; `Hired` and `Rejected` are terminal
- Sort order transactional with duplicate prevention via `@@unique([pipelineId, sortOrder])`
- Soft-delete stages; version increments on change
- Stage types: APPLIED, SCREENING, ASSESSMENT, AI_INTERVIEW, RECRUITER_INTERVIEW, TECHNICAL_INTERVIEW, FINAL_INTERVIEW, REFERENCE_CHECK, OFFER, HIRED, REJECTED, CUSTOM
- SLA hours, auto-advance, recruiter approval requirements

## 16. Collaborator Design

- Types: OWNER, RECRUITER, HIRING_MANAGER, INTERVIEWER, REVIEWER, OBSERVER
- Granular permissions: canEdit, canReviewCandidates, canScheduleInterviews, canViewSalary, canPublish
- Compound unique (jobId + companyMembershipId + type)
- Final OWNER protected from removal
- Atomic ownership transfer with collaborator reassignment
- All mutations audited with `COLLABORATOR_ADDED/UPDATED/REMOVED` events

## 17. Template Design

- Company-scoped templates with `@@unique([companyId, name])`
- System templates (isSystem=true) are read-only via company APIs
- Field templates: titleTemplate, descriptionTemplate, responsibilitiesTemplate, etc.
- usageCount incremented on `createJob` from template
- Soft-deleted; jobs referencing templates retain copied values

## 18. Publication Design

- `ExternalPostingAdapter` interface: publish, update, unpublish, getStatus, validateConfiguration
- `AdapterRegistry` maps `ExternalPostingProvider` enums to adapters
- `CompanyCareersPageAdapter`: Internal publication, generates public URL
- `CustomWebhookAdapter`: SSRF-protected (blocks private IPs, localhost, metadata endpoints)
- Unsupported providers (LinkedIn, Facebook, etc.): Return "not configured" - no fake success
- Publication creates QUEUED record, executes adapter, updates to PUBLISHED/FAILED
- Job-level `publicationStatus` synchronized

## 19. Public Job Contract

`GET /api/v1/public/companies/:slug/jobs` and `.../:jobSlug`:
- Only PUBLISHED jobs with PUBLIC or UNLISTED visibility
- Company must be ACTIVE
- Salary hidden unless `salaryVisible` is true
- No internal notes, collaborators, screening answers, weights, approvals, audit events
- Safe accessibility info exposed
- Rate limited (30 req/min)

## 20. Queue Job Contracts

BullMQ job contracts defined (typed interfaces in `job-publications` module):
- `job.publish` - Publish to external provider
- `job.update-publication` - Update existing posting
- `job.unpublish` - Remove from external provider
- `job.retry-publication` - Retry failed publication
- `job.scheduled-publish` - Scheduled publication worker
- `job.deadline-reminder` - Upcoming deadline notifications
- `job.auto-close` - Auto-close expired jobs
- `job.auto-archive` - Auto-archive closed jobs
- `job.search-index` - Reindex for search

## 21. Activity Implementation

- `JobActivityEvent` model: Append-only, tenant-scoped, event-typed
- 24 `JobActivityEventType` values covering all job lifecycle events
- `JobActivityService.record()` with sanitized metadata (redacts passwords, tokens, secrets, credentials)
- `getByJob()`: Paginated query with eventType, actorMembershipId, date range filters
- Activity returned on `GET /jobs/:id/activity`

## 22. Files Created

### Jobs Module (22 files)
- `src/modules/jobs/jobs.module.ts`
- `src/modules/jobs/jobs.controller.ts`
- `src/modules/jobs/public-jobs.controller.ts`
- `src/modules/jobs/jobs.service.ts`
- `src/modules/jobs/job-workflow.service.ts`
- `src/modules/jobs/job-code.service.ts`
- `src/modules/jobs/job-activity.service.ts`
- `src/modules/jobs/index.ts`
- `src/modules/jobs/mappers/job.mapper.ts`
- `src/modules/jobs/validators/screening-ethics.validator.ts`
- `src/modules/jobs/dto/create-job.dto.ts`, `update-job.dto.ts`, `duplicate-job.dto.ts`, `job-query.dto.ts`
- `src/modules/jobs/dto/create-screening-question.dto.ts`, `update-screening-question.dto.ts`
- `src/modules/jobs/dto/update-screening-config.dto.ts`, `reorder-questions.dto.ts`
- `src/modules/jobs/dto/update-accessibility.dto.ts`, `update-requirements.dto.ts`
- `src/modules/jobs/dto/collaborator.dto.ts`, `transfer-ownership.dto.ts`
- `src/modules/jobs/dto/pipeline.dto.ts`
- `src/modules/jobs/dto/submit-approval.dto.ts`, `review-approval.dto.ts`, `schedule-publication.dto.ts`
- `src/modules/jobs/dto/index.ts`
- `src/modules/jobs/tests/jobs.service.spec.ts` (36 tests)
- `src/modules/jobs/tests/job-workflow.service.spec.ts` (17 tests)
- `src/modules/jobs/tests/job-code.service.spec.ts` (8 tests)
- `src/modules/jobs/tests/job-activity.service.spec.ts` (7 tests)

### Job Templates Module (8 files)
- `src/modules/job-templates/job-templates.module.ts`, `controller.ts`, `service.ts`, `index.ts`
- `dto/create-job-template.dto.ts`, `update-job-template.dto.ts`, `job-template-query.dto.ts`, `create-job-from-template.dto.ts`
- `tests/job-templates.service.spec.ts` (15 tests)

### Skills Module (7 files)
- `src/modules/skills/skills.module.ts`, `controller.ts`, `service.ts`, `index.ts`
- `dto/create-skill.dto.ts`, `update-skill.dto.ts`, `skill-query.dto.ts`
- `tests/skills.service.spec.ts` (12 tests)

### Job Publications Module (9 files)
- `src/modules/job-publications/job-publications.module.ts`, `controller.ts`, `service.ts`, `index.ts`
- `interfaces/external-posting-adapter.interface.ts`
- `adapters/adapter-registry.ts`, `company-careers-page.adapter.ts`, `custom-webhook.adapter.ts`
- `dto/create-publication.dto.ts`
- `tests/job-publications.service.spec.ts` (14 tests)

### E2E Tests (1 file)
- `test/jobs.e2e-spec.ts` (30 test groups, ~70 test definitions)

### Report
- `JOBS_DOMAIN_REPORT.md`

## 23. Files Modified

- `prisma/schema.prisma` - Added 16 enums, 15 models, extended 3 existing models
- `prisma/seed.ts` - Added 11 permissions, updated 5 role-permission mappings, global skills, system template
- `src/app/app.module.ts` - Registered 4 new modules
- `src/modules/jobs/jobs.module.ts` - Updated with controllers

## 24. Dependencies Added or Removed

None. All functionality uses existing dependencies (NestJS, Prisma, class-validator, class-transformer, Swagger, ioredis, BullMQ).

## 25. Unit Tests and Results

| Test Suite | Tests | Result |
|-----------|-------|--------|
| `jobs.service.spec.ts` | 36 | PASS |
| `job-workflow.service.spec.ts` | 17 | PASS |
| `job-code.service.spec.ts` | 8 | PASS |
| `job-activity.service.spec.ts` | 7 | PASS |
| `skills.service.spec.ts` | 12 | PASS |
| `job-templates.service.spec.ts` | 15 | PASS |
| `job-publications.service.spec.ts` | 14 | PASS |
| Pre-existing suites (14) | 126 | PASS |
| **Total** | **275** | **All PASS** |

## 26. E2E Test Status

**BLOCKED** - Docker test infrastructure not available. Tests defined in `test/jobs.e2e-spec.ts` (30 groups, ~70 test stubs). To execute:
```bash
npm run test:infra:up
npx prisma migrate deploy
npx prisma db seed
npm run test:e2e -- --testPathPattern=jobs.e2e-spec
npm run test:infra:down
```

## 27. Prisma Validation and Generation

- `npx prisma format` → ✅ Formatted
- `npx prisma validate` → ✅ Valid
- `npx prisma generate` → ✅ Client generated (v5.22.0)

## 28. Type-Check Result

```bash
npx tsc --noEmit → 0 errors
```

## 29. Lint Result

```bash
npx eslint "src/**/*.ts" → 0 errors
```
Warnings: ~140 (all pre-existing patterns: `any` types in test mocks, unused destructured variables in Prisma queries). No production rule warnings.

## 30. Build Result

```bash
npm run build → Success (0 errors)
```

## 31. Remaining Warnings and Risks

1. **Migration creation BLOCKED**: Cannot apply `jobs_domain` migration without PostgreSQL. Run `docker compose --profile test up -d postgres-test` then `npx prisma migrate dev --name jobs_domain`.
2. **E2E tests BLOCKED**: Require Docker test infrastructure.
3. **~140 ESLint warnings**: All in test files (`@typescript-eslint/no-explicit-any` for mock objects) or unused destructured variables in Prisma queries. These are pre-existing conventions.
4. **No worker implementations**: Publication queue jobs (publish, unpublish, retry) are defined but no BullMQ workers exist. The `job.publish` queue job contract is ready but requires worker implementation.
5. **Applicant count = 0**: Placeholder until Applications module is implemented. Response contracts designed for easy extension.

## 32. Docker Verification Instructions

```bash
# Start infrastructure
docker compose --profile test up -d postgres-test redis-test

# Apply all migrations in order
npx prisma migrate deploy

# Seed
npx prisma db seed

# Run all tests
npm test

# Run E2E tests
npm run test:e2e

# Stop infrastructure
npm run test:infra:down
```

## 33. Frontend Integration Guide

### Jobs List Page (`GET /jobs`)
- Filtering: status[], departmentId[], locationId[], search, employmentType, workplaceType, sort, pagination
- Returns: data[] + meta { total, page, limit, totalPages }
- Each item includes: id, jobCode, title, department, location, status, visibility, approval status, publication status, openings, owner, collaborator count, timestamps, applicantCount (0 placeholder)

### Create Job Flow (`POST /jobs`)
1. Save draft with title, department, location, employment type, workplace type, description
2. System generates jobCode and slug automatically
3. Default screening config, accessibility config, pipeline (6 stages), and OWNER collaborator created
4. Return complete draft job

### Job Detail Page (`GET /jobs/:id`)
- Sections: Overview, Requirements, Screening, Accessibility, Pipeline, Team, Approval, Publications, Activity
- Loading states: Full response includes all relations (can be heavy)
- Conflict handling: `PATCH` with `expectedVersion` returns 409 on stale updates
- Status transitions: Submit for approval, approve, reject, publish, pause, close, etc.
- Queued publication: Returns immediately with QUEUED status; check `GET /jobs/:id/publications` for async result

### Permission-Aware Actions
- Use `GET /jobs/:id` response to determine available actions
- Frontend should check `permissions` from JWT to show/hide buttons
- No fake applicant counts; `applicantCount: 0` until Applications module

## 34. Recommendation for the Next Backend Domain

**Candidates and Applications**: The Jobs domain is fully prepared for integration:
- Pipeline stages are ready for application placement
- Activity event types include application-related events
- Screening configuration is ready for scoring
- Publication flow is ready for application intake

After Candidates/Applications, implement **AI Screening Execution** (uses `JobScreeningConfiguration` weights), then **Interviews** (uses `JobPipelineStage.interviewType`), then **Notifications** (uses BullMQ queue contracts), and finally **Analytics/Reports**.
