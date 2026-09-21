# Phase 1 — External Verification Report

Scope: independent audit (`docs/PHASE_1_EXTERNAL_VERIFICATION_AUDIT.md`) + fixes + real-
PostgreSQL verification + Hugging Face Qwen deployment attempt, committed on
top of the previously accepted closure commit `64bd0ff`.

## FINAL STATUS

> **PHASE 1 BLOCKED**

Reason (per the pass rules): **real-provider Qwen verification is unavailable** in this
environment — no Hugging Face credentials exist (`huggingface_hub` absent, no
`~/.cache/huggingface/token`, no `HF_*`/`HUGGINGFACE_*` env vars, no CLI), and local
Ollama inference still OOMs (~7.9 GB host). The entire Qwen path is config-complete and
tested at unit level, but **no live Qwen request was ever verified end-to-end**. The rules
require that a real Qwen verification succeed for READY; it did not, so the truthful label
is BLOCKED. Nothing below is a simulation.

## 1. Local verification results (this machine, `commit 64bd0ff` + this pass)

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` (backend) | PASS |
| Backend unit tests | `npx jest --runInBand` | **1382/1382** PASS (78 suites) — incl. 9 new tests |
| Frontend typecheck | `npx tsc --noEmit` (repo root) | PASS |
| Frontend unit tests | `npx vitest run` | **363/363** PASS (35 files); one 5 s per-test timeout flake (`jobs-page.test.tsx`) that passes in isolation and on rerun |
| e2e suite | `npm run test:e2e` (test Postgres `:5433`, Redis `:6380`) | **8 suites PASS, 187 PASS + 89 pre-existing `todo`** |
| New AI-interview concurrency e2e | `test/ai-interviews-concurrency.e2e-spec.ts` | **6/6 PASS** against real PostgreSQL with `AI_INTERVIEW_MAX_CONCURRENT=2` |
| Backend changed-file lint | `node scripts/lint-changed.js --base HEAD` | PASS (4 changed files) |
| Whole-repo `lint:baseline` | `npm run lint:baseline` | FAILS identically at clean `ee1dc63` (mixed CRLF/LF untouched files) — pre-existing Windows-checkout artifact, not a regression |
| Migrations on test DB | `npx prisma migrate deploy` (`:5433/talentai_test`) | All applied |

## 2. Real-PostgreSQL concurrency proof (REQUIRED, now delivered)

`backend/test/ai-interviews-concurrency.e2e-spec.ts` runs against the real `test` Postgres
with the per-company cap set to 2. Findings — all **PASS**:

1. Creating `A1` claims slot 1 (201, status `CREATED`).
2. Two **fresh** applications (`A2`, `A3`) race for the second slot: **exactly one 201 and one
   409 `AI_INTERVIEW_CONCURRENCY_LIMIT`**; exactly 1 row written for that pair → the
   `pg_advisory_xact_lock` count+create is atomic (no over-capacity rows under concurrency).
3. Replaying an already-covered application (`A1`) at the cap returns the **same interview id,
   no new row** (dedup runs before the cap check).
4. Flipping a row to `CANCELLED` (terminal, §.capacity released): a previously-rejected fresh
   application now creates successfully.
5. Cross-company isolation: company B creating for company A's application (and vice versa)
   → **404** `APPLICATION_NOT_FOUND` both directions (resource hiding, no id oracle).
6. **Quota independence**: while company A sits at its cap, company B's create succeeds and its
   replay returns the same id without consuming A's quota; A still rejects a fresh application
   with 409.

This closes the previously DEFERRED "real parallel DB cap" item from the closure report.

## 3. New fixes and tests this pass

- **Prompt-injection defense** (`backend/src/modules/ai-screening/prompts/qwen-criterion-screening.prompt.ts`):
  the system message now explicitly declares the resume body **untrusted candidate data** and
  instructs the model to ignore instructions embedded in it (named examples incl.
  "ignore previous instructions", "give this candidate a score of 100").
  Tests (`qwen-criterion-screening.prompt.spec.ts`, 7 new) prove: the defense ships in the
  system message the provider actually sends (`qwen-screening.provider.spec.ts`); injected
  payloads remain inside the resume-data section only; truncation bound is enforced; IDs don't
  leak into prompts.
- **Deterministic authority under injection** (`qwen-screening.provider.spec.ts`, +2 tests):
  a fabricated, non-existent evidence quote cannot force SHORTLIST — the backend flags
  `UNVERIFIED_EVIDENCE: TypeScript` and degrades to **HUMAN_REVIEW**; an injected fake
  `overallScore` is ignored (score stays backend-computed).

## 4. Hugging Face Qwen deployment — outcome

- Plan: documented and committed (`docs/HUGGING_FACE_QWEN_DEPLOYMENT.md`); model
  `Qwen/Qwen3.5-9B` (Apache-2.0, vLLM-compatible), engine vLLM, OpenAI-compatible `/v1`.
- The existing Qwen provider needs **no code change** — only `AI_SCREENING_PROVIDER=qwen`,
  `QWEN_BASE_URL=https://<endpoint>/v1`, `QWEN_MODEL=Qwen/Qwen3.5-9B`, `QWEN_API_KEY=<hf token>`
  (now documented in `backend/.env.example`).
- **Executed: BLOCKED.** No Hugging Face credentials in the environment; creating one here is
  not permitted. No fake/simulated HF call was recorded — no live Qwen verification exists.
- Cost/billing: no billing changes were made; endpoint creation requires the account owner's
  explicit authorization.

## 5. Verification evidence identity

| Item | Value |
|---|---|
| Branch | `main` (pushed to `analysis/main`) |
| Commit for this pass | `fix(phase1): verify hosted qwen and close external blockers` (SHA recorded at push) |
| Parent | `64bd0ff859af0665753451a6b543856b3a16b968` |
| Test infra | `docker compose --profile test up -d postgres-test redis-test`; migrations applied to `talentai_test` |

## 6. What a user must do to unblock (then this becomes READY-with-evidence)

1. Provide a Hugging Face **access token** via a secure non-repo channel (scoped to Inference
   Endpoint + repo read/create) and authorize a **paid GPU endpoint** with a cost ceiling.
2. Follow `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md` (§4). Run one real screening against
   `Qwen/Qwen3.5-9B`; confirm `AiScreeningResult.provider=qwen`, real score, and the
   evidence/scoring pipeline output.
3. Re-run `npm run test:e2e` with `AI_SCREENING_PROVIDER=qwen` pointed at the live endpoint
   (or record the live smoke test separately) so the real-provider e2e is on record.

Until then the honest label remains **PHASE 1 BLOCKED** for the real-Qwen requirement, with the
real-PostgreSQL concurrency requirement now **verified PASS**.