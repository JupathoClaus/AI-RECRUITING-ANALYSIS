# TalentAI Backend

Enterprise-grade AI-powered Recruitment Management Platform Backend

## Architecture

This backend follows **Clean Architecture** principles with **Domain-Driven Design (DDD)** patterns. It's built with NestJS and TypeScript, ensuring type safety, dependency injection, and modular design.

### Key Architectural Decisions

- **Modular Structure**: Each business domain is isolated in its own module
- **Global Services**: Database, Redis, and Queue services are globally accessible
- **Layered Architecture**: Controllers → Services → Repositories → Database
- **Separation of Concerns**: Business logic separated from infrastructure

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | NestJS |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache | Redis |
| Queue | BullMQ |
| Authentication | JWT |
| Validation | class-validator |
| API Docs | Swagger |
| Logging | Pino |
| Container | Docker |

## Project Structure

```
src/
├── app/                    # Application module
│   └── app.module.ts
├── common/                 # Shared infrastructure
│   ├── base/              # Base classes (Entity, Repository, Service, Controller)
│   ├── decorators/        # Custom decorators
│   ├── enums/            # Enumerations
│   ├── constants/        # Constants
│   ├── filters/          # Exception filters
│   ├── guards/           # Auth & role guards
│   ├── interceptors/     # Logging, transform, cache interceptors
│   ├── pipes/            # Validation pipes
│   └── utils/            # Utility functions
├── config/                # Configuration
│   └── loaders/         # Config loaders (app, database, redis, jwt, security)
├── database/             # Database setup
│   └── prisma/          # Prisma service
├── modules/              # Business modules
│   ├── auth/            # Authentication
│   ├── users/           # User management
│   ├── companies/       # Company management
│   ├── departments/     # Department management
│   ├── recruiters/      # Recruiter management
│   ├── candidates/      # Candidate management
│   ├── jobs/            # Job postings
│   ├── applications/    # Job applications
│   ├── interviews/      # Interview scheduling
│   ├── assessments/     # Assessment tests
│   ├── pipeline/        # Recruitment pipeline
│   ├── notifications/   # Notifications
│   ├── reports/         # Reports
│   ├── analytics/       # Analytics
│   ├── activities/      # Activity logs
│   ├── files/           # File uploads
│   ├── settings/        # System settings
│   ├── ai/              # AI features
│   ├── redis/           # Redis service
│   └── queue/           # BullMQ queues
├── shared/               # Shared types and utilities
│   ├── types/           # TypeScript types
│   ├── interfaces/      # Interfaces
│   └── utils/           # Shared utilities
└── main.ts              # Application entry point
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose v2

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd AI-recruiter-Backend/backend
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Create and apply initial migration
npm run prisma:migrate:dev -- --name init

# Seed database (system roles, permissions, global skills)
npm run prisma:seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

### 5. Access API

- **API**: http://localhost:3000/api/v1
- **Swagger**: http://localhost:3000/api/docs

## Docker Setup

### Development with Docker

All commands must be run from the `backend/` directory.

```bash
# Start all services (PostgreSQL, Redis, Backend)
npm run docker:up

# View logs
npm run docker:logs

# Rebuild backend image (after dependency or migration changes)
npm run docker:build

# Recreate backend container with new image
docker compose up -d --force-recreate backend

# Stop all services
npm run docker:down
```

### Docker Services

| Service | Container Name | Port | Description |
|---------|---------------|------|-------------|
| Backend | talentai-backend | 3000 | NestJS API |
| PostgreSQL | talentai-postgres | 5432 | Database |
| Redis | talentai-redis | 6379 | Cache & Queue |

### Docker Image Details

The backend Docker image:
- Runs `npx prisma migrate deploy` at startup to apply pending migrations
- Includes `prisma/migrations/` in the image
- Requires rebuild (`docker compose build backend`) when migration files change

## Database

### Schema

32 models covering:
- **Auth & Identity**: users, roles, permissions, role-permission mappings, companies, departments, recruiters
- **Core Domain**: candidates, jobs, applications, interviews, assessments, pipelines
- **Supporting**: notifications, reports, analytics, activities, files, settings

### Migration Lifecycle

```bash
# Apply pending migrations (called automatically in Docker)
npm run prisma:migrate:deploy

# Create a new migration during development
npm run prisma:migrate:dev -- --name <migration_name>

# Validate Prisma schema
npm run prisma:validate

# Re-generate Prisma Client
npm run prisma:generate

# Format Prisma schema
npm run prisma:format
```

### Seed Data

```bash
# Seed system roles, permissions, role-permission mappings, and global skills
npm run prisma:seed
```

Current seed data: 7 roles, 49 permissions, 181 role-permission mappings, 21 global skills (idempotent).

### Database Verification

```bash
npm run verify:database
```
Runs 5 checks: SystemMetadata, roles presence, permissions count, role-permission mappings, global skills.

## Test Infrastructure

Separate PostgreSQL and Redis containers (tmpfs/ephemeral) for E2E testing.

```bash
# Start test infrastructure
npm run test:infra:up

# Stop test containers only (leaves dev containers running)
npm run test:infra:down
```

Test containers use ports 5433 (postgres-test) and 6380 (redis-test).

## Verification

### Infrastructure Verification

```bash
npm run verify:infrastructure
```
Starts test infra, applies migrations, seeds data, starts backend, runs health checks and E2E tests, then cleans up test containers only.

### Health Endpoints

| Endpoint | Expected Status | Purpose |
|----------|----------------|---------|
| `GET /api/v1/health/live` | 200 | Liveness probe |
| `GET /api/v1/health/ready` | 200 | Readiness probe |
| `GET /api/v1/health` | 200 | Full health (includes DB, Redis, Queue) |
| `GET /api/v1/health/version` | 200 | Version info |
| `GET /api/v1/auth/me` | 401 | Unauthenticated access |

## Environment Variables

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| APP_NAME | TalentAI | Application name |
| APP_PORT | 3000 | Server port |
| APP_ENV | development | Environment |
| APP_DEBUG | true | Debug mode |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | postgresql://... | PostgreSQL connection string |
| DATABASE_HOST | localhost | Database host |
| DATABASE_PORT | 5432 | Database port |
| DATABASE_USERNAME | postgres | Database user |
| DATABASE_PASSWORD | postgres | Database password |
| DATABASE_NAME | talentai | Database name |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| REDIS_HOST | localhost | Redis host |
| REDIS_PORT | 6379 | Redis port |
| REDIS_PASSWORD | | Redis password |
| REDIS_KEY_PREFIX | talentai: | Key prefix |

### JWT

| Variable | Default | Description |
|----------|---------|-------------|
| JWT_SECRET | | JWT secret key |
| JWT_EXPIRATION | 15m | Access token expiry |
| JWT_REFRESH_SECRET | | Refresh token secret |
| JWT_REFRESH_EXPIRATION | 7d | Refresh token expiry |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| CORS_ORIGIN | http://localhost:3001 | Allowed origin |
| RATE_LIMIT_TTL | 60000 | Rate limit window (ms) |
| RATE_LIMIT_MAX | 100 | Max requests per window |

## Development Workflow

### Adding a New Module

1. Create folder in `src/modules/<module-name>/`
2. Create module file: `<module-name>.module.ts`
3. Create service: `services/<module-name>.service.ts`
4. Create controller: `controllers/<module-name>.controller.ts`
5. Create DTOs: `dto/`
6. Create interfaces: `interfaces/`
7. Register module in `app.module.ts`

### API Endpoint Pattern

```typescript
@Controller('module')
@ApiTags('Module')
@UseGuards(JwtAuthGuard)
export class ModuleController {
  constructor(private readonly moduleService: ModuleService) {}

  @Get()
  @Public() // Optional: Skip auth
  async findAll(@Query() query: PaginationDto) {
    return this.moduleService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.moduleService.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  async create(@Body() createDto: CreateModuleDto) {
    return this.moduleService.create(createDto);
  }
}
```

### Testing

```bash
# Unit tests (275 tests across 21 suites)
npm run test

# E2E tests (7 live, 12 skipped, 89 todo across 2 suites)
npm run test:e2e

# E2E with CI flags (force exit, test env)
npm run test:e2e:ci

# Test coverage
npm run test:cov
```

### Code Quality

```bash
# Lint
npm run lint

# Format source code
npm run format

# Check formatting
npm run format:check

# TypeScript type check
npm run typecheck

# Prisma schema validation
npm run prisma:validate

# Prisma schema formatting
npm run prisma:format
```

## API Documentation

Swagger documentation is available at `/api/docs` when the server is running.

### Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Response Format

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {},
  "meta": {
    "total": 100,
    "skip": 0,
    "take": 10,
    "hasNext": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/resource"
}
```

## License

MIT
