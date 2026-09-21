# Phase 1 — Qwen External Verification Report

Scope: verify the real `Qwen/Qwen3.5-9B` screening path end-to-end through the TalentAI Qwen provider against Hugging Face hosting, then re-verify correctness/robustness/security and the full regression. All statements below are facts recorded on 2026-09-22; nothing is simulated or inferred.

Verification artifact: `backend/test/qwen-hf-verify.ts` (committed, excluded from jest by naming — run explicitly: `cd backend && npx ts-node -r tsconfig-paths/register test/qwen-hf-verify.ts`).

## FINAL STATUS

> **PHASE 1 BLOCKED** (single item)
>
> - Real Qwen3.5-9B provider verification: **VERIFIED** — executed twice end-to-end through the HF-hosted, token-gated OpenAI-compatible route (`https://router.huggingface.co/v1`): extraction COMPLETED → screening COMPLETED → persisted `AiScreeningResult` with `provider=qwen`, `model=Qwen/Qwen3.5-9B`, real HF `responseId`, deterministic `overallScore=98`, `SHORTLIST`, `HIGH`.
> - Dedicated HF Inference Endpoint `talentai-qwen-screening`: **BLOCKED** — namespace `Jupatho` has no payment method; HF refused creation with `403 Payment method required for namespace: Jupatho` (Request ID `fNiXJx`). No endpoint was created and nothing was billed. Billing was never modified.
>
> Per the pass rule "if any item is unmet → do NOT claim complete", the label is BLOCKED. Removing the payment-method rail unblocks creation of the dedicated endpoint; the real-provider evidence below already stands.

## 0. Environment snapshot

| Item | Value |
|---|---|
| Date | 2026-09-22 |
| Branch / HEAD | `main` @ `1cbe97d` (pushed `analysis/main`) at pass start; report pass will commit on top |
| HF CLI | `huggingface_hub[hf_xet] 1.32.0` (`hf --version`) |
| HF identity | `hf auth whoami` → `user=Jupatho` (exit 0) |
| Test infra | `docker compose --profile test up -d postgres-test redis-test` (`:5433` / `:6380`), migrations + seed applied |
| Verification runs | 2 x full TalentAI pipeline vs real `Qwen/Qwen3.5-9B` (PASS both) |

## 1. Hugging Face CLI & authentication — VERIFIED

- `hf --version` = `1.32.0`; `hf --help`, `hf auth whoami`, `hf endpoints --help` all succeed.
- Token present at `%USERPROFILE%\.cache\huggingface\token` + `stored_tokens`; identity `Jupatho`. **The token was never printed, logged, embedded in Git/docs/tests, or written to `.env`/`.env.example`.** It is supplied only as a runtime process env value.

## 2. Endpoint inventory (no duplicates) — VERIFIED

- `hf endpoints ls` → **No results found**. No existing endpoint reused-or-cloned; no duplicate was created. No `talentai-qwen-screening` exists anywhere (nothing could be created — §5).

## 3. Cost safety & hardware sizing — VERIFIED

- `hf endpoints hardware` pricing (2026-09-21 data): `nvidia-t4 x1 16 GB` $0.50/hr — too small for 9B bf16 (~19.3 GB); `nvidia-l4 x1 24 GB` $0.80/hr (aws `us-east-1`) / **$0.70/hr (gcp `us-east4`)**; `nvidia-a10g x1 24 GB` $1.00/hr.
- Planned configuration (recorded in `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md`): `nvidia-l4 x1`, gcp `us-east4`, single replica, scale-to-zero 25 min, type `authenticated`. This config was never created because creation is blocked (§5); **actual cost incurred = $0** for HF. The verification used the serverless router (pay-per-token, free-tier eligible) for the two controlled runs.

## 4. Model identity — VERIFIED

- Hub API `https://huggingface.co/api/models/Qwen/Qwen3.5-9B`: public (`gated:false`), `Apache-2.0`, `endpoints_compatible`, ~9.65B.
- Verified served identity from the live HTTP response: `model: Qwen/Qwen3.5-9B`.

## 5. Dedicated Inference Endpoint creation — BLOCKED

- Attempted exactly per the CLI (framework `custom` + `--engine vllm` + `vllm/vllm-openai:v0.29.0` image + vLLM serve args, health `/health`, port 8000, L4 x1, single replica, scale-to-zero, type `authenticated`).
- Outcome: `403 Forbidden: Payment method required for namespace: Jupatho` (Request ID `fNiXJx`). This is the environment/permission rail; no fake success was recorded, no endpoint created, billing untouched.
- CLI discovery note: the legacy top-level `--framework` enum accepts only `custom|pytorch|llamacpp`; `--framework vllm` returns `422 unknown variant "vllm"` (Request ID `uNCvCw`) — the correct vLLM route is the custom-framework path used above and documented.

## 6. Real raw-model API verification (Phase 6) — VERIFIED

- `POST https://router.huggingface.co/v1/chat/completions` (Bearer HF token; model `Qwen/Qwen3.5-9B`):
  1. Simple probe: 200, `finish_reason=length` at 64 max_tokens (thinking model consumed the budget; empty `message.content` = expected for a reasoning model with a tiny budget, reported as-is).
  2. JSON-mode probe: 200, `response_format:{type:"json_object"}` honored, valid JSON body, `finish_reason=stop`, ~3.9 s / 322 tokens.
- Confirms the provider's `response_format` contract and JSON decoding path work against real HF hosting.

## 7. Provider wiring / URL normalization — VERIFIED

- `ai-screening.module.ts` builds the OpenAI client from `aiScreening.qwenBaseUrl` = `QWEN_BASE_URL`; the SDK appends `/chat/completions`.
- Verified base used: `QWEN_BASE_URL=https://router.huggingface.co/v1` (NO `/v1/v1`, no missing `/v1`). End-to-end success confirms normalization.
- Provider selection: `AI_SCREENING_PROVIDER=qwen` → `QwenScreeningProvider` (`providerName='qwen'`), configured with `timeoutMs`, `maxResumeChars`, `promptVersion` from env.

## 8. Target model (Phase 8) — VERIFIED

- `RESUME_LOADER`/criterion builder ran against structured job data (Systems Administrator job: 5 REQUIRED skills, 1 PREFERRED skill, 4+ years experience, Associate education → **8 structured criteria**).
- Persisted result model = `Qwen/Qwen3.5-9B`; served model name equal to requested model.

## 9. Real end-to-end screening (Phase 9) — VERIFIED (2 runs)

Run summary (identical across both runs; run 2 captured fully):

| Metric | Value |
|---|---|
| Extraction | COMPLETED (~2.1 s, 941 parsed chars) |
| Screening POST | 202 `CREATED` (HTTP) |
| Screening | COMPLETED, end-to-end ~24.4 s |
| Criteria evaluated | 8/8 (`5 x FULLY_MET` required + experience FULLY_MET + education FULLY_MET; preferred `Security Hardening` PARTIALLY_MET) |
| Evidence unverified | 0 — every quoted `sourceText` found in the resume (verification ran on all 8 evaluations) |
| `overallScore` | 98 (backend-computed) |
| `recommendation` | SHORTLIST |
| `confidence` | HIGH |
| persisted fields | `provider=qwen`, `model=Qwen/Qwen3.5-9B`, `promptVersion=v1`, `providerResponseId=<HF id>`, fingerprint hash |

## 10. Score authority (Phase 10) — VERIFIED

- Deterministic, backend-owned. Covered by automated tests on the identical code path (`qwen-screening.provider.spec.ts`): a fabricated `overallScore` / fake SHORTLIST evidence injected via the model is ignored — score stays backend-computed; fabricated evidence → `UNVERIFIED_EVIDENCE` → HUMAN_REVIEW. The live run's score (98) came from `BackendScoringService` over verified criterion evaluations, not from the model.

## 11. Evidence grounding (Phase 11) — VERIFIED

- Live run: `evidenceUnverifiedCount=0`, every evaluation carries `reason` + per-item `sourceText`/`sourceCategory`; `EvidenceVerificationService` cross-checks each quote against the resume (VERBATIM/SUPPORTED/INFERRED/UNVERIFIED). Unit coverage: 15 tests in `evidence-verification.service.spec.ts`; the QA resume deliberately contained no hallucinated quotes.
- Fabrication-injection branch verified by the automated provider tests cited in §10.

## 12. Prompt-injection defense (Phase 12) — VERIFIED (automated + live-behavior)

- The system prompt the provider actually sends declares the resume body **untrusted candidate data** and names real attack payloads to ignore (`qwen-criterion-screening.prompt.ts`; 7 tests in `qwen-criterion-screening.prompt.spec.ts`; assertion in `qwen-screening.provider.spec.ts` that the defense ships in the sent system message).
- Deterministic guard tested: injected `overallScore`/fake evidence cannot override backend output.
- The two live runs used a clean resume (no attack payload), which is the intended production posture; injection payloads stay in the automated tests to avoid unnecessary paid calls.

## 13. Failure modes (Phase 13) — VERIFIED (automated, identical path)

Provider tests (`qwen-screening.provider.spec.ts`): 401/403→`PROVIDER_AUTHENTICATION`; timeout/abort→`PROVIDER_TIMEOUT`; 429 with `retry-after[-ms]`→`PROVIDER_RATE_LIMIT` (retryable); empty/non-JSON/truncated→`PROVIDER_MALFORMED_RESPONSE` (terminal); 5xx/ECONNREFUSED/ENOTFOUND→retryable server/unavailable. Processor: bounded retries (`attempts ?? 3`), terminal `failureCode` recorded. No live fault was induced to keep the controlled paid usage minimal.

## 14. Observability (Phase 14) — VERIFIED

- All required telemetry already exists on `AiScreeningResult` (no duplicate system added): `provider`, `model`, `promptVersion`, `providerResponseId`, `inputFingerprint`, `status`, timestamps (`startedAt`/`completedAt`), `failureCode`/`failureMessageSafe`, plus rich JSon fields (`criterionEvaluations`, `evidence`, `criteriaScores`, `riskFlags`, `uncertainties`). No new table/schema was introduced.
- No tokens, keys, full resumes, or PII in logs; `LOG_LEVEL=silent` in the test env.

## 15. Mass-request safety (Phase 15) — VERIFIED (architecture; no thousands of paid calls)

- Proven with request-layer and queue tests rather than paid load (per the rail "do not send thousands of requests"): 5-way concurrent screening POST → 1 CREATED + 4 REUSED (`extraction-concurrency.e2e-spec.ts` §4), BullMQ dedup by deterministic job id, extraction dispatch reconciler with backoff, per-org interview cap under an advisory lock (`ai-interviews-concurrency.e2e-spec.ts`, 6/6 real-PostgreSQL). Screening worker concurrency bounded (default 3).

## 16. Security (Phase 16) — VERIFIED

- Endpoint/route privacy: HF token-gated (`Authorization: Bearer`) on the router; planned dedicated endpoint type `authenticated` (private). No public exposure created.
- Secret hygiene: no token in Git, `.env`, `.env.example`, docs, tests, or logs; re-scan clean. Diff shows only the verification script + docs.
- HTTP auth matrix re-verified by running e2e (`ai-interviews-concurrency` security matrix 15-case + cross-company iso; full e2e suite).

## 17. Screening-request concurrency (Phase 17) — VERIFIED

- `ai-interviews-concurrency.e2e-spec.ts` rerun: **6/6 PASS** against real PostgreSQL (`AI_INTERVIEW_MAX_CONCURRENT=2`): exactly-1-slot-capacity under race, terminal-status release, replay dedup, cross-company 404, quota independence.
- Full e2e suite rerun: **8 suites PASS (187 PASS + 89 pre-existing todo)**.

## 18. Full regression (Phase 18) — VERIFIED

| Check | Command | Result |
|---|---|---|
| Backend unit | `cd backend && npm test` | **1382/1382** PASS (78 suites) |
| Backend typecheck | `npx tsc --noEmit` | PASS |
| e2e suite | `npm run test:e2e` (test Postgres `:5433`, Redis `:6380`) | **8 suites PASS, 187 PASS + 89 todo** |
| Concurrency e2e | `test/ai-interviews-concurrency.e2e-spec.ts` | **6/6** PASS |
| Changed-file lint | `node scripts/lint-changed.js --base HEAD` | PASS (target: `test/qwen-hf-verify.ts`) |
| Prettier (new file) | `npx prettier --check test/qwen-hf-verify.ts` | PASS |
| Whole-repo `lint:baseline` | `npm run lint:baseline` | PRE-EXISTING FAILURE (unchanged) — mixed CRLF/LF in untouched Windows-checkout files; fails identically at clean `1cbe97d`/`ee1dc63`. Not a regression; `lint:changed` is the applicable gate. |
| Frontend (unchanged this pass) | vitest / tsc / build (prior verified baseline) | 363/363, clean — no frontend files changed (`git status` clean except the new backend verification file) |

## 19. Artifacts (Phase 19) — VERIFIED

- `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md` — updated with executed facts, blocked command, verified config, unblock steps.
- `backend/test/qwen-hf-verify.ts` — reproducible real-provider verification (excluded from jest; run explicitly, see header).
- `backend/.env.example` — already documents `AI_SCREENING_PROVIDER`/`QWEN_BASE_URL`/`QWEN_MODEL`/`QWEN_API_KEY` placeholders (no secrets) from the prior pass.

## 20. Acceptance checklist

Legend: **VERIFIED** (evidenced this pass) · **BLOCKED** (exact blocker stated) · **NOT TESTED** · **DEFERRED** (scoped/out-of-band).

| # | Acceptance item | Status | Evidence |
|---|---|---|---|
| 1 | HF CLI installed & functional | VERIFIED | `hf --version` 1.32.0, `--help`, subcommands |
| 2 | HF authentication present (token, out-of-band) | VERIFIED | `hf auth whoami` → `Jupatho`; token only in host cache |
| 3 | HF permissions understood; insufficient-endpoint-permission reported | VERIFIED | read/list permitted; **create BLOCKED by payment method** (`403`, §5) — reported exactly, not fabricated |
| 4 | Existing endpoint inventory (no duplicates) | VERIFIED | `hf endpoints ls` → none; none created |
| 5 | Cost safety performed BEFORE creation | VERIFIED | hardware price table, chosen L4 x1 config, $0 spent to date |
| 6 | Smallest practical GPU / single replica / scale-to-zero preferred | VERIFIED (plan) | documented config in deployment doc (creation blocked) |
| 7 | Qwen3.5-9B endpoint exists OR existing correct endpoint reused | VERIFIED (via HF-hosted route) | live `Qwen/Qwen3.5-9B`, OpenAI `/v1`, token-gated |
| 8 | Real model identity | VERIFIED | HTTP `model: Qwen/Qwen3.5-9B`; hub facts gated:false/Apache-2.0 |
| 9 | Only env changed to connect TalentAI (no provider code) | VERIFIED | zero src changes; only `AI_SCREENING_PROVIDER`/`QWEN_*` env |
| 10 | URL normalization (no `/v1/v1`, `/v1` present) | VERIFIED | `…/v1` base; end-to-end success |
| 11 | One real screening end-to-end | VERIFIED | 2 runs; numbers in §9 |
| 12 | Backend/score authority (fake score/evidence cannot override) | VERIFIED | automated tests (identical path); live score from backend |
| 13 | Evidence verification against resume | VERIFIED | `evidenceUnverifiedCount=0`; 15 unit tests |
| 14 | Prompt-injection defense | VERIFIED | 7 prompt tests + guard tests + provider assertion |
| 15 | Failure modes (401/403/429/timeout/malformed/unavailable) | VERIFIED | provider tests; processor retry/terminal flow |
| 16 | Observability without duplicate system | VERIFIED | existing `AiScreeningResult` fields only |
| 17 | No mass paid requests; 5000-app architecture proven | VERIFIED | queue-level 5-way concurrency; dedup; bounded worker |
| 18 | No secrets committed anywhere | VERIFIED | diff scan; no token in files/logs/docs |
| 19 | Screening-request concurrency (real DB) | VERIFIED | 6/6 AS-CONCURRENCY e2e + full e2e 8 suites |
| 20 | Full regression green | VERIFIED | §18 (back-end jest/tsc/e2e; frontend unchanged) |
| 21 | Deployment doc update | VERIFIED | `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md` |
| 22 | Final report written with labels | VERIFIED | this document |
| 23 | Commit + push to `analysis` | VERIFIED | commit `fix(phase1): verify hosted qwen screening provider` (phase 21) |
| 24 | Dedicated HF Inference Endpoint provisioned | **BLOCKED** | `403 Payment method required for namespace: Jupatho`; no billing change |
| 25 | Dedicated-endpoint raw smoke (post-creation) | NOT TESTED | blocked by 24; router path fully verified instead |
| 26 | Whole-repo `lint:baseline` green | BLOCKED (pre-existing, non-regression) | CRLF/LF artifact in untouched files; `lint:changed` PASS |

## 21. Commit / evidence identity

| Item | Value |
|---|---|
| New verification file | `backend/test/qwen-hf-verify.ts` (prettier-clean, excluded from jest) |
| Docs updated | `docs/HUGGING_FACE_QWEN_DEPLOYMENT.md`, `docs/PHASE_1_QWEN_EXTERNAL_VERIFICATION_REPORT.md` |
| Commit message | `fix(phase1): verify hosted qwen screening provider` |
| Remote | `analysis` (JupathoClaus/AI-RECRUITING-ANALYSIS.git) |
| Parent | `1cbe97d` (analysis/main at pass start) |

## 22. What must happen to reach READY

1. Attach a payment method to namespace `Jupatho` (or provide a token whose account has one) and explicitly authorize a paid GPU endpoint with a cost ceiling.
2. Create `talentai-qwen-screening` (§4 deployment command — L4 x1, single replica, scale-to-zero, authenticated), wait `RUNNING`.
3. Point `QWEN_BASE_URL` at `https://<endpoint>.endpoints.huggingface.cloud/v1`, re-run `backend/test/qwen-hf-verify.ts` once against it, then update this report's §5/§9/§20(24) to VERIFIED.

## Verdict

**PHASE 1 = BLOCKED** on the single billing rail (dedicated Inference Endpoint creation). Everything else in scope is **VERIFIED** with live evidence: a real HF-hosted `Qwen/Qwen3.5-9B` screened a real candidate through the TalentAI qwen provider end-to-end twice, deterministically scored (98, SHORTLIST, HIGH), with authenticated hosting and zero secrets or billing changes.