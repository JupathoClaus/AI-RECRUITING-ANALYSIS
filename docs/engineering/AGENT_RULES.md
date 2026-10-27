# Agent Rules

**Mandatory for every coding agent working on TalentAI**

## Core Principles

1. **Read before acting:** Read `AGENT_RULES.md`, `PROJECT_STATUS.md`, `CURRENT_TASK.md`, relevant roadmap sections, and applicable decisions before starting work.
2. **Verify state:** Check actual Git branch, HEAD, staged/unstaged/untracked files before editing. Trust evidence over assumptions.
3. **Inspect first:** Look at existing implementation and tests before deciding what to change.
4. **Evidence-based:** Treat repo files, Git diffs, and test output as evidence. Don't assume earlier claims are correct.
5. **Stay focused:** Work only on the active task. Avoid unrelated refactors, dependency changes, feature expansion.
6. **Preserve changes:** Never discard pre-existing user changes including untracked files.
7. **No destructive Git:** Never use destructive Git operations or broad cleanup to make working tree appear clean.
8. **No concurrent editing:** If another agent may be editing, wait. Never have two agents writing concurrently.
9. **Ask before destructive:** Request human approval before destructive ops, production changes, DB resets, risky migrations, paid providers, or scope expansion.
10. **No secrets:** Don't print/copy/commit secrets, tokens, credentials, real applicant data, or sensitive env values.
11. **Document everything:** Record commands, exit codes, relevant test counts and failures.
12. **Be precise about verification:** Distinguish implemented/locally tested/integration-tested/staging-verified/production-verified.
13. **Preserve on interrupt:** If interrupted, preserve working tree and record completed/incomplete work.
14. **Handoff properly:** Before stopping, update task/status/docs and provide exact next safe action. Next agent must inspect Git state independently.
15. **Accurate reporting:** Don't report entire suite passing if only selected tests ran. Don't claim 5k/50k capacity without load testing.

## Task States
Use consistently: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `IMPLEMENTED_NOT_VERIFIED`, `VERIFICATION_FAILED`, `VERIFIED`, `CANCELLED`

## Safety Rules
- Windows/PowerShell environment - use PowerShell-compatible commands
- Before edit: check `git status --short`, confirm branch/HEAD, review diffs/untracked
- Don't kill unrelated processes, restart Docker without need, delete temp/volumes, reset DB without authorization
- Don't change lockfiles unless explicitly approved task requires it
- Don't commit/push unless explicitly authorized
- No real emails, AI calls, Tavus sessions, production access
- No DB resets/deletions/migrations without approval

## Verification Requirements
- Run focused tests relevant to changes
- Report exit codes and actual results
- Don't claim completion until acceptance criteria verified
- Mark as local verification unless proven otherwise
- Update control docs after meaningful milestones
