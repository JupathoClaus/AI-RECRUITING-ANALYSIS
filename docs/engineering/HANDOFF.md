# Agent Handoff Guide

## Purpose
Ensure safe interruption and transfer between agents without relying on conversation history. Any agent must be able to resume from repository state alone.

## Outgoing Agent Responsibilities (Before Stopping)

1. **Stop initiating new work** - Complete or pause current step cleanly
2. **Verify working tree** - Run `git status --short`, review diffs
3. **Update documents** - Update `CURRENT_TASK.md` (completed/incomplete/blockers), `PROJECT_STATUS.md` (if milestone), `MILESTONE_LOG.md` if needed
4. **Record state** - Document last command, exit code, whether confirmed
5. **Provide next action** - Write exact next safe action in CURRENT_TASK.md
6. **Preserve everything** - Don't commit, push, reset, stash, or clean
7. **No speculation** - Only report verified facts

## Incoming Agent Responsibilities (On Start)

1. **Read control docs first** (in order):
   - `docs/engineering/AGENT_RULES.md`
   - `docs/engineering/PROJECT_STATUS.md`
   - `docs/engineering/CURRENT_TASK.md`
   - `docs/engineering/PROJECT_ROADMAP.md`
   - `docs/engineering/DECISIONS.md`
   - `docs/engineering/HANDOFF.md` (this file)

2. **Verify repository state**:
   ```powershell
   cd D:\TalentAI-GIT-RECOVERY
   git branch -a
   git log --oneline -1
   git status --short
   git diff --stat
   git remote -v
   ```

3. **Confirm against documented state** - Compare with PROJECT_STATUS.md. If differs, investigate and document discrepancies.

4. **Identify preserved changes** - Check the 6 uncommitted files mentioned in PROJECT_STATUS.md still exist/modified as expected.

5. **Understand active task** - Read CURRENT_TASK.md fully, understand acceptance criteria and next safe action.

6. **Verify environment if needed** - Check if services running (docker, backend:3000, frontend:3001) only if relevant to task.

7. **Resume from documented state** - Don't redo completed work. Follow "Next Safe Action" unless evidence shows it's wrong.

## Resuming Partially Completed Work

- **Check last command:** If a command was running, see if process still exists or check logs
- **Inspect diffs:** `git diff` shows uncommitted changes from partial work
- **Check logs:** Look in `%TEMP%` for recent logs (talentai-*.log)
- **Verify tests:** If tests were running, check results files or re-run focused tests
- **Don't assume completion:** Treat interrupted commands as incomplete until verified

## Identifying File States

```powershell
# Modified tracked files
git diff --name-only

# Staged files  
git diff --cached --name-only

# Untracked files
git ls-files --others --exclude-standard

# All changes
git status --short
```

## Conflict Resolution

If working tree differs from last report:
1. Document the differences in CURRENT_TASK.md or notes
2. Don't revert to match report - work with actual state
3. Preserve any new uncommitted changes (don't discard)
4. If critical conflict prevents safe work, document blocker and stop
5. Verify with user if truly ambiguous

## Checkpoint vs Verified Milestone

- **Checkpoint:** State recorded with evidence, work in progress or paused. May be partial.
- **Verified Milestone:** All acceptance criteria met with verifiable evidence (test results, logs, checks). Marked VERIFIED in MILESTONE_LOG.md.

## Known State (as of 2026-10-27 — ENG-020 complete)

**Repo:** D:\TalentAI-GIT-RECOVERY  
**Branch:** feat/mvp-resume-development  
**HEAD:** ab37d307ee678ef5d9876e103afc92f36b2bed53  
**Uncommitted (modified):** 18 files (ENG-007–015 + ENG-019/020 cumulative)  
**Untracked:** docs/engineering/ (7 files), docker-compose.staging.yml, .env.staging.example,
  src/app/jobs/__tests__/job-workspace.test.tsx,
  src/components/candidates/__tests__/candidate-profile.test.tsx,
  src/components/recruitment/__tests__/ (4 files), backend test files  
**TypeScript:** 0 errors in src/ (frontend)  
**Tests:** All focused suites pass (327+ tests verified)  
**Staging Stack:** LOCALLY VERIFIED — all 5 services running and healthy  
  Backend: 3010, Frontend: 3011, MailHog: 1025/8025 (all 127.0.0.1)  
  Database: talentai_staging (31 migrations, 84 tables, isolated from dev)  
**Dev Services:** Unaffected (4 containers still running)  
**AI Providers:** All MOCK; Tavus disabled  
**Pilot Readiness:** CONDITIONAL GO — see docs/engineering/PILOT_READINESS.md  
**Active Task:** ENG-021 — browser-based synthetic recruitment workflow verification

## Emergency Stop Procedure

If need to stop immediately:
1. Don't kill unrelated processes
2. Save any partial file changes (they're in working tree)
3. Update CURRENT_TASK.md with what was done and current state
4. Update PROJECT_STATUS.md if major change
5. Add note to HANDOFF.md if needed
6. State exact next action
7. Stop
