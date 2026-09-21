# TalentAI — Feature Access Map (Phase 1)

How every feature/capability is reached after the Phase 1 information-architecture
consolidation. Route column = the URL. Entry column = how a user gets there,
with the decision labeled (primary nav / hub / workspace / contextual / header).
Nothing in this table was removed in Phase 1 — every row is reachable.

## Hiring

| Feature | Route | Entry |
|---|---|---|
| Jobs list (active/history, create, publish, reopen) | `/jobs` | Hiring → Jobs |
| Job workspace — Overview (counts, summary) | `/jobs/[jobId]` | Jobs → row click; Hiring hub → open positions |
| Job workspace — Applications | `/jobs/[jobId]?section=applications` | Workspace tab |
| Job workspace — Pipeline | `/jobs/[jobId]?section=pipeline` | Workspace tab |
| Job workspace — Screening | `/jobs/[jobId]?section=screening` | Workspace tab |
| Job workspace — Interviews | `/jobs/[jobId]?section=interviews` | Workspace tab |
| Job workspace — Job Analytics | `/jobs/[jobId]?section=analytics` | Workspace tab (contextual — not a nav item) |
| Applications (all, server-side filter/search/sort/page) | `/applications` | Hiring → Applications |
| Application review workspace (resume, screening, stage, actions) | `/applications/[applicationId]` | Applications → row click |
| Bulk AI screening (selection batch, live progress) | `/applications` · `/candidates` | Selection toolbar → Run AI Screening |
| Candidates (list, filters, search, sort, page) | `/candidates` | Hiring → Candidates |
| Candidate detail (profile, applications, activity) | `/candidates/[candidateId]` | Candidates → row click |
| Add candidate (atomic workflow, resume upload) | `/candidates` (dialog) | Header action "Add Candidate" |
| Candidate contextual bulk actions (stage move, interview, reject) | `/candidates` | Selection toolbar |
| **Compare candidates (2–4, evidence-based)** | `/candidates/compare?ids=…` | Selection toolbar → Compare (NEW) |
| Pipeline kanban (all positions / per job) | `/pipeline` | Hiring → Pipeline |
| Pipeline stage management (add/edit/delete) | `/pipeline` | Pipeline dropdown/actions |
| AI Screener (single-candidate screening run) | `/ai-screener?applicationId=…` | Candidate detail → Start AI Screening; also via `?applicationId` deep link |
| Screening workflow (upload, extract, result) | `/ai-screener` | AI Screener page state machine |
| Screening result detail (criteria, evidence, risks) | embedded | `screening-result-view.tsx` in workspace/detail |

## Interviews

| Feature | Route | Entry |
|---|---|---|
| Human Interviews (schedule, reschedule, cancel, record result) | `/interviews` | Interviews → Human Interviews |
| AI Interviews (create, send, cancel, regenerate code) | `/ai-interviews` | Interviews → AI Interviews |
| AI interview detail (session, transcript, recording) | `/ai-interviews` (dialog) | Row → detail dialog |
| Candidate interview journey (public, code-gated) | `/interview/…` | From invitation link (out of workspace scope) |

## Reports & analytics

| Feature | Route | Entry |
|---|---|---|
| Recruitment Reports (8 views, filters, CSV export) | `/reports` | Reports → Recruitment Reports |
| Pipeline Analytics (company-wide charts + insights) | `/analytics` | Reports → Pipeline Analytics |
| Job Analytics | `/jobs/[jobId]?section=analytics` | Inside a job workspace (contextual) |

## Organization & account

| Feature | Route | Entry |
|---|---|---|
| Settings hub (profile/company/notifications/ai-settings/integrations/security) | `/settings` | Organization → Settings |
| Profile (name, email, role, password) | `/settings` (profile tab) | Settings → Profile |
| Company profile (name, website, locations, AI interviewer personality) | `/settings` (company tab) | Settings → Company |
| Team & roles, members, departments, invitations | `/company` | Settings → Company profile tab → "Manage team & roles" (route preserved; not primary nav) |
| Notification preferences | `/settings` (notifications tab) | Settings → Notifications |
| AI settings (screening model/prompt controls) | `/settings` (ai-settings tab) | Settings → AI settings |
| Integrations | `/settings` (integrations tab) | Settings → Integrations |
| Security (sessions, role guard) | `/settings` (security tab) | Settings → Security |

## Notifications (moved out of the sidebar)

| Feature | Route | Entry |
|---|---|---|
| Notification drawer (recent 12, mark-read, mark-all) | header overlay | Bell icon in top nav — **NEW drawer** |
| Full notification history (grouped by day, filters) | `/notifications` | Drawer → "View all"; direct link still resolves |
| Unread badge | — | Bell badge via `notification-store` (`/notifications/unread-count`) |

## Support & account cluster (bottom of sidebar)

| Feature | Route | Entry |
|---|---|---|
| Help & Support (feature guides, honest scope) | `/help` | Sidebar bottom — **NEW route** (fixes dead link) |
| Sign out | `/login` | Sidebar bottom → Sign Out; user menu → Sign out |
| User Profile | `/settings` | Sidebar footer card (initials), top nav user menu |

## Public non-workspace surfaces (unchanged, not part of IA)

| Feature | Route |
|---|---|
| Marketing landing (redirects to `/dashboard` when authed) | `/` |
| Registration / login / email verify | `/register` `/login` `/auth/verify-email` |
| Candidate-facing careers portal | `/careers/[companySlug]`, job detail, apply |
| Candidate interview journey | `/interview/{access,welcome,preparation,device-check,session,complete}` |

## Map legend

- **Primary nav**: top-level sidebar item.
- **Group**: expandable sidebar parent (`Hiring` / `Interviews` / `Reports`).
- **Hub**: aggregate landing that links onward (`/hiring`).
- **Workspace**: tabs attached to a parent entity (job workspace).
- **Contextual**: appears only in reaction to state (selection toolbar, row
  actions, detail dialogs).
- **Header**: fixed top-nav control (bell, user menu, actions).
- **(NEW)****: introduced in Phase 1. Everything else pre-exists and is
  redistributed, not removed.