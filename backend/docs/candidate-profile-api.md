# Candidate Profile API

## Overview

Candidates are **global** profiles not owned by any single company. A `CompanyCandidate` join model will be implemented in a future phase to enable company-specific candidate association, pipeline tracking, and tenant isolation.

## Base URL

```
/api/v1/candidates
```

All endpoints require `Authorization: Bearer <accessToken>` header.

## Permissions

| Permission | Description | Default Roles |
|---|---|---|
| `candidates.read` | List, search, view profiles | ADMIN, RECRUITER, HIRING_MANAGER |
| `candidates.create` | Create candidates | ADMIN, RECRUITER |
| `candidates.update` | Update candidate profiles | ADMIN, RECRUITER |
| `candidates.archive` | Archive/restore candidates | ADMIN, RECRUITER |
| `candidates.block` | Block/unblock candidates | ADMIN only |
| `candidates.merge` | Merge candidates | ADMIN only |
| `candidates.view_sensitive` | View email, phone, salary, DOB | ADMIN only |
| `candidates.delete` | Delete candidates | ADMIN only |

## Endpoints

### Create Candidate

```
POST /api/v1/candidates
```

At least `email` or `phone` is required. Duplicates are checked before creation.

**Request body:** `CreateCandidateDto`

### List Candidates

```
GET /api/v1/candidates?page=1&limit=20&search=john&status=ACTIVE&sortBy=createdAt&sortOrder=desc
```

**Query parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `search` — full-text search on name, email, headline, employer
- `status` — array of statuses
- `source` — array of sources
- `skillId`, `languageCode`, `city`, `countryCode`, `currentJobTitle`, `currentEmployer`
- `minimumExperience`, `maximumExperience`
- `willingToRelocate`
- `createdFrom`, `createdTo`, `updatedFrom`, `updatedTo`
- `archived` — if true, returns only INACTIVE/BLOCKED candidates
- `sortBy` — one of: `firstName`, `lastName`, `createdAt`, `updatedAt`, `totalExperienceYears`, `currentJobTitle`, `status`
- `sortOrder` — `asc` or `desc` (default: `desc`)

**Response:** Paginated list with `{ data, meta }` structure.

By default, `email` and `phone` are excluded from list responses. Only users with `candidates.view_sensitive` permission see them.

### Get Candidate by ID

```
GET /api/v1/candidates/:candidateId
```

Returns full candidate detail including skills, employment, education, certifications, languages, consents, and merge records. Sensitive fields (`email`, `phone`, `alternatePhone`, `dateOfBirth`, `salaryExpectation*`, `salaryCurrency`) are gated behind `candidates.view_sensitive`.

### Update Candidate

```
PATCH /api/v1/candidates/:candidateId
```

**Request body:** `UpdateCandidateDto` (all fields optional except `expectedVersion`)

Uses optimistic concurrency control via `expectedVersion`. Returns `409 CONFLICT` if version is stale or contact info matches another candidate (self excluded).

### Status Management

| Action | Endpoint | Permission |
|---|---|---|
| Archive | `POST /candidates/:id/archive` | `candidates.archive` |
| Restore | `POST /candidates/:id/restore` | `candidates.archive` |
| Block | `POST /candidates/:id/block` | `candidates.block` |
| Unblock | `POST /candidates/:id/unblock` | `candidates.block` |

All require `{ expectedVersion: number }`. Archive/Restore are idempotent. Block/Unblock are idempotent.

### Duplicate Detection

```
GET /api/v1/candidates/:candidateId/duplicates
```

Returns exact and potential duplicate candidates. Uses email/phone exact matching and name+employer fuzzy matching.

### Merge

```
POST /api/v1/candidates/merge-preview
{ "primaryCandidateId": "...", "mergedCandidateId": "..." }

POST /api/v1/candidates/merge
{
  "primaryCandidateId": "...",
  "mergedCandidateId": "...",
  "expectedPrimaryVersion": 1,
  "expectedMergedVersion": 1,
  "reason": "...",
  "fieldResolution": { "email": "primary", "phone": "merged" }
}
```

Merge process:
1. Validates both candidates exist and are not merged/deleted/anonymized
2. Checks version freshness
3. Within a transaction: copies unique sub-records from merged to primary, deletes conflicting language/skill records on merged to avoid unique constraint violations, merges fields (primary wins unless `fieldResolution` specifies `merged`), marks merged candidate as `MERGED`, creates merge record and audit events
4. Returns the updated primary candidate

### Activity History

```
GET /api/v1/candidates/:candidateId/activity?page=1&limit=20&eventType=CANDIDATE_UPDATED
```

Returns paginated audit events ordered by `occurredAt` (descending).

### Sub-resources

All sub-resources require the candidate to exist and not be merged/deleted/anonymized.

| Resource | Endpoints | Permission |
|---|---|---|
| Skills | `GET/POST /candidates/:id/skills`, `PATCH/DELETE /candidates/:id/skills/:skillId` | Read/Update |
| Employment | `GET/POST /candidates/:id/employment`, `PATCH/DELETE /candidates/:id/employment/:empId`, `POST /candidates/:id/employment/reorder` | Read/Update |
| Education | `GET/POST /candidates/:id/education`, `DELETE /candidates/:id/education/:eduId`, `POST /candidates/:id/education/reorder` | Read/Update |
| Certifications | `GET/POST /candidates/:id/certifications`, `DELETE /candidates/:id/certifications/:certId` | Read/Update |
| Languages | `GET/POST /candidates/:id/languages`, `POST /candidates/:id/languages/:langId/set-preferred`, `DELETE /candidates/:id/languages/:langId` | Read/Update |
| Consents | `GET /candidates/:id/consents`, `POST /candidates/:id/consents/grant`, `POST /candidates/:id/consents/:consentId/revoke` | Read/Update |

## DTOs

### CreateCandidateDto

- `firstName` (required)
- `lastName` (required)
- `email` or `phone` (at least one required)
- All other fields optional: `middleName`, `alternatePhone`, `city`, `stateOrProvince`, `countryCode`, `postalCode`, `headline`, `summary`, `currentJobTitle`, `currentEmployer`, `totalExperienceYears`, `preferredLocale`, `timezone`, `source` (required enum), `sourceDetail`, social URLs, relocation preferences, salary fields, `noticePeriodDays`, `availableFrom`, `skills[]`, `languages[]`

### UpdateCandidateDto

Same fields as `CreateCandidateDto` but all optional, plus required `expectedVersion` for optimistic concurrency.

### CandidateQueryDto

Standard pagination + filter fields. See List Candidates section.

## Optimistic Concurrency

All mutations use `expectedVersion` to prevent lost updates. If the candidate's `version` field doesn't match the request, `409 CONFLICT` is returned with `currentVersion`.

## Sensitive Data

The following fields are only returned when the requesting user has `candidates.view_sensitive`:
- `email`, `phone`, `alternatePhone`
- `dateOfBirth`
- `salaryExpectationMin`, `salaryExpectationMax`, `salaryCurrency`

## Duplicate Behavior

- Exact duplicates: same normalized `email` or `phone` → creation blocked with `409 CONFLICT` and duplicate details
- Potential duplicates: same name + similar contact or employer → creation allowed with warning
- Update self-exclusion: when updating, the candidate being updated is excluded from duplicate matching to prevent false positives

## Known Limitations

1. **No Company Ownership**: Candidates are global. `CompanyCandidate` model is planned for the next phase.
2. **No Applications**: Application/pipeline linking is not yet implemented.
3. **No Full-text Search**: Uses `contains` with `insensitive` mode (ILIKE equivalent). Full-text search (tsvector) is planned.
4. **No AI Features**: AI matching, ranking, and parsing are not yet available.
5. **No File Attachments**: Document/resume upload is not yet supported.
6. **No Bulk Operations**: Bulk import, export, and batch updates are planned.
7. **No Email Verification**: Candidate email addresses are not verified.
8. **No Duplicate Merging**: Auto-merge on creation detection is not implemented.
