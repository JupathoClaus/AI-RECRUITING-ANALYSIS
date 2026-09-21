# Hugging Face — Qwen Hosted Deployment

Target: run `Qwen/Qwen3.5-9B` on a **Hugging Face Inference Endpoint** (engine: **vLLM**) and point the TalentAI Qwen screening provider at it.

Status: **documented plan, NOT executed.** Deployment is blocked on a Hugging Face access token and explicit authorization for a paid GPU endpoint (see §6, §7).

## 1. Why Qwen/Qwen3.5-9B

- It is the official upstream of the model already referenced in the codebase (`qwen3.5:9b`, ~9.7B, Q4_K_M locally). Licensing: Apache-2.0 — deployment authorized.
- The Hub repo publishes Transformers-format weights that are vLLM-compatible and can be served directly by an Inference Endpoint.
- It is the model TalentAI's `QWEN_MODEL` default refers to (`backend/…/ai-screening.config.ts`).

## 2. How TalentAI consumes the model (no code change needed)

The Qwen provider implements the OpenAI-compatible Chat Completions contract:

- `backend/src/modules/ai-screening/providers/qwen-screening.provider.ts` calls
  `client.chat.completions.create` with `response_format: { type: 'json_object' }`
  (`temperature 0.1`, `max_tokens 6000`).
- vLLM serves OpenAI-compatible routes at `/v1`, exactly the contract the code uses today against Ollama (`http://localhost:11434/v1`).
- Engines: only `QWEN_BASE_URL` / `QWEN_MODEL` / `QWEN_API_KEY` + `AI_SCREENING_PROVIDER=qwen` change. No provider code change is required.
- All determinism (schema validation, evidence verification, scoring, recommendation) lives in the backend and is unchanged by the endpoint swap.

## 3. Prerequisites (all BLOCKING, none currently present in this environment)

1. Hugging Face account with a **token** supplied through a secure channel **outside the repository** (OpenCode secure env / host environment variable / `hf auth login`). The token is never written to a file that is committed.
2. **Explicit authorization** to create a **paid GPU Inference Endpoint** (Inference Endpoints require an attached payment method). No billing changes are made without explicit authorization.
3. Access to the Hub from the backend host (or build host for the container image) — TLS outbound egress to `api.huggingface.co` / `*.endpoints.huggingface.cloud`.

## 4. Deployment procedure (run once credentials exist)

| Step | Action |
|---|---|
| 1 | Log in: `huggingface_hub` (Python 3.12) ≥ `0.23.x`, run `huggingface-cli login` (paste the token) OR export `HF_TOKEN`. Verify: `huggingface-cli whoami`. |
| 2 | Create the Inference Endpoint in the HF UI or via `InferenceEndpointsClient`: model **`Qwen/Qwen3.5-9B`**, provider **HF**, **vLLM** engine (OpenAI-compatible), region nearest to the backend, smallest GPU that fits 9B in bf16 with headroom (e.g. ~24 GB VRAM class); `max_total_tokens` adequate for 6000-token outputs. |
| 3 | Note the endpoint URL (shape `https://<your-endpoint>.endpoints.huggingface.cloud`) — keep it private (authenticated). |
| 4 | Backend config (one of): `docker-compose.yml` env passthrough (`AI_SCREENING_PROVIDER=qwen`, `QWEN_BASE_URL=https://<…>/v1`, `QWEN_MODEL=Qwen/Qwen3.5-9B`, `QWEN_API_KEY=hf_…`) or `.env` — secrets only via host env / secret store, never committed. |
| 5 | Restart the backend. Smoke test: request a screening; verify `AiScreeningResult` rows show `provider='qwen'`, `model='Qwen/Qwen3.5-9B'`, valid `responseId`, and a REAL score (not the mock provider's `AI_SCREENING_MOCK_SCENARIO` values). |
| 6 | Verify failure paths act as coded: temporarily set a wrong `QWEN_API_KEY` → `AiScreeningAuthenticationError` (401) surfaces as a terminal, observable failure; wrong URL → `PROVIDER_UNAVAILABLE`; 429 → `AiScreeningRateLimitError` (retryable). |

## 5. Operational notes

- **Cold start / scale-to-zero:** set a scale-to-zero policy if traffic is low; first request after idle pays model-load latency. Alert on 5xx (provider server error) and on screening `FAILED` rates.
- **Cost control:** the endpoint bills per hour of provision while up. Prefer scale-to-zero for non-continuous use; log endpoint uptime. Confirm expected monthly cost with the account owner before enabling.
- **Secrets:** `QWEN_API_KEY` is read by the backend only; the browser and public endpoints never receive it. Rotate via env re-deploy.
- **Update/rollback:** to change model or endpoint, update the env vars and restart; both are pure config, so rollback = revert env + restart. Rolling `QWEN_MODEL` back to `qwen3.5:9b` + Ollama restores the prior provider instantly.
- **Troubleshooting:** `AiScreeningResult.failure` + `failureCode` fields carry structured codes (`PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_AUTHENTICATION`, `PROVIDER_RATE_LIMIT`, `PROVIDER_MALFORMED_RESPONSE`, `PROVIDER_SERVER_ERROR`). Timeouts/5xx/429 are retried (bounded); malformed/401 are terminal and visible.
- **Prompt injection defense** is enforced in `qwen-criterion-screening.prompt.ts` (system message declares the resume body untrusted candidate data) and by the deterministic backend (fabricated quotes → `UNVERIFIED_EVIDENCE` → HUMAN_REVIEW). No endpoint config is required for this.

## 6. Current blocker (must be resolved by the user before deployment)

1. **Hugging Face access token** — deliver via a secure, non-repo channel.
2. **Authorization + payment method for a GPU Inference Endpoint** — this environment must not create/modify billing without explicit user approval.

Until both are provided, `docs/PHASE_1_EXTERNAL_VERIFICATION_REPORT.md` records the final status as **PHASE 1 BLOCKED** for the real-Qwen requirement.