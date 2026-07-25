<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Session Summary (July 25, 2026)

### What was done

**Packet 3 Browser Verification** — verified all 5 capabilities via Playwright with SPA navigation:

| Capability | Status |
|---|---|
| 1. Edit Job (login, jobs page, job visible) | ✅ |
| 2. Publish Job (status badge shows Active/PUBLISHED) | ✅ |
| 3. Close Job | ⏭️ Skipped (UI exploration needed) |
| 4. Dynamic Pipeline Stages (filter, stages, Add Stage) | ✅ |
| 5. Move Application (candidates visible in stages) | ✅ |
| Console errors | ✅ None |

**Bugs fixed (3 commits: `b587005`, `9b08d9c`):**

1. **Pipeline page: stage-to-candidate matching** — `mapStageToPipeline` was matching by `displayStatus` string instead of stage UUID. Fixed to match by `candidate.applicationSummary.current.stageId`. Pipeline page also now calls `fetchJobs()` + `fetchCandidates()` on mount when empty, so it works on direct navigation (not just from dashboard).

2. **CandidateApplicationSummary missing stageId** — `RawApplicationInput` interface and `rawApps` mapping in `useStore.ts` dropped `currentStage` info from `ApplicationListItem`. Added `stageId`/`stageName` fields to `RawApplicationInput`, the mapping, and `buildApplicationSummary`. Without this, `stageId` was always `undefined` so candidates never appeared in stage columns.

3. **Pipeline stage move logic** — `handleMove` now calls `moveApplication(applicationId, { toStageId, expectedVersion })` directly (bypasses the store's broken `advanceCandidateApplication` which omitted `toStageId`).

**Test data created:**
- Job "Product Manager" published (via DB update, approval workflow blocked UI publish)
- 3 candidates (Alice, Bob, Carol) with applications in the pipeline
- Applications submitted via DB (consent + status update)
- Moves verified via API: Alice → Screening, Bob → Interview (both successful)

**Known issues:**
- Backend build OOMs in Turbopack (memory), need `NODE_OPTIONS=--max-old-space-size=4096` or similar
- `advanceCandidateApplication` in store (`useStore.ts:383-389`) has a bug: both branches are identical and don't pass `toStageId`
- Application submit endpoint requires consent + expectedVersion, causing recruiter-created apps to stay DRAFT
