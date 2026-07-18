# TalentAI — Interview Scheduling API (Phase 2.3)

## Architecture

Phase 2.3 implements the interview scheduling infrastructure as the foundation for the future AI Interview phase.

```
Application
    │
    ▼
Interview Scheduled ── (participants, reminders queued)
    │
    ▼ (reschedule, confirm, in-progress)
Interview Completed
    │
    ▼ (result recorded by recruiter)
Application Advances
```

**Key design decisions:**
- Interviews are tenant-scoped via `companyId` from `AuthenticatedPrincipal.activeCompanyId`
- Every state change is recorded in `InterviewHistory` (append-only)
- Notifications are queued via BullMQ — never block the scheduling workflow
- Meeting URLs are stored server-side; filtered from public responses
- AI interview type exists as a placeholder — no AI execution implemented

---

## Base URL

```
/api/v1
```

All endpoints require `Authorization: Bearer <accessToken>` unless marked `[PUBLIC]`.

---

## Database

### New Tables (Migration: `20260717143659_interview_scheduling_phase2_3`)

| Table | Purpose |
|---|---|
| `Interview` | Core interview record |
| `InterviewParticipant` | Members assigned to interview |
| `InterviewHistory` | Append-only audit trail of all changes |

### New Enums

| Enum | Values |
|---|---|
| `InterviewType` | PHONE, VIDEO, ONSITE, TECHNICAL, HR, PANEL, FINAL, AI (placeholder) |
| `InterviewStatus` | SCHEDULED, CONFIRMED, RESCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW, EXPIRED |
| `InterviewResult` | PASS, FAIL, HOLD, PENDING, NOT_RECORDED |
| `InterviewParticipantRole` | INTERVIEWER, HIRING_MANAGER, RECRUITER, CANDIDATE, PANELIST, OBSERVER, NOTE_TAKER, COORDINATOR |
| `InterviewParticipantStatus` | PENDING, CONFIRMED, DECLINED, CANCELLED, ATTENDED, NO_SHOW |
| `InterviewHistoryEventType` | INTERVIEW_SCHEDULED, RESCHEDULED, CONFIRMED, CANCELLED, STARTED, COMPLETED, NO_SHOW, RESULT_RECORDED, RESULT_CHANGED, PARTICIPANT_ADDED, PARTICIPANT_REMOVED, PARTICIPANT_STATUS_CHANGED, EXPIRED, UPDATED |

---

## Status Transitions

```
SCHEDULED → CONFIRMED → IN_PROGRESS → COMPLETED
    │                                      │
    ├── RESCHEDULED → (back to SCHEDULED)   └── (final)
    │
    ├── CANCELLED (terminal)
    │
    ├── NO_SHOW (terminal)
    │
    └── EXPIRED (terminal)
```

**Rules:**
- COMPLETED and CANCELLED are terminal — no further transitions
- RESCHEDULED can be re-rescheduled (returns to RESCHEDULED state)
- Completing a CANCELLED interview returns 400
- Human decides outcome — no automatic rejection

---

## Permissions

| Permission | Description | Default Roles |
|---|---|---|
| `interviews.create` | Schedule interviews | ADMIN, HR_MANAGER, RECRUITER |
| `interviews.read` | View interviews | All roles |
| `interviews.update` | Update details, add participants | ADMIN, HR_MANAGER, RECRUITER, INTERVIEWER |
| `interviews.cancel` | Cancel interviews | ADMIN, HR_MANAGER, RECRUITER |
| `interviews.reschedule` | Reschedule interviews | ADMIN, HR_MANAGER, RECRUITER |
| `interviews.complete` | Mark interviews completed | ADMIN, HR_MANAGER, RECRUITER, INTERVIEWER |
| `interviews.record_result` | Record outcome | ADMIN, HR_MANAGER, RECRUITER, INTERVIEWER |
| `interviews.manage_participants` | Add/remove participants | ADMIN, HR_MANAGER, RECRUITER |
| `interviews.review` | Review interviews | HIRING_MANAGER |

---

## API Reference

### POST /interviews

Schedule a new interview.

**Permission:** `interviews.create`

**Body:**
```json
{
  "applicationId": "uuid",
  "type": "TECHNICAL",
  "title": "Backend Engineer — Round 2",
  "description": "Whiteboard and system design",
  "scheduledAt": "2026-08-15T10:00:00.000Z",
  "durationMinutes": 90,
  "timezone": "Africa/Kampala",
  "jobPipelineStageId": "uuid",
  "location": "Meeting Room A",
  "meetingProvider": "Zoom",
  "meetingLink": "https://zoom.us/j/...",
  "notes": "Please prepare system design questions",
  "privateNotes": "Recruiter: this is a senior-level assessment",
  "language": "en",
  "participants": [
    { "membershipId": "uuid", "role": "INTERVIEWER", "isRequired": true }
  ]
}
```

**Validations:**
- `scheduledAt` must be in the future
- `durationMinutes` must be 5–480
- `timezone` is required
- `jobPipelineStageId` must belong to the application's job pipeline
- No duplicate active interview in the same pipeline stage

**Response:** Full interview object with participants and history.

---

### GET /interviews

List interviews (company-scoped).

**Query parameters:**
- `page`, `limit` (default 20, max 100)
- `status[]` — filter by status
- `type[]` — filter by type
- `applicationId`, `jobId`, `stageId`
- `scheduledFrom`, `scheduledTo` — ISO date range
- `sortBy` — `scheduledAt` | `createdAt` | `updatedAt` | `status`
- `sortOrder` — `asc` | `desc` (default: `asc`)

---

### GET /interviews/:interviewId

Get interview detail including participants and history.

**Note:** `privateNotes` is included for recruiter-facing requests. Must be filtered before any candidate-facing API is built.

---

### PATCH /interviews/:interviewId

Update non-lifecycle fields (title, description, location, meeting details, notes).

**Body:** `{ ...fields, expectedVersion: 1 }`

Returns 409 on stale version.

---

### POST /interviews/:interviewId/reschedule

**Permission:** `interviews.update`

**Body:**
```json
{
  "scheduledAt": "2026-08-20T14:00:00.000Z",
  "durationMinutes": 60,
  "timezone": "Africa/Kampala",
  "reason": "Candidate requested reschedule",
  "location": "Room B",
  "expectedVersion": 2
}
```

**Rules:**
- New time must be in the future
- Cannot reschedule COMPLETED or CANCELLED interviews
- Sets status to `RESCHEDULED`
- Records reason in `InterviewHistory`
- Queues `RESCHEDULED` notification

---

### POST /interviews/:interviewId/cancel

**Body:** `{ "reason": "Position filled", "expectedVersion": 2 }`

- Idempotent for already-cancelled interviews
- Cannot cancel a COMPLETED interview
- Queues `CANCELLED` notification

---

### POST /interviews/:interviewId/complete

**Body:**
```json
{
  "resultNotes": "Strong performance on system design",
  "resultReasonCode": "PASS_TECHNICAL",
  "expectedVersion": 3
}
```

Sets status to COMPLETED, records `completedAt`. Result remains `NOT_RECORDED` until explicitly updated.

---

### POST /interviews/:interviewId/participants

**Permission:** `interviews.update`

**Body:**
```json
{ "membershipId": "uuid", "role": "HIRING_MANAGER", "isRequired": false, "notes": "Optional reviewer" }
```

**Rules:**
- Participant must be an active member of the same company
- No duplicate participant (409 on duplicate)
- Cannot add to terminal-state interviews

---

### DELETE /interviews/:interviewId/participants/:participantId

**Permission:** `interviews.update`

Removes participant and records in `InterviewHistory`.

---

### GET /applications/:applicationId/interviews

Returns all interviews for a specific application (company-scoped).

---

## Queue Architecture

### BullMQ Queues

| Queue | Jobs | Purpose |
|---|---|---|
| `notifications` | `interview.notification` | All interview lifecycle notifications |
| `notifications` | `interview.reminder` | Scheduled reminders (24h, 2h, 15min) |
| `interview-reminder` | future | Dedicated reminder queue (registered, not yet used) |
| `interview-notification` | future | Dedicated notification queue (registered) |

### Reminder Schedule

When an interview is scheduled, reminders are queued for:
- 24 hours before
- 2 hours before
- 15 minutes before

Past offsets are skipped automatically.

### Mock Delivery

`MockNotificationProvider` — logs to console only. No SMTP, no Twilio, no Firebase.

To implement real delivery: inject a real provider via `NOTIFICATION_PROVIDER` token in `NotificationsModule`.

---

## Notification Provider Abstraction

```typescript
interface NotificationProvider {
  sendEmail(message: EmailMessage): Promise<void>;
  sendSms?(message: SmsMessage): Promise<void>;
  sendPush?(message: PushMessage): Promise<void>;
}
```

Inject any real provider:
```typescript
{ provide: NOTIFICATION_PROVIDER, useClass: SendGridProvider }
```

---

## Interview Templates

| Template ID | Event |
|---|---|
| `interview-scheduled` | Interview created/scheduled |
| `interview-reminder` | Reminder before interview |
| `interview-rescheduled` | Interview rescheduled |
| `interview-cancelled` | Interview cancelled |
| `interview-completed` | Interview completed |
| `application-status-changed` | Application status update |

---

## Tenant Isolation

- Every query includes `companyId: principal.activeCompanyId`
- Cross-company access returns 404 (no existence leak)
- Participants validated to be active members of the same company
- `privateNotes` must be filtered before any candidate-facing response
- Meeting passwords/IDs not exposed in public APIs

---

## Optimistic Concurrency

All mutations require `expectedVersion`. Returns 409 if stale:

```json
{
  "statusCode": 409,
  "code": "INTERVIEW_STALE_VERSION",
  "message": "Stale version",
  "currentVersion": 4
}
```

---

## Future AI Integration Points

The `InterviewType.AI` enum value is a placeholder. When AI interviews are implemented:

1. `Interview.configuration` (JSON) stores AI model parameters
2. `Interview.meetingProvider` stores the AI platform identifier
3. `InterviewParticipantRole.CANDIDATE` is used for the candidate participant
4. `InterviewHistory` records all AI-generated events
5. The `interview-notification` and `interview-reminder` queues are already registered
6. `ApplicationWorkflowService` handles result-to-pipeline stage mapping

**Stop conditions for AI phase:**
- No emotion detection
- No facial recognition
- No accent scoring
- No attractiveness scoring
- Human override of AI result is always available

---

## Known Limitations (Phase 2.3)

1. No real email/SMS delivery (mock only)
2. Reminder scheduling via delay queue not yet wired (offsets calculated but BullMQ delay not set)
3. No calendar integration (Google Calendar / Outlook)
4. No video platform webhook integration
5. No candidate-facing public confirmation endpoint yet
6. `InterviewResult` recording not wired to pipeline advancement (recruiter decides manually)
7. `IN_PROGRESS` state transition not automated
