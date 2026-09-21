# Phase 1 — External Verification Audit

This document records an independent inspection of the current repository state before the external-phase verification pass. It is a **claims-vs-code** check: the Phase 1 closure report was read, and each load-bearing claim was verified against the actual source tree.

## 1. Repository state inspected

| Item | Value |
|---|---|
| Commit inspected | `64bd0ff859af0665753451a6b543856b3a16b968` — `fix(phase1): close remaining production readiness gaps` |
| Previous closure commit | `ee1dc63c1ad28b15a3975ec711694d5166e7045e` |
| Branch | `main` (ahead of `origin/main` by 4) |
| `git status` | clean working tree (nothing to commit) |
| Remote `analysis` (`JupathoClaus/AI-RECRUITING-ANALYSIS.git`) | `refs/heads/main` == `64bd0ff…` (pushed, verified via `git ls-remote`) |
| Last 5 commits | `64bd0ff` (closure), `ee1dc63`, `e393f76`, `c854fae`, `2cd4dff` |

## 2. Implementation findings (from code inspection)

### AI screening architecture (preserved, verified present)
`Application + Job criteria → ScreeningInput → provider → structured JSON → schema validation → evidence verification → deterministic scoring → recommendation → persist → UI`. Confirmed on disk:

- Provider abstraction: `backend/src/modules/ai-screening/providers/ai-screening-provider.interface.ts` (`AiScreeningProvider.screen`, `AiScreeningProviderOptions` with `timeoutMs/requestId/abortSignal`). Provider selection via `createAiScreeningProvider` in `ai-screening.module.ts` driven by `aiScreening.provider`.
- Providers present: `mock`, `openai`, `deepseek`, `qwen` (`qwen-screening.provider.ts`, `openai-screening.provider.ts`, `deepseek-screening.provider.ts`).
- Config: `backend/src/config/loaders/ai-screening.config.ts` — keys `QWEN_BASE_URL`, `QWEN_MODEL`, `QWEN_API_KEY`, `AI_SCREENING_PROVIDER`, `AI_SCREENING_TIMEOUT_MS`, `AI_SCREENING_MAX_RESUME_CHARS`, etc. `QWEN_BASE_URL` defaults to `http://localhost:11434/v1`, `QWEN_MODEL` to `qwen3.5:9b`.
- Qwen provider contract: **OpenAI-compatible Chat Completions** (`client.chat.completions.create`, `response_format: {type:'json_object'}`, `temperature: 0.1`, `max_tokens: 6000`). The same client works against Ollama (`/v1`) and any OpenAI-compatible server such as a Hugging Face Inference Endpoint backed by vLLM. Only the provider boundary needs the endpoint; screening business logic is untouched.
- Schema validation: `schemas/qwen-output.schema.ts` — strict field/enum/length checks, criterion-ID cross-check, throws `AiScreeningMalformedResponseError` (bounded, terminal).
- Evidence verification: `evidence-verification.service.ts` — VERBATIM/SUPPORTED/INFERRED/UNVERIFIED quote matching against the resume; fabricated quotes → `evidenceUnverified` → risk flag + confidence downgrade.
- Deterministic scoring: `backend-scoring.service.ts` — backend-owned weights/thresholds (SHORTLIST ≥ 72, NOT_SHORTLIST ≤ 38, hard-requirement override). Model cannot set the score.
- Fingerprinting: `utils/screening-input-fingerprint.ts` + processor stale-fingerprint check.
- Persistence: `AiScreeningProcessor.process` writes `COMPLETED`/`FAILED` with provider/model/responseId/promptVersion + timing metadata; bounded retries (`job.opts.attempts ?? 3`); terminal failures coded (e.g. `PROVIDER_MALFORMED_RESPONSE`, `PROVIDER_TIMEOUT`).
- Worker/queue: BullMQ `ai-screening` queue, worker concurrency 3.

### AI interviews / Tavus (verified present)
- `ai-interviews.service.ts` — `create()` runs inside `prisma.$transaction` guarded by `SELECT pg_advisory_xact_lock(hashtext(companyId))`; dedup check (non-terminal) then `assertCompanyWithinConcurrencyLimit(tx, companyId)` (`AI_INTERVIEW_MAX_CONCURRENT`, default 3); 409 `AI_INTERVIEW_CONCURRENCY_LIMIT`. Terminal statuses (CANCELLED/EXPIRED/FAILED/COMPLETED) do not consume capacity.
- Tavus duration typing (`TavusConversationProperties`, `max_call_duration = min(estimatedDurationMinutes*60, cap||600)`), `TAVUS_MAX_CALL_DURATION_SECONDS` config.
- Access-token security (`ai-interview-token.service.ts`), code hashing (`ai-interview-code.service.ts`), secret-scoped callback.

### Test infrastructure
- `backend/docker-compose.yml` has `postgres-test` (`:5433`, profile `test`) and `redis-test` (`:6380`, profile `test`); `npm run test:infra:up` / `test:infra:down`.
- `test/env/test.env` → `DATABASE_URL=postgresql://…@localhost:5433/talentai_test`, `REDIS_PORT=6380`.
- `test/jest-e2e.json` (regex `.e2e-spec.ts$`). Existing e2e specs: app, applications, candidates, extraction-concurrency, extraction-dispatch-reconciler, interviews, jobs.
- **Gap:** there is NO `ai-interviews` e2e spec — the real-PostgreSQL parallel concurrency proof that the closure report marked DEFERRED does not exist and must be added.

## 3. What is already correct (verified)

- Modular AI platform, provider switcher, deterministic backend scoring, evidence verification, schema validation, fingerprint dedup, bounded retries, tenant-scoped queries in the processor/services, HTTP guard coverage (existing e2e security matrices), secret hygiene (no tracked `.env`/keys; `.env.example` placeholders only).
- Advisory-lock concurrency design is correct at unit level (105 interview-service specs).
- Local Qwen probe (prior pass) proved Ollama reachable + model present but inference OOM'd on this 7.9 GB host.

## 4. What remains blocked

1. **Hugging Face authentication is unavailable in this environment.** `huggingface_hub` is not installed, no `~/.cache/huggingface/token`, no `HF_*`/`HUGGINGFACE_*` env vars, no `hf`/`huggingface-cli`. No HF credential can be confirmed, so no private repo, no Inference Endpoint, and no authenticated inference request can be made. Per operating rules no fabrication or credential creation can occur here.
2. **Real Qwen inference** remains blocked by the same fact (HF) and by local memory (Ollama OOM: CPU_REPACK buffer ~3.4 GB on 7.9 GB host).
3. **Whole-repo `lint:baseline`** fails identically on a clean `ee1dc63` checkout (mixed CRLF/LF in untouched files). Pre-existing, not a regression; `lint:changed --base HEAD` is the applicable gate (PASS).

## 5. What must be changed

- Add a **prompt-injection defense** to the Qwen criterion prompt (explicit statement that the resume body is untrusted candidate data and any instruction inside it must be ignored) plus tests proving (a) the defense is present, and (b) fabricated/injected evidence quoted against an empty resume cannot force SHORTLIST (evidence verification downgrades to HUMAN_REVIEW).
- Add a **real-PostgreSQL AI-interview concurrency e2e spec** (`AI_INTERVIEW_MAX_CONCURRENT=2`; 3 parallel creates → 2 OK + 1 x `AI_INTERVIEW_CONCURRENCY_LIMIT`; terminal-status release; cross-company isolation; no >capacity rows under race).
- Add environment/documentation so the HF-hosted Qwen path is a pure configuration change (`AI_SCREENING_PROVIDER=qwen` + `QWEN_BASE_URL`/`QWEN_MODEL`/`QWEN_API_KEY`), and document the deployment procedure without any secret values.

## 6. Test infrastructure requirements

- `docker compose --profile test up -d postgres-test redis-test` (Docker Desktop required; was stopped at audit time, restarted successfully).
- Apply migrations to the test DB: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/talentai_test npx prisma migrate deploy` (verified — all migrations applied).
- Run e2e with `npm run test:e2e` / `npx jest --config test/jest-e2e.json`.

## 7. Hugging Face deployment plan (documented, not yet executed)

| Step | Plan |
|---|---|
| Model | **Qwen/Qwen3.5-9B** on Hugging Face Hub (the official upstream of the local Ollama `qwen3.5:9b` GGUF, ~9.7B, Q4_K_M / 9B full; Apache-2.0 — deployment authorized). Transformers-format weights, vLLM-compatible, 262k context. |
| Endpoint | HF Inference Endpoint, engine **vLLM** (OpenAI-compatible `/v1/chat/completions` — matches the existing provider exactly). Smallest reliable GPU that fits 9B in bf16 (e.g. 24 GB VRAM class); region/instance chosen from account availability. |
| Auth | HF token held only in backend env (`QWEN_API_KEY`); endpoint set to private/authenticated. Browser never receives it. |
| Provider config | `AI_SCREENING_PROVIDER=qwen`, `QWEN_BASE_URL=https://<endpoint>/v1`, `QWEN_MODEL=Qwen/Qwen3.5-9B`, `QWEN_API_KEY=<secret>`. No code change required beyond the prompt-injection defense. |
| BLOCKED ON | A Hugging Face token (write/read scoped) supplied outside Git, and explicit authorization for a paid GPU Inference Endpoint. |

## 8. Required user actions before HF deployment can proceed

1. Provide a Hugging Face **access token** through a secure channel outside the repository (OpenCode secure env / host env var / `hf auth login` on this machine), with scope limited to creating/reading a model repo and launching an Inference Endpoint. Do not paste it into any file.
2. Explicitly authorize a **paid GPU Inference Endpoint** and state a cost ceiling, because HF Inference Endpoints require a payment method and this machine must not modify billing without authorization.
3. (Then) the endpoint URL/token are set in the backend environment and `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md` is followed.

Until (1) and (2) are satisfied, real Qwen verification is **BLOCKED**, and the final status for this pass will be **PHASE 1 BLOCKED** even though every locally verifiable item may pass.