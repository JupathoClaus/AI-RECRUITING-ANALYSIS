# PHASE 1 — Hugging Face GPU Space × vLLM × Qwen3.5-9B Experiment — Acceptance Checklist

- Date checked: **2026-09-22**
- Repository HEAD at start: `f8326d6` (main, clean tree) — pushed to `analysis/main`
- Account inspected: `Jupatho` (`hf auth whoami` → user=Jupatho, orgs=null, endpoint=null); `hf --version` 1.32.0
- Status labels used: **VERIFIED** (evidenced) · **BLOCKED** (exact blocker stated, safe stop) · **NOT TESTED** (in-scope but untested) · **DEFERRED** (out-of-scope / awaiting unblock)

> Executive verdict: the experiment could **not be executed** because the namespace `Jupatho` cannot create **any** repository (Space, model, or dataset) — `403 Forbidden: You don't have the rights to create a … under the namespace "Jupatho"`. GPU Space creation additionally requires a paid plan / billing, and the same account was previously rejected for Inference Endpoint creation (`403 Payment method required for namespace: Jupatho`). Per the experiment guardrails, work **stopped before any spend**. No Space was created; **$0 billed**. Where the identical TalentAI pipeline was previously verified against HF-hosted `Qwen/Qwen3.5-9B`, that evidence is referenced and labeled as such — it is **not** GPU-Space evidence.

---

## Checklist

| # | Criterion | Status | Evidence / Blocker |
|---|---|---|---|
| 1 | Repository inspected | **VERIFIED** | `git status` clean at `f8326d6`; branch `main`; recent commits reviewed; Phase 1 docs + provider + tests inspected (see report §3). |
| 2 | HF authentication verified | **VERIFIED** | `hf --version` 1.32.0; `hf auth whoami` → `Jupatho`; CLI subcommands for spaces/endpoints/secrets present. Token kept in host cache only. |
| 3 | Current Space GPU pricing verified | **VERIFIED** | `hf spaces hardware` (2026-09-22): `l4x1` 1×Nvidia L4 (8 vCPU / 30 GB RAM / 24 GB VRAM / 400 GB disk) = **$0.80/hr** ($0.0133/min); `l4x4` $3.80/hr; cross-checked against HF docs. Billing is by the minute while the Space runs on paid hardware, regardless of usage. |
| 4 | L4 availability verified | **VERIFIED** | `l4x1` / `l4x4` present in `hf spaces hardware`. Availability as a *selectable* option is contingent on a paid plan, which this account cannot satisfy (see #5). |
| 5 | Space created securely | **BLOCKED** | `hf repos create talentai-qwen35-l4-experiment --type space --sdk docker --private` → **403 Forbidden: You don't have the rights to create a space under the namespace "Jupatho"**. Same 403 with `--sdk static` and for model-repo creation. No Space exists; nothing was created; **$0 spent**. |
| 6 | Qwen3.5-9B deployed | **BLOCKED** | No Space to deploy to. Planned: `Qwen/Qwen3.5-9B`, BF16, single L4 24 GB (weights ≈ 19.3–19.9 GB; fits with modest KV-cache headroom at 8K context). |
| 7 | vLLM running | **BLOCKED** | No Space. Planned: vLLM stable **>= 0.17.0** (required for Qwen3.5 per vLLM recipes; earlier selected `vllm/vllm-openai:v0.29.0` satisfies >= 0.17.0). |
| 8 | Health endpoint works | **BLOCKED** | `GET /health` cannot be called — no Space. Service blueprint specifies it (see report §5). |
| 9 | OpenAI-compatible API works | **BLOCKED** *(Space)* | No Space to call. Note: the same OpenAI-compatible contract was verified against HF-hosted Qwen (`router.huggingface.co/v1`) in the prior pass — evidence for the contract type, not for the Space. |
| 10 | Authentication works | **BLOCKED** *(Space)* | Planned: private + protected Space, `--secrets` for `QWEN_API_KEY`, never in git/frontend/tests. Could not be implemented. Repo secret scan clean (no `hf_…` tokens committed). |
| 11 | JSON output works | **BLOCKED** *(Space)* | Space-side untested. Same output path (`response_format: json_object` → schema validation) verified end-to-end on hosted Qwen (valid JSON, `finish_reason=stop`). |
| 12 | Sequential latency measured | **BLOCKED** *(Space)* | No Space. Not measured on L4. Reference measurements from the identical provider path on hosted Qwen: raw JSON probe ~3.9 s / 322 tokens; full screening E2E ~24.4 s. These are not L4 measurements. |
| 13 | Concurrency measured | **BLOCKED** *(Space)* | No Space. Mass-safety architecture instead VERIFIED by queue-level tests (5-way dedup, BullMQ deterministic job ids, bounded worker concurrency default 3; `ai-interviews-concurrency` 6/6). |
| 14 | GPU memory measured | **BLOCKED** | No GPU. Model-card/community data (not measured here): BF16 ≈ 19.3–19.9 GB weights; ≈1 GB/K token KV; full-262K context exceeds 24 GB → an 8K ceiling is the planned conservative setting. |
| 15 | Long resume tested | **BLOCKED** *(Space)* | Space-side untested. Provider enforces `AI_SCREENING_MAX_RESUME_CHARS` (default 15000); truncation + `max_tokens` handling covered by provider tests (identical code path). |
| 16 | Prompt injection tested | **VERIFIED** *(pipeline)* | Automated guard tests (system prompt declares resume as untrusted candidate data; 7 prompt tests; injected `overallScore`/evidence cannot override). Verified on the identical provider code path; NOT re-run through the Space (Space BLOCKED). |
| 17 | Evidence verification tested | **VERIFIED** *(pipeline)* | Live hosted-Qwen runs: `evidenceUnverifiedCount=0`, every quote grounded (VERBATIM/SUPPORTED/INFERRED); 15 unit tests in `evidence-verification.service.spec.ts`. NOT re-run through the Space. |
| 18 | Deterministic score authority verified | **VERIFIED** *(pipeline)* | Backend `BackendScoringService` computes the authoritative 0–100 score; model-returned `overallScore` is ignored (automated injection tests). Live score 98 was backend-computed. |
| 19 | TalentAI real E2E screening completed | **BLOCKED** *(Space)* | Real TalentAI → Qwen → structured JSON → validation → evidence → scoring → `AiScreeningResult` executed **twice against HF-hosted `Qwen/Qwen3.5-9B`** (same provider code path), NOT against a GPU Space. The task's required SPACE pipeline was not executed → marked BLOCKED per guardrail. |
| 20 | Provider metadata verified | **BLOCKED** *(Space)* | On hosted Qwen: `provider=qwen`, `model=Qwen/Qwen3.5-9B`, `promptVersion=v1`, provider response id, fingerprint — all persisted. Space-side metadata untestable. |
| 21 | Failure handling tested | **VERIFIED** *(pipeline)* | Live probes through the real DI provider: unreachable host → `PROVIDER_UNAVAILABLE` (retryable, ~1.3 s); invalid key → real HF 401 → `PROVIDER_AUTH_ERROR` (terminal, ~1.0 s); provider suite 24/24. Not exercised against a Space. |
| 22 | Restart/recovery tested | **BLOCKED** | No Space to restart. Planned coverage (Health-gated requests, queue retries, no duplicate results) is documented; unreachable-host failure path is the nearest already-verified analogue. |
| 23 | BullMQ mass-screening architecture reviewed | **VERIFIED** | Worker concurrency bounded (default 3); deterministic job ids dedup; extraction dispatch reconciler with backoff; `ai-interviews-concurrency` e2e 6/6 on real Postgres; security matrix 15-case. |
| 24 | 5,000-app throughput estimate calculated | **NOT TESTED** | No throughput measurements (Space BLOCKED). Formula provided in report §23: `processing_time ≈ N / sustainable_per_minute` with queue/retry accounting. Cannot give a number without measurements. |
| 25 | Qwen GPU cost calculated | **VERIFIED** *(fixed cost)* | L4 $0.80/hr verified → 30d×24h **$576**; 30d×12h **$288**; 30d×8h **$192**; 8h **$6.40**; 12h **$9.60**; 24h **$19.20**. **Per-screening cost UNKNOWN** (no measured throughput); formula in report §24. |
| 26 | Security review completed | **VERIFIED** *(repo)* / **BLOCKED** *(Space)* | Repo: no secrets committed (`grep` for `hf_…`/Bearer clean), `backend/.env` gitignored, `test.env` token-free. Space itself couldn't be created/audited; planned controls (private+protected, secret-only credentials, bounded request size/timeouts, no secret/PII logging) are documented but not exercised. |
| 27 | Privacy review completed | **VERIFIED** *(repo)* / **BLOCKED** *(Space)* | Data-flow analysis documented (report §26). Only synthetic candidate data ("Alex Morgan") was used in hosted-Qwen runs. No real PII was sent anywhere; no Space data flows exist (no Space). |
| 28 | Regression suite completed | **VERIFIED** | Re-run on `f8326d6` (2026-09-22): backend jest **1385/1385 (78 suites)**, `tsc --noEmit` PASS, provider spec 24/24. Prior full matrix on same SHA: e2e 8 suites (187 PASS + 89 todo), concurrency 6/6, lint:changed PASS. Infra up (Docker running; test Postgres :5433, Redis :6380 healthy). |
| 29 | HF Router comparison documented | **VERIFIED** | Factual comparison in report §28 (no ranking): live-verified OpenAI-compatible path, no dedicated GPU, no cold start, meter-based. |
| 30 | HF Inference Endpoint comparison documented | **VERIFIED** *(doc)* | Comparison in report §29. Endpoint itself remains **BLOCKED** at creation (`403 Payment method required for namespace: Jupatho`). |
| 31 | HF Space architecture documented | **VERIFIED** *(doc)* | Full design/blueprint documented in report §30 (FastAPI gateway + vLLM + L4, auth via protected Space + secrets, health endpoint, vLLM args). Execution BLOCKED by account-level namespace rights / billing. |

## Implied-action summary (unblock path)

1. Attach a payment method / upgrade plan to namespace `Jupatho` (or provide a token/account that can). This single change removes both the Space 403 and the Inference-Endpoint 403 observed previously.
2. Re-run this checklist — items 5–15, 19–22, 26–27 (Space side) become testable.
3. The hosted-Qwen pipeline evidence (items 16–18, 21, 23) already covers the identical TalentAI code path and does not need repeating.