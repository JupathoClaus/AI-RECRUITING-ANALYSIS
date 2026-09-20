# TalentAI recruitment workspace refactor

## Implemented

- Premium monochrome design-token foundation, light/dark equivalents, shared shell, focus styles, skip link, responsive sidebar synchronization, and consolidated recruiter navigation.
- First-class `/applications` route backed by the existing paginated application API. It supports server search, job/status/source/stage/date filters, sorting, selection, bulk screening, real batch progress, loading, empty, and retry states.
- `/applications/[applicationId]` application workspace bringing the application, candidate, job, stage history, notes, and completed AI screening evidence together.
- `/jobs/[jobId]` contextual workspace with overview, applications, pipeline, screening, interviews, and analytics routes. Analytics deliberately shows an unavailable state because no truthful job aggregate endpoint exists.
- `/candidates/[candidateId]` candidate profile separating candidate data from application records, experience, skills, activity, and each job-specific application.
- Global candidates now use server pagination and server search. Primary list navigation opens the candidate profile rather than the legacy detail dialog.
- Global human interviews use the existing server pagination endpoint and now support server-side search and type filtering.
- AI interviews use a new tenant-scoped paginated backend contract instead of the former fixed 100-record fetch. The recruiter UI uses 20-record pages and accepts the old array shape during a rolling deployment.
- AI screening remains connected to the real queue-backed workflow. No client-side fake progress was added.
- Interview PASS/HOLD/FAIL outcomes are no longer transformed into fabricated numeric scores. They are shown as recruiter-recorded outcomes.
- Jobs use stored salary currency in the updated job-card surface rather than hardcoding USD.
- The dashboard defers non-critical analytics requests so recruitment data becomes visible before report widgets.
- Legacy global pipeline uses monochrome stages; the contextual job pipeline is the primary operational experience.
- The former static AI chat is now an explicit non-conversational feature guide. It cannot simulate live responses or actions.

## Routes added

- `/applications`
- `/applications/[applicationId]`
- `/jobs/[jobId]`
- `/jobs/[jobId]/applications`
- `/jobs/[jobId]/pipeline`
- `/jobs/[jobId]/screening`
- `/jobs/[jobId]/interviews`
- `/jobs/[jobId]/analytics`
- `/candidates/[candidateId]`

## Backend additions

- `AiInterviewQueryDto` and paginated `GET /ai-interviews?page=&limit=`.
- `GET /interviews` now accepts `search`, scoped to interview title, job title, and candidate name.

## Verification

- Frontend TypeScript check: passed.
- Backend TypeScript check: passed.
- AI Interview page test file: 7/7 passed after pagination compatibility handling.
- Full Vitest and production build need a longer command window than this environment permits; both were stopped at the 120-second runner limit.

## Requires backend support

- Candidate filtering by application stage/job/rating as true server-side predicates.
- AI Interview search/filter parameters beyond pagination.
- A job-level aggregate endpoint for truthful overview and analytics KPIs.
- Application-level screening/interview-state filters in the applications query.

## Known regression baseline

The existing Jobs salary test expects USD while its fixture stores `UGX`. The current product behavior correctly respects stored currency; the test expectation should be updated with locale-tolerant UGX formatting. No production behavior should be changed back to hardcoded USD solely to satisfy it.
