# Architectural Decisions

**Last Updated:** 2026-10-26

## Confirmed Principles

### Core Business
- **AI assists hiring** - AI provides evaluation/screening assistance; authorized humans (recruiters/HR managers) make final hiring decisions. (Confirmed)
- **Tenant isolation** - All data scoped by company/tenant. Guards and queries enforce isolation. (Confirmed)
- **Auditability** - Actions affecting hiring decisions must be traceable. (Confirmed)
- **Data protection** - Handle applicant data carefully, no PII in logs. (Confirmed)
- **Reliability** - Graceful degradation, proper error handling. (Confirmed)

### Architecture
- **Modular monolith preferred** - NestJS modular architecture with clear boundaries. Avoid unnecessary microservices. (Confirmed)
- **TypeScript strictness** - Type safety important; watcher TS issues indicate type resolution complexity.
- **Prisma ORM** - PostgreSQL with Prisma for type-safe DB access. (Confirmed)
- **BullMQ queues** - Background jobs for emails, processing, screening, etc. (Confirmed)
- **JWT auth** - Token-based auth with role/permission guards. (Confirmed)

### Development Practices
- **Evidence over claims** - All milestones require verifiable evidence.
- **Preserve existing work** - Never discard uncommitted changes.
- **Safe handoffs** - Control system enables interruption-safe work.
- **Local-first testing** - Use local test DB/infra, mock external providers by default.
- **No production data** - Never touch real applicant data.

## Existing Verified Decisions

### Public Application Flow (2026-10-26)
- **multipart screeningAnswers parsing** - Use `plainToInstance` in DTO transform for multipart/form-data. (Implemented, tested)
- **Duplicate CV cleanup** - Clean up orphaned duplicate CVs on submission failure/retry paths. (Implemented, tested)
- **E2E upload isolation** - Use per-process unique temp dirs via `fs.mkdtempSync(os.tmpdir()/talentai-e2e-uploads-)`, preserve caller-supplied UPLOAD_DIR only if outside backend/uploads, enforce before Nest config. (Implemented, tested)

### Watcher TS2688 Resolution (2026-10-26)
- **Root cause:** Concurrent root npm ci installed @types while Nest watcher started, causing TS to auto-include ancestor node_modules/@types. Stale incremental/watch state.
- **Resolution:** Controlled restart of watcher process tree. No tsconfig/dependency changes. Fresh compiles pass.
- **Prevention:** If recurs, restart watcher; only change config if approved with evidence.

## Unresolved Decisions
- **Email provider** - SMTP local only, no real provider configured/verified
- **AI providers** - Using mocks; need to decide on real providers, costs, fallbacks
- **Tavus integration** - Disabled, not verified
- **Production deployment strategy** - Not determined
- **Load testing approach** - Needed before scaling claims
- **Public careers page** - Backend exists but frontend portal not built (separate from API)
- **Horizontal scaling** - Deferred until pilot needs

## Assumptions
- Test infrastructure (postgres-test:5433, redis-test:6380) available as configured
- Dev infra (postgres:5432, redis:6379) available
- Node modules installed
- No external network dependencies for local tests (using mocks)
- Windows PowerShell environment
