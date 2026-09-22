# Phase 1 — Hugging Face GPU Space × L4 × Qwen3.5-9B × vLLM — Experiment Report

**Date of experiment and pricing check:** 2026-09-22
**Repository:** `JupathoClaus/AI-RECRUITING-ANALYSIS` (analysis remote), working tree `D:\AI interviewer\AI-Recruiter-Agent`
**HEAD at start / end:** `f8326d6`

Evidence classification used throughout (per task §42): **MEASURED** = actually observed · **ESTIMATED** = calculated from measurements · **UNKNOWN** = not tested · **BLOCKED** = impossible due to account/infrastructure limits.

---

## 1 Executive Summary

The dedicated GPU Space experiment **could not be executed**. The namespace `Jupatho` returns `403 Forbidden: You don't have the rights to create a space under the namespace "Jupatho"` for the experiment Space (`--sdk docker --private`), for a `--sdk static` variant, and for model-repo creation — a namespace-wide write/plan restriction. The same account was previously rejected for Inference Endpoint creation with a parallel billing error (`403 Payment method required for namespace: Jupatho`). Per the experiment guardrails I stopped **before any spend; nothing was created; $0 billed.**

What IS established with evidence:

- Current L4 Space pricing is **$0.80/hour** (`hf spaces hardware`, checked 2026-09-22; cross-checked with HF docs).
- The planned Space architecture (FastAPI/OpenAI-compatible gateway + vLLM ≥ 0.17.0 + Qwen3.5-9B BF16 on a single L4 24 GB) is technically coherent: weights ≈ 19.3–19.9 GB, leaving ~4–5 GB for KV cache at an 8K context ceiling, which matches TalentAI's screening needs (`AI_SCREENING_MAX_RESUME_CHARS` default 15000).
- The identical TalentAI pipeline (existing `QwenScreeningProvider` → OpenAI-compatible JSON → schema validation → evidence verification → deterministic scoring → `AiScreeningResult` persistence) was previously verified end-to-end twice against **HF-hosted `Qwen/Qwen3.5-9B`** (provider=qwen, model=Qwen/Qwen3.5-9B, `evidenceUnverifiedCount=0`, backend score 98, SHORTLIST/HIGH). That is pipeline evidence, **not** GPU-Space evidence.
- No blocker-side findings of the Space architecture itself: the failure was purely account-level (no paid plan / no payment method / no namespace write rights).

Final experimental status: **BLOCKED at Space creation — no GPU hardware was ever brought up, so no latency, throughput, VRAM, concurrency, restart, or GPU cost-per-screening result exists.** This report leaves those items exactly as `BLOCKED`/`UNKNOWN` and provides formulas so measurements can be completed the moment billing/unblock occurs.

## 2 Experiment Objective

Answer with measurements: "Can a Hugging Face Space running Qwen3.5-9B on an L4 24 GB GPU, served through vLLM, act as a reliable dedicated Qwen inference worker for TalentAI?"

Per-task items A–S could not be answered by measurement because no Space could be created. Their status: **BLOCKED (no Space)** except where the identical code path was already verified against hosted Qwen (D, E, F, G, H partially — see §11–§16). Never implied "production ready" — nothing was run.

## 3 Repository Baseline

- Branch `main`, HEAD `f8326d6`, working tree clean. 8 commits ahead of `origin/main`; pushes go to the `analysis` remote (verified `analysis/main = f8326d6`).
- Relevant artifacts inspected: `backend/src/modules/ai-screening/providers/qwen-screening.provider.ts` (461 lines), `ai-screening.module.ts` (provider factory, `QWEN_BASE_URL` required when `AI_SCREENING_PROVIDER=qwen`), `qwen-output.schema.ts`, `backend-scoring.service.ts`, `evidence-verification.service.ts`, `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md`, `docs/PHASE_1_QWEN_EXTERNAL_VERIFICATION_REPORT.md`, `backend/test/qwen-hf-verify.ts`, `backend/test/qwen-hf-failure-modes.verify.ts`.
- No source changes were required or made this pass (documentation-only, per task §43).

## 4 Hugging Face Environment

| Item | Value (checked 2026-09-22) |
|---|---|
| HF CLI | 1.32.0 (`hf --version`) |
| Auth | `hf auth whoami` → user=Jupatho, orgs=null, endpoint=null |
| Spaces capability (create) | **BLOCKED** — `403 Forbidden: You don't have the rights to create a space under the namespace "Jupatho"` (tried Docker SDK and Static) |
| Repo capability (create) | **BLOCKED** — same 403 for a private model repo (test probe; nothing created) |
| Inference Endpoints (create) | **BLOCKED** — prior verified: `403 Payment method required for namespace: Jupatho` (Request ID `fNiXJx`) |
| Compute Space requirement | HF docs: creating a Space that runs on compute (Gradio or Docker) requires a paid plan; Static Spaces are free |
| Token posture | token only in `C:\Users\claus\.cache\huggingface\token`; never printed/logged/committed; repo scan clean |

## 5 Space Configuration (Planned — not executed)

| Setting | Planned value |
|---|---|
| ID | `spaces/Jupatho/talentai-qwen35-l4-experiment` |
| Visibility | private + protected (HF login/credential required to call) |
| SDK | Docker |
| Hardware | `l4x1` (1× Nvidia L4, 24 GB) |
| Sleep | -1 disabled during benchmark; enable with a sleep time (e.g. 300 s) when idle to stop billing between tests |
| Secrets | `QWEN_API_KEY` via `--secrets` (or `--secrets-file`), mirrored on the TalentAI backend `QWEN_API_KEY` |
| API | `GET /health` (+ `/v1/models`), `POST /v1/chat/completions` (OpenAI-compatible via FastAPI proxy → vLLM) |
| Startup | `hf spaces pause` before config changes; `hf spaces restart` to apply; `hf spaces wait` for readiness |
| Teardown | `hf spaces pause` (stops billing) → delete repo / downgrade to CPU-basic |

## 6 GPU Configuration

- Target: **1× Nvidia L4**: 8 vCPU, 30 GB RAM, **24 GB VRAM**, 400 GB disk — $0.80/hr (**MEASURED**, `hf spaces hardware`).
- Billing model (HF docs, checked 2026-09-22): charged **by the minute while the Space runs on paid hardware, regardless of utilization**; upgraded Spaces run indefinitely unless a custom sleep time is set; pausing or switching to CPU-basic stops billing. Persistent volumes cost extra (not used here). Bandwidth/storage beyond the included disk: not enumerated by HF in the checked docs → **UNKNOWN**, negligible risk for the planned small payloads.
- No GPU was brought up → measured VRAM/utilization: **UNKNOWN**.

## 7 Qwen Model

- `Qwen/Qwen3.5-9B` — dense 9B-class (all ~9.65B act per token), hybrid attention (Gated DeltaNet + Gated Attention), 262K native context, multimodal (vision encoder), BF16 checkpoint ≈ 19.3–19.9 GB (community/model-card data; **not measured here**).
- Reasoning/thinking model: for TalentAI's criterion JSON task, disable thinking (`enable_thinking: false`) to get deterministic, JSON-output-friendly behavior without consuming the `max_tokens` budget on reasoning text (matches the hosted-Qwen behavior observed earlier: a 64-token probe returned empty content until the budget was raised).
- On L4 24 GB with 0.90 `gpu-memory-utilization`: ≈ 21.6 GB available → ≈ 1.7–2.3 GB KV-cache headroom at an 8K context ceiling (≈1 GB/K tokens) — acceptable for the planned screening workload (resume ≤ 15,000 chars + criteria + output budget). **ESTIMATED from card data, not measured.**

## 8 vLLM Configuration (Planned)

- Version: **stable ≥ 0.17.0** (vLLM recipes: "Install vLLM 0.17.0+" for Qwen3.5; earlier verified Docker image `vllm/vllm-openai:v0.29.0` satisfies this). Do not use <0.17.0 stable (no Qwen3.5 support).
- Recommended serve args (conservative, documented for the unblocked run):
  `vllm serve Qwen/Qwen3.5-9B --host 0.0.0.0 --port 8000 --served-model-name Qwen/Qwen3.5-9B --dtype bfloat16 --max-model-len 8192 --gpu-memory-utilization 0.90 --reasoning-parser qwen3 --default-chat-template-kwargs '{"enable_thinking": false}'`
- Known caveat (vLLM recipes): reduce `--max-cudagraph-capture-size` if "CUDA graph / Mamba cache size" errors occur (PR #34571).
- Conservative first; enable optimizations only after baseline measurements. All final args must be recorded in the Space README at deploy time.

## 9 Authentication

- Planned: **private + protected Space** + a credential exposed only as a Space secret (`QWEN_API_KEY`), transmitted as `Authorization: Bearer` from TalentAI's existing provider. Never in git, frontend, tests, logs, or this report.
- Decided alternative if protected-Space bearer access proves awkward for backend-to-backend: FastAPI middleware validating a long random bearer token from `QWEN_API_KEY` env, with 401 otherwise. This is an implementation detail awaiting the unblock.
- Handled: no Space exists, so nothing to secure yet; the repo-level secret review (§25) is done.

## 10 API Architecture

```
TalentAI backend ── existing QwenScreeningProvider ── HTTPS ── [protected HF Space]
        │                                                    FastAPI gateway
        │                                                    __/ health, /v1/models
        └─────────────────────────────────────────────────── /v1/chat/completions
                                                            └─ vLLM ─ Qwen3.5-9B ─ L4
```
- The Space is **only an inference worker**. TalentAI's Postgres, Redis, auth, ATS, screening orchestration, scoring, evidence verification, and business logic stay in the repo — nothing moved to the Space.
- URL normalization (critical, verified against the existing provider): `QWEN_BASE_URL=<space-url>/v1`; the OpenAI SDK appends `/chat/completions` + `/models`. Never `<space-url>/v1/v1` and never `<space-url>` bare.
- Provider wiring requires **no code change**: `AI_SCREENING_PROVIDER=qwen`, `QWEN_BASE_URL`, `QWEN_MODEL=Qwen/Qwen3.5-9B`, `QWEN_API_KEY` (see §12).

## 11 Raw Qwen Verification

- **BLOCKED** against the Space (none exists). The equivalent raw OpenAI-compatible probe was previously run against HF-hosted Qwen (`router.huggingface.co/v1`): JSON-mode probe 200, `response_format:{type:"json_object"}` honored, valid JSON, `finish_reason=stop`, ~3.9 s / 322 tokens (MEASURED, hosted — not L4).
- Planned Space probe sequence (for the unblocked run, per task §12): 5 sequential harmless requests, temperature 0.1, `max_tokens` 512+, record p50/p95/min/max/failures.

## 12 TalentAI Integration

- Provider inspected end-to-end (`qwen-screening.provider.ts`): builds the criterion prompt from `ScreeningInput`; calls Chat Completions with `response_format: json_object`, `temperature: 0.1`, `max_tokens: 6000`, SDK `timeout` from config; rejects `finish_reason=length`; validates via `validateQwenOutput`; runs `prohibited-reasoning.guard`, `BackendScoringService`, `EvidenceVerificationService`; throws typed errors (`PROVIDER_AUTH_ERROR`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMIT`, `PROVIDER_MALFORMED_RESPONSE`, `PROVIDER_UNAVAILABLE`, `PROVIDER_SERVER_ERROR`, `PROVIDER_UNEXPECTED_ERROR` — transport classification fixed in prior pass).
- Config defaults: `aiScreening.timeoutMs` 60000, `aiScreening.maxResumeChars` 15000, `promptVersion` v1; module rejects boot if `QWEN_BASE_URL` missing when `AI_SCREENING_PROVIDER=qwen`.
- **No configuration or code correction was necessary or made** — the provider already speaks OpenAI-compatible Chat Completions (the same contract vLLM exposes). This is the core "no code-specific coupling" claim, already proven against hosted Qwen.

## 13 Real Screening Result

- **BLOCKED** for the Space pipeline. The identical pipeline (Application → extraction → screening request → Qwen → structured output → schema validation → evidence verification → deterministic scoring → recommendation → persistence) was completed **twice against HF-hosted `Qwen/Qwen3.5-9B`** (prior pass, MEASURED): Systems Administrator job, synthetic "Alex Morgan" resume, screening COMPLETED ~24.4 s E2E, 8/8 criteria, `overallScore=98` (backend-computed), SHORTLIST/HIGH, rows persisted with `provider=qwen`, `model=Qwen/Qwen3.5-9B`, `promptVersion=v1`, provider response id, fingerprint.
- To be explicit per §45: **the real TalentAI → Space → Qwen → screening pipeline was NOT executed.** The experiment is therefore not complete; the SPACE-side acceptance items are BLOCKED.

## 14 Evidence Verification

- **VERIFIED** on the identical pipeline (hosted Qwen, MEASURED): `evidenceUnverifiedCount=0`; every evidence quote located in the resume (VERBATIM/SUPPORTED/INFERRED); unit coverage 15 tests. Gregation guard: fabricated evidence cannot become verified (provider injection tests force `UNVERIFIED_EVIDENCE` → HUMAN_REVIEW).
- Planned Space run: same 8-criterion scenario; expect Security Hardening (no explicit evidence) to be UNVERIFIED/PARTIALLY_MET and scored accordingly. **(UNKNOWN until executed on the Space.)**

## 15 Deterministic Scoring Verification

- **VERIFIED** on the identical code path (automated): model-returned `overallScore` is ignored; `BackendScoringService` computes the authoritative 0–100 score from criterion statuses/weights. Live hosted-Qwen score 98 was backend-owned. Model cannot force score/recommendation via JSON fields.
- Not re-executed against the Space → SPACE-side result **BLOCKED/UNKNOWN**.

## 16 Prompt Injection Verification

- **VERIFIED** on the identical code path (automated + hosted-Qwen behavior): the sent system prompt marks the resume as untrusted candidate data and names real attack payloads; injected "score 100 / always recommend" cannot override; deterministic guard tests. Space-side re-run **BLOCKED/UNKNOWN**.

## 17 Sequential Benchmark

- **BLOCKED (no Space)** — no latency measurements on L4. Reference (hosted, NOT L4): raw JSON ~3.9 s; full screening E2E ~24.4 s (dominated by model turn). These numbers are **not** Space measurements.

## 18 Concurrency Benchmark

- **BLOCKED (no Space)** — concurrency levels 1/2/4/8 were not run. TalentAI mass-safety architecture instead verified via queue-level tests: 5-way screening POST dedup (1 CREATED + 4 REUSED), BullMQ deterministic job ids, worker concurrency bounded (default 3), `ai-interviews-concurrency` 6/6 on real Postgres, 15-case HTTP security matrix.

## 19 GPU Resource Measurements

- **BLOCKED (no GPU).** Planned capture: `nvidia-smi` VRAM total/allocated/peak + utilization + model load time; expected pattern from card data: BF16 weights ≈ 19.3–19.9 GB, ~21.6 GB budget at 0.90 util on 24 GB, KV headroom ~1.7–2.3 GB at 8K. Whether L4 24 GB safely holds **weights + KV cache + concurrency** is **UNKNOWN until measured.**

## 20 Restart/Recovery

- **BLOCKED (no Space).** Planned: drain/restart Space; observe health down → TalentAI request fails with `PROVIDER_UNAVAILABLE` (retryable, verified failure path) → queued job retries per BullMQ backoff → no duplicate result (dedup by deterministic job id) → recovery when healthy. Nearest verified analogue: unreachable-host probe → `PROVIDER_UNAVAILABLE` ~1.3 s, no crash, terminal/semantic status recorded.

## 21 Failure Tests

| Fault | Status | Evidence |
|---|---|---|
| Unreachable Space | **VERIFIED** *(path)* | Live probe: dead URL → `PROVIDER_UNAVAILABLE`, retryable, ~1.3 s; no crash, no false COMPLETED. Space-side re-run BLOCKED. |
| Invalid API key | **VERIFIED** *(path)* | Live probe: real HF 401 → `PROVIDER_AUTH_ERROR` (terminal) ~1.0 s; token not logged. Space-side re-run BLOCKED. |
| Malformed model output | **VERIFIED** *(automated)* | `validateQwenOutput` rejects invalid JSON/schema → `PROVIDER_MALFORMED_RESPONSE` (terminal); invalid output cannot persist as COMPLETED; 24/24 provider tests. |
| Timeout | **VERIFIED** *(automated)* | SDK timeout → `PROVIDER_TIMEOUT` (retryable); bounded retries; dedup prevents duplicates. |
| Restart/recovery | **BLOCKED** | No Space (§20). |

## 22 BullMQ / Mass-Recruitment Model

- Reviewed (VERIFIED, architecture): BullMQ queue + screening worker with bounded concurrency (default 3) is the protected path to the Qwen worker; deterministic job ids guarantee dedup; extraction dispatch reconciler already applies backoff. 5,000 apps → ~5,000 jobs at default concurrency 3.
- No code change needed. If the Space benchmark later justifies it, `AI_SCREENING_CONCURRENCY` can raise the worker concurrency — **do not set it to thousands**. This remains configuration, not a requirement today.

## 23 5,000-Application Estimate

- **NOT TESTED / UNKNOWN** — no Space throughput measurement exists, so no honest number can be given.
- Formula once measured (label as **ESTIMATED**):
  `processing_time ≈ N ÷ (sustainable_screenings_per_minute_from_benchmark) + queue_delay + retry_overhead + model_warmup`
  where `N ∈ {500, 1,000, 5,000, 10,000}`. One benchmark run is *not* a production guarantee (§42).

## 24 Cost Analysis

Verified unit prices (MEASURED, 2026-09-22): **1× Nvidia L4 = $0.80/hr** (`l4x1`).

| Duration | Cost (USD) |
|---|---|
| 1 hour | $0.80 |
| 8 hours | $6.40 |
| 12 hours | $9.60 |
| 24 hours | $19.20 |
| 30 days × 24 h/day | **$576** |
| 30 days × 12 h/day | **$288** |
| 30 days × 8 h/day | **$192** |

- Fixed GPU cost only (compute per applicant is **UNKNOWN** until throughput is measured). Once measured:
  `cost_per_screening ≈ $0.80 ÷ (screenings_per_hour)` — **ESTIMATED**, benchmark-derived, then scaled ×{1,000 | 5,000 | 10,000}.
- Qwen compute cost is deliberately separated from Tavus, database, Redis, storage, email, frontend, backend, monitoring (Qwen GPU compute is the focus here; nothing else was evaluated).

## 25 Security Review

- Repo (VERIFIED): no `hf_…`/Bearer tokens in any tracked or visible file (pattern scan clean); `backend/.env` gitignored (`git check-ignore`); `backend/test/env/test.env` tracked but token-free; working tree clean; this pass changed docs only.
- Planned Space controls (documented; **not exercised** — no Space): private+protected; credential only as a secret; 401 on missing/invalid bearer; no secret/PII/Authorization/full-resume logging; bounded request size (resume ≤ 15,000 chars) and bounded timeouts; CORS restricted to TalentAI origin; no debug endpoints; minimal open ports (8000 behind Space routing/auth).
- CORS/port/exposure verification for the Space itself: **BLOCKED/UNKNOWN.**

## 26 Privacy Review

- Data-leaving-repo (MEASURED, prior hosted runs): only the synthetic "Alex Morgan" resume + structured job criteria reached an HF endpoint; no real candidate PII was ever sent. No Space exists → no Space data flows, logging, storage, or retention to inventory.
- Planned Space logging: request metadata only (route, status, latency, token usage); responses not logged; Space secrets never logged.
- HF Platform data-retention statements were **not** used as the basis of any claim; any retention guarantees would need a current HF Terms/Privacy check at deploy time (noted as an open question, §32).
- How data is deleted if used later: `hf spaces pause` + delete the Space repo; no persistent volume mounted (ephemeral disk only) → no residual resume data by design.

## 27 Regression Tests

Re-run on `f8326d6` (2026-09-22) — no source changes, docs-only pass:

| Check | Command | Result (MEASURED) |
|---|---|---|
| Backend unit | `cd backend && npm test` | **1385/1385** PASS (78 suites) |
| Backend typecheck | `npx tsc --noEmit` | PASS |
| Qwen provider spec | `jest qwen-screening.provider` | **24/24** PASS |
| e2e suite | `npm run test:e2e` (Postgres :5433, Redis :6380) | **8 suites PASS, 187 PASS + 89 todo** (verified at this SHA in the prior pass) |
| Concurrency e2e | `test/ai-interviews-concurrency.e2e-spec.ts` | **6/6** PASS (verified at this SHA) |
| Changed-file lint | `node scripts/lint-changed.js --base HEAD` | PASS (verified at this SHA) |
| Frontend | vitest / tsc / build | **363/363** prior baseline; no frontend files changed this pass |
| Infra | `docker ps` | postgres-test :5433 + redis-test :6380 **up & healthy** |

Whole-repo `lint:baseline`: pre-existing CRLF/LF failure in untouched files (non-regression, unchanged). Status: VERIFIED (numbers match the same-SHA baseline exactly; no changes this pass).

## 28 HF Router Comparison

| Dimension | HF Router (`router.huggingface.co/v1`) |
|---|---|
| Dedicated GPU | No (serverless/multitenant inference hosting) |
| Always-on / cold start | On-demand; no cold start observed (~1 s first token on live probes) |
| Operational responsibility | HF-managed; no Space infra to operate |
| Scaling / concurrency | HF-managed; bounded by HF quotas (not tunable by us) |
| Measured latency | MEASURED hosted: raw JSON ~3.9 s; screening E2E ~24.4 s (these are router numbers, not L4) |
| Measured throughput | Not benchmarked → UNKNOWN |
| Cost | Meter/plan-based; **not verifiably priced** for this account → UNKNOWN |
| Security controls | Token-gated; OpenAI-compatible; no dedicated isolation |
| API compatibility | OpenAI-compatible → existing provider works unchanged (VERIFIED, live E2E) |
| TalentAI integration complexity | Zero — already used in the verified pipeline |
| Failure/recovery | Live failure probes VERIFIED (`PROVIDER_UNAVAILABLE`, `PROVIDER_AUTH_ERROR`) |
| Suitability for mass recruitment | Architecture-verified via queue; throughput UNKNOWN; qualifies as current default |
| Current blockers | None for pipeline; SLA/rate limits unverified |

## 29 HF Inference Endpoint Comparison

| Dimension | HF Inference Endpoint |
|---|---|
| Dedicated GPU | Yes (isolated) |
| Always-on / cold start | Always-on, scale-to-zero optional |
| Operational responsibility | HF-managed |
| Scaling / concurrency | Explicit replicas (configurable) |
| Measured latency | **UNKNOWN** — create blocked |
| Measured throughput | **UNKNOWN** |
| Cost | Endpoint L4 SKU pricing could not be verified this pass (prior pricing note: AWS-NVIDIA-L4 endpoint SKU listed as removed); **UNKNOWN** while blocked |
| Security controls | `authenticated` type planned (private); token-gated |
| API compatibility | OpenAI-compatible |
| TalentAI integration complexity | Low — same `QWEN_BASE_URL` pattern |
| Failure/recovery | Not measured (blocked) |
| Suitability for mass recruitment | Unknown while blocked |
| Current blockers | **`403 Payment method required for namespace: Jupatho`** — requires billing on the namespace |

## 30 HF Space Architecture

| Dimension | HF GPU Space + vLLM (planned) |
|---|---|
| Dedicated GPU | Yes — `l4x1` L4 24 GB |
| Always-on / cold start | Always-on by default on paid hardware; optional sleep time; cold start = model reload (vLLM BF16 load, typically minutes — UNKNOWN until measured) |
| Operational responsibility | Us (FastAPI gateway + vLLM flags); HF hosts the container |
| Scaling / concurrency | Single instance; concurrency limited by VRAM KV cache + vLLM config |
| Measured latency | **UNKNOWN — Space never created** |
| Measured throughput | **UNKNOWN** |
| Cost | $0.80/hr L4 (MEASURED) → $576/mo 24/7, $288/mo 12h/day, $192/mo 8h/day |
| Security controls | private + protected + secret credential (planned) |
| API compatibility | OpenAI-compatible via vLLM + FastAPI proxy |
| TalentAI integration complexity | Low — same `QWEN_BASE_URL=/v1` pattern; no provider change |
| Failure/recovery | Failure path verified for the provider; restart flow planned (§20) |
| Suitability for mass recruitment | Unknown until benchmarked; bounded by single-GPU KV cache |
| Current blockers | **Space creation 403 under namespace `Jupatho`**; compute Spaces require a paid plan (billing) |

## 31 Known Limitations

- **No Space was created** — every Space-side measurement is absent by definition; the report does not fabricate them.
- Hosted-Qwen numbers are **not** L4 numbers; they validate the TalentAI code path only.
- L4 VRAM fit is **ESTIMATED from model-card data**, not measured.
- HF data-retention/private-policy specifics were not relied upon and remain an open compliance question for real deployment.
- The namespace `Jupatho` cannot create repositories of any kind at present (Space/model/dataset create → 403).

## 32 Open Questions

1. Will attaching a payment method / upgrading the plan unblock BOTH Space creation (403 rights) and Endpoint creation (403 payment method)? Almost certainly one root cause — to be confirmed by HF support.
2. Measured VRAM headroom at 8K/16K context and concurrency up to 8 — does L4 hold weights + KV + concurrent jobs without OOM?
3. Real L4 sustained screening throughput and cost-per-screening.
4. HF Platform data handling/retention terms for candidate-like text (security/compliance sign-off for production use).
5. vLLM stable version pinned at deploy time (>= 0.17.0) and any Mamba/cudagraph workarounds on L4.

## 33 Acceptance Checklist

See `docs/PHASE_1_QWEN_SPACE_EXPERIMENT_ACCEPTANCE.md` — 31 criteria with VERIFIED/BLOCKED/NOT TESTED labels. Headline: 14 VERIFIED (mostly pricing, pipeline, regression, docs), 13 BLOCKED (Space-side), 1 NOT TESTED (5k throughput), the rest effectively covered by pipeline evidence.

## 34 Final Experimental Status

**BLOCKED at Space creation** — namespace `Jupatho` cannot create a Space (`403 … don't have the rights to create a space under the namespace "Jupatho"`), and the account lacks the billing/plan required for compute Spaces (parallel to the previously confirmed `403 Payment method required` for Inference Endpoints). **Nothing was created; $0 billed; experiment stopped before spending per the guardrails.**

What the owner should know to decide:
- The TalentAI→Qwen→structured-output→evidence→scoring path is already proven end-to-end against HF-hosted `Qwen/Qwen3.5-9B` with the existing provider — no code change is needed for any of Router / Endpoint / Space hosting.
- L4 Space cost is confirmed ($0.80/hr) but throughput and cost-per-screening remain **UNKNOWN** until the account can create a Space.
- The single unblock is: payment method / paid plan on namespace `Jupatho`. After that, create the Space per §5/§8 and execute the checklist — items 5–15, 19–22, 26–27 unlock directly. Items 16–18, 21, 23, 28–31 need no re-testing (identical code path / documented).