# TalentAI — CompanyCandidate & Applications API

## Overview

Phase 2.2 introduces company-scoped candidate visibility, the CompanyCandidate relationship, and the full Applications domain.

**Key design principles:**
- All recruiter-facing requests derive company from `AuthenticatedPrincipal.activeCompanyId` (JWT). Never from request body.
- A global `Candidate` is the person. `CompanyCandidate` is the company-specific relationship.
- `Application` connects `Candidate` + `CompanyCandidate` + `Job` + pipeline stage.
- Sensitive fields gated behind `candidates.view_sensitive` permission.

---

## Base URL

```
/api/v1
```

All endpoints require `Authorization: Bearer <accessToken>` unless marked `[PUBLIC]`.

---

## Permissions Reference

| Permission | Description | Default Roles |
|---|---|---|
| `candidates.read` | List/view candidates (company-scoped) | ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER, VIEWER |
| `candidates.create` | Create global candidates | ADMIN, HR_MANAGER, RECRUITER |
| `candidates.update` | Update candidate profiles | ADMIN, HR_MANAGER, RECRUITER |
| `candidates.archive` | Archive/restore company candidate | ADMIN, HR_MANAGER, RECRUITER |
| `candidates.manage_tags` | Create/assign/remove tags | ADMIN, HR_MANAGER, RECRUITER |
| `candidates.manage_notes` | Add/edit candidate notes | ADMIN, HR_MANAGER, RECRUITER |
| `candidates.manage_company_profile` | Update rating, summary, owner | ADMIN, HR_MANAGER, RECRUITER |
| `candidates.view_sensitive` | See email, phone, DOB, salary | ADMIN only |
| `applications.create` | Create draft applications | ADMIN, HR_MANAGER, RECRUITER |
| `applications.read` | Read applications | ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER, VIEWER |
| `applications.update` | Update non-workflow fields | ADMIN, HR_MANAGER, RECRUITER |
| `applications.move` | Move application to stage | ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER |
| `applications.shortlist` | Shortlist | ADMIN, HR_MANAGER, RECRUITER |
| `applications.reject` | Reject (human required) | ADMIN, HR_MANAGER |
| `applications.restore` | Restore rejected | ADMIN, HR_MANAGER |
| `applications.withdraw` | Withdraw | ADMIN, HR_MANAGER, RECRUITER |
| `applications.hire` | Mark hired | ADMIN, HR_MANAGER |
| `applications.assign` | Assign members | ADMIN, HR_MANAGER, RECRUITER |
| `applications.view_screening_answers` | See screening answers | ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER |
| `applications.add_notes` | Add notes | ADMIN, HR_MANAGER, RECRUITER |
| `applications.delete_notes` | Delete own notes | ADMIN, HR_MANAGER, RECRUITER |
| `applications.manage_flags` | Add/resolve flags | ADMIN, HR_MANAGER, RECRUITER |
| `applications.override_ai` | Override AI decisions | ADMIN, HR_MANAGER |
| `pipeline.read` | View pipeline board | ADMIN, HR_MANAGER, RECRUITER, HIRING_MANAGER, VIEWER |

---

## Candidate Endpoints (Company-Scoped)

### GET /candidates

Returns only candidates linked to the active company via CompanyCandidate.

**Query parameters:**
- `page`, `limit` (default 20, max 100)
- `search` — name, email, headline, employer
- `status[]` — `ACTIVE`, `INACTIVE`, `BLOCKED`
- `source[]` — `CAREERS_PAGE`, `RECRUITER_CREATED`, etc.
- `skillId`, `languageCode`, `city`, `countryCode`
- `minimumExperience`, `maximumExperience`
- `sortBy` — `firstName`, `lastName`, `createdAt`, `updatedAt`, `status`
- `sortOrder` — `asc` | `desc`

**Response:** Paginated `{ data, meta }` with company-scoped candidates.

---

### POST /candidates/:candidateId/link

Creates a `CompanyCandidate` relationship for an existing global candidate.

**Permission:** `candidates.update`

**Body:**
```json
{ "source": "RECRUITER_CREATED", "ownerMembershipId": "uuid", "talentPoolEnabled": false }
```

**Response:** `CompanyCandidate` record.

---

### PATCH /candidates/:candidateId/company-profile

Updates company-specific candidate data. Does NOT modify global Candidate.

**Permission:** `candidates.manage_company_profile`

**Body:**
```json
{
  "ownerMembershipId": "uuid",
  "rating": 4.5,
  "internalSummary": "Strong fit for senior roles",
  "talentPoolEnabled": true,
  "doNotContact": false,
  "expectedVersion": 1
}
```

---

### POST /candidates/:candidateId/archive

Archives the **CompanyCandidate** only. The global Candidate remains active.

**Body:** `{ "expectedVersion": 1, "reason": "optional" }`

---

### POST /candidates/:candidateId/restore

Restores an archived CompanyCandidate.

---

## Candidate Tags

### GET /candidate-tags

Lists all active tags for the active company.

### POST /candidate-tags

Creates a new tag.
```json
{ "name": "Priority Hire", "type": "PRIORITY", "color": "#FF5733", "description": "..." }
```

### PATCH /candidate-tags/:tagId / DELETE /candidate-tags/:tagId

Update or soft-delete a tag.

### POST /candidates/:candidateId/tags

Assign tag to candidate.
```json
{ "tagId": "uuid" }
```

### DELETE /candidates/:candidateId/tags/:tagId

Remove tag assignment.

---

## Candidate Notes

### GET /candidates/:candidateId/notes

Returns visible notes (COMPANY-visibility to all with `candidates.read`, PRIVATE only to author).

### POST /candidates/:candidateId/notes

```json
{ "content": "Strong communicator", "visibility": "COMPANY" }
```

---

## Application Endpoints

### POST /applications

Creates a draft application.

**Permission:** `applications.create`

**Body:**
```json
{
  "candidateId": "uuid",
  "jobId": "uuid",
  "source": "RECRUITER_CREATED",
  "coverLetter": "...",
  "expectedSalaryMin": 5000000,
  "expectedSalaryMax": 8000000,
  "salaryCurrency": "UGX",
  "ownerMembershipId": "uuid",
  "screeningAnswers": [
    { "questionId": "uuid", "textAnswer": "5 years" }
  ]
}
```

**Behavior:**
- Creates or reuses `CompanyCandidate`.
- Generates `applicationNumber` (e.g. `APP-2026-000001`) atomically.
- Generates opaque `publicReference`.
- Returns `DRAFT` application.

---

### GET /applications

Company-scoped list.

**Query parameters:**
- `page`, `limit`
- `search` — applicationNumber, candidate name, job title
- `jobId[]`, `candidateId[]`, `status[]`, `stageId[]`
- `ownerMembershipId`, `assignedMembershipId`
- `source[]`, `submittedFrom`, `submittedTo`
- `hasActiveFlags` — boolean
- `archived` — boolean
- `sortBy` — `createdAt`, `submittedAt`, `applicationNumber`, `status`

---

### GET /applications/summary

Returns status counts (no row loading):
```json
{
  "total": 142, "draft": 5, "submitted": 30, "shortlisted": 12,
  "hired": 3, "rejected": 45, "withdrawn": 8,
  "byJob": [{ "jobId": "uuid", "count": 25 }]
}
```

---

### GET /applications/:applicationId

Returns full application detail including:
- candidate, companyCandidate, job
- pipeline stages
- stage history
- assignments
- notes (visibility-filtered)
- flags
- screening answers (no `expectedAnswer`)
- decisions (no hidden AI reasoning)
- tags

---

### PATCH /applications/:applicationId

Update non-workflow fields (cover letter, salary, availability). Requires `expectedVersion`.

---

## Application Workflow

All workflow actions require `expectedVersion` for optimistic concurrency.
409 response if version is stale — refresh and retry.

| Endpoint | Status transition | Permission |
|---|---|---|
| `POST /applications/:id/submit` | DRAFT → SUBMITTED | `applications.update` |
| `POST /applications/:id/move` | → stage (body: `toStageId`) | `applications.move` |
| `POST /applications/:id/shortlist` | → SHORTLISTED | `applications.shortlist` |
| `POST /applications/:id/reject` | → REJECTED (human required) | `applications.reject` |
| `POST /applications/:id/restore` | REJECTED → UNDER_REVIEW | `applications.restore` |
| `POST /applications/:id/hold` | → ON_HOLD | `applications.update` |
| `POST /applications/:id/withdraw` | → WITHDRAWN | `applications.withdraw` |
| `POST /applications/:id/mark-hired` | → HIRED | `applications.hire` |
| `POST /applications/:id/archive` | → ARCHIVED | `applications.update` |

---

## Screening Answers

### GET /applications/:id/screening-answers

Returns answers. **`expectedAnswer` is never exposed.**

### POST /applications/:id/screening-answers

Atomic upsert for multiple answers:
```json
{ "answers": [{ "questionId": "uuid", "textAnswer": "Yes, available immediately" }] }
```

---

## Assignments

### POST /applications/:id/assignments

```json
{ "membershipId": "uuid", "type": "RECRUITER" }
```

### POST /applications/:id/transfer-ownership

```json
{ "newOwnerMembershipId": "uuid" }
```

---

## Flags

### POST /applications/:id/flags

```json
{ "type": "MISSING_INFORMATION", "severity": "MEDIUM", "description": "..." }
```

Flags do **not** auto-reject. Human review required.

### POST /applications/:id/flags/:flagId/resolve

```json
{ "resolutionNotes": "Verified — candidate confirmed phone number" }
```

---

## Decisions & Human Override

### POST /applications/:id/decisions

Human decision:
```json
{
  "type": "SHORTLIST",
  "explanation": "Strong background in backend engineering",
  "reasonCode": "TECH_FIT",
  "finalDecision": true
}
```

### POST /applications/:id/decisions/:decisionId/override

Override an AI recommendation:
```json
{
  "type": "ADVANCE",
  "explanation": "Recruiter assessment overrides AI score",
  "reasonCode": "HUMAN_REVIEW"
}
```

Rules:
- Human decisions can be final.
- AI decisions are never final by default.
- Override creates a new decision linked to the original.
- Original decision is immutable.
- No hidden chain-of-thought in explanation.
- No protected-attribute reasoning.

---

## Pipeline Board

### GET /pipeline/jobs/:jobId

Returns applications grouped by pipeline stage. No fake AI scores.

```json
{
  "jobId": "uuid",
  "pipeline": { "id": "uuid", "name": "Default Pipeline" },
  "stages": [
    {
      "id": "uuid", "name": "Applied", "type": "APPLIED", "sortOrder": 0,
      "applications": [
        {
          "id": "uuid", "applicationNumber": "APP-2026-000001",
          "status": "SUBMITTED",
          "candidate": { "displayName": "Alice Shared", "headline": "..." },
          "owner": { "id": "uuid" },
          "tags": [{ "name": "Priority Hire", "color": "#FF5733" }],
          "flags": [{ "type": "MISSING_INFORMATION", "severity": "LOW" }],
          "version": 3
        }
      ]
    }
  ]
}
```

### POST /pipeline/jobs/:jobId/move

```json
{ "applicationId": "uuid", "fromStageId": "uuid", "toStageId": "uuid", "expectedVersion": 3 }
```

Returns 409 on stale version. Frontend should refresh the board and retry.

---

## Bulk Actions

The generic `POST /applications/bulk` endpoint was removed: it returned a
fabricated per-item `{ success: true }` without executing any action. Bulk
recruiter operations are handled by the dedicated, implemented endpoints:

### POST /ai-screenings/bulk

Requests AI screening for multiple applications in one call. See the AI
screening API documentation for the request/response contract.

---

## Public Application [PUBLIC]

### POST /public/companies/:companySlug/jobs/:jobSlug/applications

No authentication required. Rate limited.

**Body:**
```json
{
  "idempotencyKey": "uuid-v4",
  "firstName": "Bob", "lastName": "Omondi",
  "email": "bob@example.com", "phone": "+256700123456",
  "coverLetter": "...",
  "preferredLanguage": "en",
  "source": "CAREERS_PAGE",
  "consentConfirmed": true,
  "screeningAnswers": [{ "questionId": "uuid", "textAnswer": "3 years" }]
}
```

**Response (safe — no internal IDs):**
```json
{ "publicReference": "3f2a9b1c...", "status": "submitted" }
```

Security:
- Published job only.
- Deadline validated.
- No `expectedAnswer` exposure.
- No recruiter-only fields in response.
- Idempotent on duplicate submission (generic response).

### GET /public/applications/:publicReference/status

Returns safe, candidate-facing status only:
```json
{ "status": "under_review", "submittedAt": "2026-07-17T..." }
```

Safe status mapping: `received` | `under_review` | `in_progress` | `closed` | `withdrawn`

No internal pipeline stages, scores, recruiter notes, or rejection reasons exposed.

---

## Optimistic Concurrency

All mutations that change state require `expectedVersion`.

If the application was modified by another user, the API returns:
```json
{
  "statusCode": 409,
  "code": "APPLICATION_STALE_VERSION",
  "message": "Application was modified. Refresh and retry.",
  "currentVersion": 4
}
```

Frontend pattern for pipeline drag-and-drop:
1. Read board (capture `version` per card)
2. POST `/pipeline/jobs/:jobId/move` with `expectedVersion`
3. On 409: re-fetch the board and present conflict to user

---

## Tenant Isolation

- Every API response is scoped to `activeCompanyId` from JWT.
- Company A cannot see Company B's candidates, notes, tags, or applications.
- Cross-company access returns 404 (not 403) to avoid leaking record existence.
- A global `Candidate` (email/phone match) may be linked to both companies independently with separate `CompanyCandidate` records.

---

## Known Limitations (Phase 2.2)

1. No resume/file upload yet.
2. No email notifications on application status changes.
3. No AI screening execution — `finalDecision: false` for AI actor decisions.
4. No interview scheduling.
5. No assessments.
6. No bulk export.
7. No full-text search (uses ILIKE).
8. Public application rate limiting uses global throttler — dedicated per-route rate limiting planned.
