# TalentAI UX / Information Architecture Plan — Phase 1

Status: Implemented · Iteration: Phase 1 (UX consolidation)
Scope: Frontend only. No backend API, schema, auth, screening, or Tavus changes.
Applies to the recruiter workspace (pages rendered inside `AppLayout`). Public
careers + candidate interview journey pages are out of scope for this document.

---

## 1. Executive summary

TalentAI is feature-complete but presented as ~13 flat navigation items. The
Phase 1 goal is to make the product feel **simple while keeping every
capability** — understandable by a non-technical HR manager on day one.

The core rule adopted everywhere in this plan:

> **CAPABILITY SHOULD NOT EQUAL NAVIGATION ITEM.** A feature you can only use
> on a specific entity is not a top-level destination; it lives in that
> entity's workspace.

Implemented result: the recruiter workspace moves from 13 top-level items to
**4 primary destinations** (Dashboard, Hiring, Interviews, Reports), **1
organization item** (Settings), and a persistent bottom cluster (Help & Support,
Sign Out, User Profile). Everything that existed before remains reachable — no
routes were deleted, and all existing deep links still resolve.

## 2. Current state (audit summary)

Audited `src/` in full (September 2026). Before Phase 1:

| Area | Before (13 nav items) |
|---|---|
| Sidebar `NAV_SECTIONS` | `src/components/layout/sidebar.tsx:50` — Main Menu: Dashboard, Jobs, Applications, Candidates, Pipeline, Interviews, AI Screener, AI Interviews, Reports · Organization: Company, Notifications, Settings · Bottom: Help & Support (link to `/help` which **did not exist** — dead link), Sign Out, User profile |
| Contextual job workspace | Already existed as `/jobs/[jobId]` tabbed workspace (`src/components/recruitment/job-workspace.tsx`) — Overview / Applications / Pipeline / Screening / Interviews / Analytics; sub-routes use `?section=` query |
| Applications | First-class page (`/applications`) with server-side filters/search/sort/pagination, application workspace (`src/components/recruitment/application-workspace.tsx`), bulk AI screening batch |
| Candidates | `/candidates` with selection → contextual bulk toolbar (Move to screening / Interview / Reject / Run AI Screening); **no comparison** capability |
| Notifications | Flat `/notifications` page reachable from sidebar; badge in sidebar; a header bell that only linked to the page |
| Dashboard | `/dashboard` (802 lines) — analytics wall + AI score widgets; strong metrics, weak "what do I do next" |
| User feedback | No toast/drawer system; inline banners + dialogs |
| Icons | **Mixed**: `iconsax-react` in 16 files, `lucide-react` in 25 files |
| `/help` | Dead link from sidebar (no route, no redirect) |

## 3. Core principle: capability ≠ navigation item

Rules applied:

1. A destination is promoted to primary navigation only if it is a **mode of
   work an HR user chooses between** (run hiring, run interviews, review
   reports).
2. Everything that operates on a specific entity (a job, an application, a
   candidate) is attached to that entity's **workspace**, not to the nav.
3. Bulk/cross-entity capabilities (bulk screening, candidate comparison) are
   **contextual** — they appear only while a selection exists, inside the
   workspace where objects are selected.
4. No route is deleted and no capability is hidden permanently; everything is
   one extra click at most.

## 4. Target information architecture

```
MAIN
 ├─ Dashboard            /dashboard
 ├─ Hiring  (group)
 │    ├─ Jobs            /jobs            (+ /jobs/[jobId] workspace)
 │    ├─ Applications    /applications    (+ /applications/[applicationId])
 │    ├─ Candidates      /candidates      (+ /candidates/compare · selection → Compare)
 │    └─ Pipeline        /pipeline
 ├─ Interviews (group)
 │    ├─ Human Interviews  /interviews    (recruiter-led scheduling)
 │    └─ AI Interviews     /ai-interviews
 └─ Reports (group)
      ├─ Recruitment Reports  /reports
      └─ Pipeline Analytics   /analytics  (company-wide analytics)
      (Job Analytics: contextual inside /jobs/[jobId]/analytics — not a nav item)

ORGANIZATION
 └─ Settings              /settings        (profile / company / notifications /
                                            ai-settings / integrations / security tabs)

BOTTOM (persistent)
 ├─ Help & Support        /help            NEW route
 ├─ Sign Out
 └─ User Profile          /settings  (footer card)
```

**Notifications** are removed from the sidebar entirely and become a header
drawer (`TopNav` bell → slide-over). The full `/notifications` history page
remains reachable via the drawer's "View all".

**Company admin** (`/company` — members, departments, roles, invitations)
remains a live route and is reachable from Settings → Company profile tab
("Manage team & roles" link). It is intentionally not a primary nav item:
team administration is an occasional task, not a mode of work.

## 5. Navigation architecture

### 5.1 Sidebar (`src/components/layout/sidebar.tsx`)

- `NAV_SECTIONS` becomes: **Main Menu** (Dashboard + 3 groups below) and
  **Organization** (Settings).
- Groups are **expandable parents** (`Jobs`, `Applications`, `Candidates`,
  `Pipeline` under Hiring; `Human Interviews`, `AI Interviews` under
  Interviews; `Recruitment Reports`, `Pipeline Analytics` under Reports).
- A group row is a real link to its destination (`/hiring`, `/interviews`,
  `/reports`) with a separate chevron toggle. Arrow-keys + `aria-expanded` +
  `aria-controls` make the disclosure accessible.
- Auto-expand rule: a group is opened automatically when any child route is
  active (`/jobs…`, `/applications…`, `/candidates…`, `/pipeline…` →
  Hiring; `/interviews…` → Interviews; `/ai-interviews` → Interviews;
  `/reports`, `/analytics` → Reports). Manual open/close state is remembered
  for the session (in-memory) and does not override the active-route auto-open.
- Collapsed (icon-only) mode: groups collapse to the group icon linking to the
  hub destination; tooltips preserved. Active child reflects the group icon.
- Bottom cluster (Help & Support/Sign Out) + footer user card unchanged in
  placement; hierarchy now matches the target IA.
- Badge moved: sidebar `Notification` item removed; the unread badge now lives
  on the header bell (see §14).

### 5.2 Header (`src/components/layout/topnav.tsx`)

- The bell becomes a **drawer trigger** (aria-haspopup "dialog",
  `aria-expanded`, `aria-controls`), no longer a plain link.
- Unread badge (from `src/store/notification-store.ts`) renders on the bell.
- User dropdown unchanged (Profile / Settings / Sign out).

## 6. Route map

All legacy routes stay resolvable; nothing redirects, because the sidebar
children link to the same routes as before. New routes added:

| Route | Purpose |
|---|---|
| `/hiring` | NEW — Hiring hub: store-driven counts + entry cards for Jobs/Applications/Candidates/Pipeline. Also the click target for the Hiring group when its children are closed. |
| `/help` | NEW — Help & Support page (fixes the pre-existing dead link). |

Preserved as-is (no change): `/dashboard`, `/jobs`, `/jobs/[jobId]` (+
`applications|pipeline|screening|interviews|analytics` sub-tabs), `/applications`,
`/applications/[applicationId]`, `/candidates`, `/candidates/[candidateId]`,
`/pipeline`, `/interviews`, `/ai-interviews`, `/ai-screener`, `/reports`,
`/analytics`, `/notifications`, `/settings`, `/company`.
NEW: `/candidates/compare` — deep-linkable candidate comparison (2–4 candidates)
backed by real screening data.

Method: child routes are separate `page.tsx` files (App Router); the job
workspace keeps its `?section=` tab model (`job-workspace.tsx`) unchanged.

## 7. Hiring workspace (group + hub)

- The Hiring group owns the four hiring modes. `/hiring` hub renders quick
  aggregate counts from real store data, not mock numbers:
  - Jobs: open positions (from `jobs` store / `fetchJobs`)
  - Applications: total + awaiting review counts (server-side
    `fetchApplications` bounded queries on the hub; counts honor `meta.total`)
  - Candidates: total + unallocated/not-screened counts (`fetchCandidates`
    bounded page-1 query)
  - Pipeline: open pipeline jobs shortcut to `/pipeline`
- Each card deep-links to its mode. No fabricated figures: each figure labels
  its source query and degrades to "—" on load/error state.

## 8. Job workspace (contextual center)

Unchanged behavior — already the reference pattern:

- `src/components/recruitment/job-workspace.tsx` renders a tab workspace at
  `/jobs/[jobId]`: Overview / Applications / Pipeline / Screening / Interviews /
  Analytics. Navigating tabs updates `?section=` and preserves the job id.
- The workspace bundles job-specific applications, pipeline, screening, and
  analytics; the job overview surfaces counts + key job metadata.
- "Job Analytics" is reached **inside a job** (`/jobs/[jobId]/analytics`), not
  from the sidebar — capability ≠ nav item.

## 9. Applications first-class

- Applications are a first-class entity distinct from candidates: a candidate
  can hold many applications; `/applications` lists them by job with
  filters/search/sort/pagination (`application-list-view.tsx`, `PAGE_SIZE=20`,
  server-driven).
- Application detail (`/applications/[applicationId]`) hosts the review
  workspace (resume, screening result, pipeline placement, actions).
- Bulk "Run AI Screening" on a selection queues a real backend batch with live
  progress (`startBulkScreening` / `getBulkScreeningProgress`).
- Bulk status wording stays truthful: "Moved N to the Screening stage" never
  claims screening ran (`src/lib/candidates-bulk-actions.ts`).

## 10. Candidates + selection + comparison

- `/candidates` selection (checkboxes → contextual toolbar: Move to screening,
  Interview, Reject, Run AI Screening) is the **canonical contextual action
  bar**.
- **NEW: Candidate comparison** (`/candidates/compare?ids=…`, opened from the
  toolbar "Compare" when 2–4 candidates are selected, and via a contextual
  "Compare" entry on a candidate's detail row).
  - Evidence-based: side-by-side columns show AI score, recommendation,
    confidence, status, job, applied date, matched/missing qualifications, and
    per-criterion scores (from the latest completed screening result fetched
    via `getLatestAiScreening(applicationId)`).
  - **No verdict**: the view never declares a winner or an
    "AI-recommended" candidate. Rows are labels + facts; the human decides.
  - Honest cells: candidates without screening show "Not screened"; missing
    criteria show "—"; failed/running screening states are labeled as such.
  - Max 4 candidates; reason disabled at <2 and >4.
  - Deep-linkable (`?ids=`) so a comparison survives reload and can be shared.

## 11. AI screening display

- **The 0–100 numeric score is the source of truth** everywhere (candidate
  list/detail, workspace, dashboard top candidates).
- Stars/ratings remain **secondary/auxiliary** (company rating widgets),
  never a substitute score. No fabrication: `overallScore: null` = not
  screened; `0` is a real score.
- `screening-result-view.tsx` unchanged: overall score + progress, matched/
  missing qualifications, criteria scores, evidence, uncertainties, risk
  flags, and the advisory notice.

## 12. Interviews

- **Human Interviews** (`/interviews`): recruiter-led schedule/cancel/reschedule/
  record-result. Recruiter `result` (PASS/FAIL/HOLD) is kept distinct from AI
  assessment; AI summary surfaces only where a summary exists.
- **AI Interviews** (`/ai-interviews`): create/send/cancel/regenerate-code,
  status pipeline (9 statuses), honest empty/error states.

## 13. Reports & analytics

- **Recruitment Reports** (`/reports`): 8 report views, server-side
  filters/export (`downloadReportCsv` with correct `Content-Disposition`).
  Diversity report honestly shows "Not available".
- **Pipeline Analytics** (`/analytics`): company-wide charts + data-driven
  insights; "AI Insights" only ever reflect fetched aggregates.
- Job Analytics is contextual (§8). Funnel/overview numbers are truthful
  aggregates with explicit 0/null semantics.

## 14. Notifications drawer

- Header bell toggles a **drawer** (right slide-over, `lg:w-[380px]`,
  `max-w-[100vw]`) listing the most recent notifications from
  `getNotifications({ limit: 12 })` (real backend data).
- Each item: type icon, title/body, relative time, link (`actionUrl` or best
  mapped target), single-item mark-as-read; header "Mark all read".
- Honest loading (skeleton), empty ("You're all caught up"), and error
  (retry) states.
- Footer link "View all notifications" → `/notifications` (full history page
  unchanged).
- Keyboard: `Escape` closes; focus moves into the drawer; focus returns to the
  trigger on close; body scroll locked while open (same pattern as the mobile
  sidebar).

## 15. Organization & settings

- Organization = **Settings** only. `/settings` tabs: profile, company,
  notifications, ai-settings, integrations, security.
- Settings → Company profile tab gains a "Manage team & roles" link to
  `/company` (the full org-admin page: members, departments, roles,
  invitations). Route preserved, reachable, but no longer a primary nav item.

## 16. Terminology & language

Consistent, plain, HR-first labels (audited across pages):

| Context | Term |
|---|---|
| Hiring modes | Jobs, Applications, Candidates, Pipeline |
| Interview modes | Human Interviews, AI Interviews |
| AI features | AI Screening, AI Interviews, AI Summary |
| Statuses | Applied, Screening, Interview, Offer, Hired, Rejected |
| Bulk stage move | "Move to Screening Stage" (never claims screening ran) |
| Comparison | "Compare candidates" — no winner language |

## 17. Visual language & icons

- New work uses **one icon library: `iconsax-react`** (with `variant` switching
  Linear ↔ Bold for hover/active). This applies to sidebar, topnav/drawer,
  hiring hub, compare workspace, help page.
- **Legacy `lucide-react` usage in deep/leaf components is NOT migrated in
  Phase 1** (25 files incl. public careers/interview journey). It is a
  tracked, mechanical cleanup in `docs/UX_FOLLOWUP_BACKLOG.md` — migrating it
  here would touch the public/candidate-facing surfaces with zero behavioral
  gain and disproportional regression risk. Phase 1 guarantees **no new**
  `lucide-react` imports in app-shell/nav surfaces and a single icon story in
  everything the sidebar/header renders.
- Design tokens (`globals.css`) already ship an enterprise SaaS look: deep
  `#141418` sidebar, `#f6f6f5` canvas, white surfaces, semantic tokens only
  (muted `#6d6d74` passes 4.5:1). No new ad-hoc hex colors introduced by
  Phase 1 work.

## 18. Interaction model

- Motion: subtle (`fade-in`, `slide-in-*`) with durations ≤ 350ms and
  `prefers-reduced-motion: reduce` global kill-switch already in `globals.css`.
- Drawer/compare open with `slide-in-right` and focus management (§14 §10).
- Loading: skeleton/`animate-pulse-subtle` primitives reused (never raw
  text-only hacks) — see `src/components/ui/empty-state.tsx`, `skeleton`.
- Feedback: inline banners + dialogs (no toast system exists; adding one is a
  tracked backlog item, §22).

## 19. Accessibility

- All new chrome: `aria-label`/`aria-expanded`/`aria-controls` disclosures,
  `aria-current="page"`, keyboard-close for drawers, `role="dialog"`
  aria-modal for compare; focus trap + return-focus for drawer.
- Combobox selectors consistently carry `aria-label` (audited in prior pass:
  0 serious/critical violations across 12 pages with axe 4.12.1).
- Comparison table is a real semantic `<table>` with `<th scope="col">`,
  not divs.

## 20. Responsive behavior

- Compact (icon) sidebar on desktop 1024–1279 optional; mobile: hamburger +
  overlay drawer (existing). Hiring hub cards collapse to 1/2-col; compare
  table scrolls horizontally (`overflow-x-auto`); notification drawer
  `max-w-[100vw]`.

## 21. Data & backend constraints (hard rules)

- **No backend changes** in Phase 1 (API, schema, screening, auth, Tavus
  untouched). All new UI consumes existing endpoints.
- Server-side pagination preserved everywhere: no `limit:100`-style client
  fetches of full lists for new UI. Hub counts use `meta.total` from bounded
  queries; comparison fetches only the selected candidates' screening detail.
- All numbers rendered are real or explicitly empty/loading. No placeholders,
  no fabricated figures, no fake buttons.

## 22. Non-goals deferred to Phase 1+ (tracked in `UX_FOLLOWUP_BACKLOG.md`)

- Global `lucide-react` → `iconsax-react` migration (mechanical, riesgo
  low-benefit sweep).
- Toast/sonner feedback layer and focus-toast semantics.
- `/notifications` read-state sync with a server push (polling today).
- Comparison persistence/share beyond deep-link, evidence-diff export.
- "AI Screener" standalone route consolidation/marketing copy review.
- Filters optimization (distinct columns) per scalability notes.

## 23. Implementation order & verification

Followed the prescribed STEP order: audit → plan docs → feature access map →
nav → workspace → contextual actions → comparison → dashboard → notifications →
terminology/icons → responsive → transitions → states → a11y → tests → build →
browser QA.

Verified with: `tsc --noEmit`, `next build`, full vitest suite (new
component tests for hiring hub, notification drawer, compare pipeline, sidebar
grouping), and an axe 4.12.1 scan of every app-shell page via
`verification/a11y-axe-scan.mjs`. See `IMPLEMENTATION_PHASE_1_REPORT.md`.