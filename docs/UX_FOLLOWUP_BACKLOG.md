# TalentAI — UX Follow-up Backlog

Follow-up items identified during Phase 1 (information-architecture transformation).
They are **not** required for the IA goal — they are refinements that build on the
new structure. Each entry states the problem, why it matters, and effort.

## 1. Stand on a single icon set

- **Problem**: New navigation/chrome uses `iconsax-react` (≈20 files) while legacy
  pages still use `lucide-react` (25 files). Two icon systems render differently
  and confuse the "one product" feel.
- **Why now**: Phase 1 already standardized the chrome; the legacy set is now a
  visual exception with no owner.
- **Work**: Replace `from "lucide-react"` imports page-by-page with the matching
  iconsax icon; keep the semantic meaning (leaf-level icons were avoided by the
  audit guidance where possible).
- **Acceptance**: `grep -rl 'lucide-react' src` returns nothing; no visual test
  changes.

## 2. Refresh `verification/sidebar-qa.mjs` for the new IA

- **Problem**: `sidebar-qa.mjs` still asserts the pre-Phase‑1 flat sidebar:
  it expects `/ai-screener` and `/notifications` as nav items and greps for the
  seed user "Sarah Chen".
- **Why now**: It is the sidebar regression gate and currently reports false failures.
- **Work**: Update expected hrefs to the new groups (Hiring → Jobs/Applications/
  Candidates/Pipeline; Interviews → Human/AI; Reports → Recruitment/Pipeline
  Analytics; Settings only under Organization; no Notifications item; Help & Support).
- **Acceptance**: script passes on a clean tenant.

## 3. Terminology pass (already started, finish)

- **Problem**: A few labels still drift from the consolidated structure, e.g.
  `/ai-screener` page heading "AI Screener" vs the workspace action "Start AI
  Screening", and `/company` heading "Company settings" vs the nav entry "Settings".
- **Why now**: Consistent nouns are half the IA win.
- **Work**: Standardize "AI Screening (workspace)", "Settings", "Company" in
  headings/empty states and button microcopy; update the access map if routes stay.
- **Acceptance**: grep of visible headings contains only approved terms.

## 4. Expandable sidebar on mobile

- **Problem**: The new group structure (expand/collapse, active-child auto-open)
  lives in the desktop sidebar; the mobile drawer (`#sidebar-nav-mobile`) was not
  part of the Phase‑1 browser checks.
- **Why now**: Mobile users are the second largest cohort and the collapse affordance
  differs on touch.
- **Work**: Port the `activeChildOf` auto-open + group chevrons to the mobile
  drawer; add a unit test mirroring `sidebar.test.tsx`.
- **Acceptance**: mobile drawer test passes + axe scan on a 390px viewport is clean.

## 5. Dashboard "Needs your attention" deep links

- **Problem**: The Phase‑1 action center links to list pages (`/applications`,
  `/ai-screener`, `/interviews`); the specific item (a resume to screen, a
  candidate to shortlist) is not pre-selected.
- **Why now**: The action center sells "jump straight in"; deep links make it true.
- **Work**: Where the surface supports a query param (e.g. `?applicationId=` on
  the screener) or a filter (e.g. `?status=` on applications), emit it from
  `attentionItems`.
- **Acceptance**: each dashboard item navigates to the right record/filter.

## 6. Notification drawer extras

- **Problem**: The drawer (new in Phase 1) supports mark-read, mark-all-read and
  view-all, but not delete or an unread-only filter.
- **Why now**: Deleting is already an API (`deleteNotification`); filtering
  matches the notifications page.
- **Work**: Add "Unread" toggle (param `unread=1` exists on `getNotifications`)
  and a delete action with confirm; keep the same a11y contract (dialog role,
  Escape, focus return).
- **Acceptance**: drawer tests extend the existing `notification-drawer.test.tsx`.

## 7. Compare: profile-only columns and export

- **Problem**: The compare table requires an application to show screening data;
  candidates with no application currently render a profile column with honest
  dashes. Two refinements will round it out.
- **Why now**: It already refuses to invent values; the gaps are convenience, not honesty.
- **Work**: (a) allow entering compare with no `?ids=` selection → keep empty state,
  but add "add score" no; instead document the 2–4 selection limit in UI copy for
  rows >4; (b) CSV export of the rendered table.
- **Acceptance**: an axe-clean table with a "Download CSV" button (tested).

## 8. Stale-count indication on the hiring hub

- **Problem**: `/hiring` counts are a point-in-time snapshot; they can lag behind
  live lists.
- **Why now**: The hub says "live counts" verbally; an honest stale indicator
  keeps that promise.
- **Work**: Show "updated just now / a few minutes ago" next to the section, or a
  light refresh button; never fake values (Phase‑1 rule).
- **Acceptance**: hub test asserts the indicator, not fabricated numbers.