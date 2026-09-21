# Hugging Face — Qwen Hosted Deployment

Target: run `Qwen/Qwen3.5-9B` behind an OpenAI-compatible `/v1` endpoint (engine **vLLM**) and point the TalentAI Qwen screening provider at it.

Status (2026-09-22): **real Qwen verification COMPLETE** via the Hugging Face-hosted, token-gated OpenAI-compatible route (`https://router.huggingface.co/v1`) through the full TalentAI pipeline. **Dedicated Inference Endpoint creation REMAINS BLOCKED**: the `Jupatho` namespace has no payment method attached, so HF refused endpoint creation (403) before anything was provisioned or billed.

## 1. Why Qwen/Qwen3.5-9B

- Official upstream of the model referenced in the codebase (`qwen3.5:9b`). Licensing: **Apache-2.0** — deployment authorized.
- Hub repo verified live (`https://huggingface.co/api/models/Qwen/Qwen3.5-9B`): public (`gated:false`), `endpoints_compatible`, ~9.65B params. Transformers-format weights are vLLM-compatible.
- It is the model TalentAI's `QWEN_MODEL` refers to (`backend/…/ai-screening.config.ts`).

## 2. How TalentAI consumes the model (verified, no provider code change needed)

The Qwen provider implements the OpenAI-compatible Chat Completions contract:

- `backend/src/modules/ai-screening/providers/qwen-screening.provider.ts` calls `client.chat.completions.create` with `response_format: { type: 'json_object' }` (`temperature 0.1`, `max_tokens 6000`).
- Engine swap is pure configuration: `AI_SCREENING_PROVIDER=qwen`, `QWEN_BASE_URL` (must end in `/v1` — the OpenAI SDK appends `/chat/completions`, so `…/v1/chat/completions` or `…/v1/v1` are wrong), `QWEN_MODEL`, `QWEN_API_KEY`.
- All determinism (schema validation, evidence verification, backend scoring, recommendation, fingerprinting) is unchanged by the endpoint swap and was executed live (see §4).

## 3. Prerequisites — current state (2026-09-22)

| # | Prerequisite | State |
|---|---|---|
| 1 | Hugging Face **token** delivered out-of-band | **PRESENT** — `%USERPROFILE%\.cache\huggingface\token`; `hf auth whoami` → `user=Jupatho` (exit 0). Token is runtime-secret only: never printed, logged, or committed. |
| 2 | HF CLI | **PRESENT** — `huggingface_hub[hf_xet]==1.32.0` (pip `--user`); binaries in `%APPDATA%\Python\Python312\Scripts\` (`hf.exe`, `huggingface-cli.exe`). |
| 3 | **Payment method / explicit authorization for a paid GPU Inference Endpoint** | **BLOCKING** — namespace `Jupatho` has none. Endpoint creation returns `403 Forbidden: Payment method required for namespace: Jupatho` (Request ID `fNiXJx`). No billing change was attempted. |
| 4 | TLS egress to `api.huggingface.co` / `router.huggingface.co` | **VERIFIED** (live requests succeeded). |

## 4. Execution history (verified facts)

1. `hf endpoints ls` → **No results found** (no existing endpoints; no duplicate created).
2. `hf endpoints hardware` → pricing table. Smallest GPU that fits 9B bf16 (~19.3 GB): **nvidia-l4 x1 24 GB** — `$0.80/hr` (aws `us-east-1`) / `$0.70/hr` (gcp `us-east4`); `nvidia-t4 x1 16 GB` `$0.50/hr` too small; `nvidia-a10g x1 24 GB` `$1.00/hr`.
3. CLI deploy attempt #1 failed with `422 model.framework: unknown variant "vllm", expected one of custom, pytorch, llamacpp` (Request ID `uNCvCw`) — the legacy top-level `--framework` enum does not accept `vllm`. The correct route is framework **custom** + `--engine vllm` + a custom image.
4. CLI deploy attempt #2 (correct route) failed with **`403 Forbidden: Payment method required for namespace: Jupatho`** (Request ID `fNiXJx`) — namespace billing is the only remaining blocker. **Nothing was created; `$0` billed.**
5. **Real Qwen verification succeeded without creating paid infra** using the HF-hosted serverless router (`https://router.huggingface.co/v1`, token-gated, same `Qwen/Qwen3.5-9B`, OpenAI-compatible):
   - Raw API: `GET`/`POST /v1/chat/completions` → 200, `model: Qwen/Qwen3.5-9B`, valid JSON incl. `response_format: { type: 'json_object' }` (2.1–3.9 s for short probes).
   - Full TalentAI pipeline executed **twice** via `backend/test/qwen-hf-verify.ts`: extraction COMPLETED → real screening COMPLETED → persisted `AiScreeningResult` with `provider='qwen'`, `model='Qwen/Qwen3.5-9B'`, HF `responseId`, `overallScore=98`, `recommendation=SHORTLIST`, `confidence=HIGH`, 8/8 criteria evaluated, 0 unverified evidence quotes. End-to-end screening duration ~24.4 s.

### Exact command blocked on payment (kept here for when authorization is granted)

```powershell
hf endpoints deploy talentai-qwen-screening `
  --repo Qwen/Qwen3.5-9B --framework custom --engine vllm `
  --custom-image vllm/vllm-openai:v0.29.0 `
  --container-command "vllm serve" `
  --container-args "Qwen/Qwen3.5-9B --host 0.0.0.0 --port 8000 --served-model-name Qwen/Qwen3.5-9B --max-model-len 8192 --gpu-memory-utilization 0.9 --trust-remote-code" `
  --health-route /health --port 8000 `
  --vendor gcp --region us-east4 --accelerator gpu `
  --instance-type nvidia-l4 --instance-size x1 `
  --min-replica 1 --max-replica 1 --scale-to-zero-timeout 25 `
  --type authenticated
```

Planned guarantees (do not weaken): authenticated/protected type, single replica, scale-to-zero, smallest viable GPU, no duplicate endpoint.

## 5. Config (how to switch) — VERIFIED

| Env | Value | Notes |
|---|---|---|
| `AI_SCREENING_PROVIDER` | `qwen` | provider factory selects the Qwen provider |
| `QWEN_BASE_URL` | `https://router.huggingface.co/v1` (verified) or `https://<endpoint>.endpoints.huggingface.cloud/v1` (future) | must include `/v1`, never doubled |
| `QWEN_MODEL` | `Qwen/Qwen3.5-9B` | must match `served-model-name` |
| `QWEN_API_KEY` | HF token (runtime secret) | never committed |

Failure paths verified via provider tests (identical code path): 401/403 → `AiScreeningAuthenticationError`; timeout → `AiScreeningTimeoutError`; 429 (honoring `retry-after[-ms]`) → `AiScreeningRateLimitError`; non-JSON/empty/truncated → `AiScreeningMalformedResponseError`; 5xx/connection-refused → retryable provider errors with terminal `failureCode`.

## 6. Operational notes

- **Router vs Inference Endpoint:** the router is shared, serverless, pay-per-token HF hosting (free-tier credits apply), ideal for verification/light traffic. A dedicated Inference Endpoint bills per provisioned hour and gives dedicated capacity; require scale-to-zero for non-continuous use. Moving between them is a `QWEN_BASE_URL` change.
- **Cold start / scale-to-zero:** first request after idle pays model-load latency on a dedicated endpoint; the router has no cold-start for warm models.
- **Secrets:** `QWEN_API_KEY` is read by the backend only; browser and public endpoints never receive it. Rotate via env re-deploy.
- **Monitoring:** alert on screening `FAILED` rates and on `failureCode = PROVIDER_SERVER_ERROR`. Structured codes: `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_AUTHENTICATION`, `PROVIDER_RATE_LIMIT`, `PROVIDER_MALFORMED_RESPONSE`, `PROVIDER_SERVER_ERROR`.
- **Prompt injection defense** ships in `qwen-criterion-screening.prompt.ts` (resume body declared untrusted candidate data) and is enforced by the deterministic backend (fabricated quotes → `UNVERIFIED_EVIDENCE` → HUMAN_REVIEW; fake `overallScore` ignored). No endpoint config required.

## 7. Remaining blocker (only one) and unblock steps

1. Attach a **payment method** to the `Jupatho` namespace (or supply a token whose account has one) and explicitly authorize a paid GPU endpoint with a cost ceiling.
2. Run the §4 deployment command (or the UI equivalent), wait for `RUNNING`, then verify `hf endpoints describe talentai-qwen-screening` shows the planned hardware/scaling/security.
3. Point TalentAI at the endpoint via §5 env (`QWEN_BASE_URL=https://<endpoint>.endpoints.huggingface.cloud/v1`); re-run `npx ts-node -r tsconfig-paths/register test/qwen-hf-verify.ts` against it.

Until then the dedicated-endpoint item stays **BLOCKED**; the real-Qwen-provider-verification item is **VERIFIED** via the HF-hosted route (see `docs/PHASE_1_QWEN_EXTERNAL_VERIFICATION_REPORT.md`).