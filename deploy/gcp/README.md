# Migrate AI Recruiter Screening: Lightning Qwen + vLLM → Google Cloud GPU

## What this is

The **Qwen CV scoring model was already working** on Lightning AI (vLLM). The
reason for this migration is **not** a model failure — it is Lightning GPU
**reliability**: Studios intermittently booted without the NVIDIA T4 attached,
`nvidia-smi` was unavailable, vLLM could not infer a CUDA device, and the public
endpoint returned 502.

So this task is: **reproduce the exact same model + compatible serving config on a
reliable Google Cloud GPU host.** We do **not** swap the checkpoint unless it is
provably incompatible with the chosen Google GPU.

---

## 1. Recovered source deployment (exact)

Recovered from `backend/.env`,
`verification/candidates-live-acceptance.mjs`, and
`backend/src/modules/ai-screening/providers/qwen-screening.provider.ts`.

| Item | Value |
|------|-------|
| Model id | `Qwen/Qwen3.5-9B` |
| Server | **vLLM**, OpenAI-compatible |
| Internal listen | `http://127.0.0.1:8000` |
| Health | `GET /health` → 200 |
| Public base URL | `https://8000-01m0f953aw1erhbeq8z1kkv2vm.cloudspaces.litng.ai/v1` |
| Lightning studio | `s_01m0f953aw1erhbeq8z1kkv2vm` |
| Start script (on studio) | `/teamspace/studios/this_studio/start-vllm.sh` (`bash` it; `pkill -f '[v]llm serve'` stops it) |
| Backend provider | `qwen` |
| Backend envs | `AI_SCREENING_PROVIDER=qwen`, `QWEN_BASE_URL`, `QWEN_MODEL`, `QWEN_API_KEY` (default `ollama`) |

Backend call contract (must be honored by anything we deploy):

```
POST <baseUrl>/chat/completions
{
  "model": "<QWEN_MODEL>",
  "messages": [ {role:system}, {role:user} ],
  "response_format": {"type":"json_object"},
  "temperature": 0.1,
  "max_tokens": 6000
}
```

The `response_format: json_object` requires **JSON/guided decoding**, which vLLM
supports natively.

---

## 2. GPU choice (reliability-first, same checkpoint)

**Checkpoint verified against Hugging Face (this migration, de-risk step):**
`Qwen/Qwen3.5-9B` resolves publicly (not gated), with:
- **9.65B params**, ~**19.3 GB total** across 4 `model.safetensors-*` shards
- dtype **BF16**, architecture `Qwen3_5ForConditionalGeneration`
  (an `image-text-to-text` **multimodal** model; our use-case sends **text-only**
  chat, which vLLM's OpenAI-compatible endpoint serves in the normal way)
- config `response_format: json_object` is handled by vLLM guided/JSON decoding

**GPU fit (hard numbers):**
- **L4 (24 GB)** — BF16 weights are ~19.3 GB, so L4 loads them **without
  quantization** and with headroom. This is the recommended, reliability-first
  choice. It is also the minimum that fits this exact checkpoint.
- **T4 (16 GB)** — physically **cannot** hold 19.3 GB of BF16 weights; the
  original Lightning T4 must therefore have used a **quantized** build. We do
  not guess at that quantization; we deploy on L4 instead.

Because the checkpoint is **provably compatible with the selected GPU (L4)**, the
task rule — "do not substitute a different Qwen checkpoint unless provably
incompatible with the selected Google GPU" — means **we keep `Qwen/Qwen3.5-9B`
unchanged**. No model substitution.

Chosen VM: `g2-standard-12` (4 vCPU, 48 GB RAM) + `nvidia-l4` ×1, 200 GB SSD.

---

## 3. Deploy

Requirements: `gcloud` authenticated, a project with billing + **Compute Engine
API**, and **GPU quota** for the chosen accelerator.

```bash
cd deploy/gcp

export GCP_PROJECT=your-project-id
export GCP_REGION=us-central1
export GCP_ZONE=us-central1-a
export GCP_MACHINE_TYPE=g2-standard-12
export GCP_ACCELERATOR=nvidia-l4
# The model source. Defaults to the exact recovered id.
export GCP_MODEL=Qwen/Qwen3.5-9B
# API key the backend will use to authenticate to the vLLM endpoint.
export VLLM_API_KEY=super-secret-key

bash deploy-qwen-vm.sh
```

The script:
1. enables `compute.googleapis.com`
2. reserves a regional static IP (`qwen-endpoint-ip`) → stable endpoint
3. opens TCP `8000` (vLLM) to the internet (firewall `allow-qwen-vllm-8000`)
4. creates the GPU VM with a startup script that installs vLLM and runs
   `/usr/local/bin/start-vllm.sh` under `systemd` (auto-restart ⇒ reliability)

It prints the public base URL and health URL on completion.

> **vLLM version**: the `Qwen3_5ForConditionalGeneration` architecture is recent.
> `deploy-qwen-vm.sh` installs the latest `vllm` (which includes it). If you need
> reproducibility, pin `vllm==<version>` in the bootstrap `pip install` line and
> confirm it lists this architecture before proceeding.

---

## 4. Health + smoke test

```bash
EXT_IP=<from deploy output>
curl http://$EXT_IP:8000/health
# {"status":"ok"}
curl -s http://$EXT_IP:8000/v1/models | jq .   # model == Qwen/Qwen3.5-9B
curl -s http://$EXT_IP:8000/v1/chat/completions \
  -H "Authorization: Bearer $VLLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3.5-9B","temperature":0.1,"max_tokens":6000,
       "response_format":{"type":"json_object"},
       "messages":[{"role":"system","content":"Reply with JSON."},
                   {"role":"user","content":"{"criteriaEvaluations":[]}"}]}'
```

---

## 5. Backend switchover (`.env`)

Point the backend at the reliable GCP host — this is the **only production
change** and it is config-only:

```dotenv
AI_SCREENING_PROVIDER=qwen
QWEN_BASE_URL=http://${EXT_IP}:8000/v1
QWEN_MODEL=Qwen/Qwen3.5-9B
QWEN_API_KEY=${VLLM_API_KEY}
```

Then restart the backend. No code change is required — `qwen-screening.provider.ts`
already speaks to any `QWEN_BASE_URL` that implements OpenAI `chat/completions`.

> Recommend fronting `${EXT_IP}:8000` with a managed HTTPS load balancer + TLS
> for production (the backend sends nothing sensitive, but TLS is best practice).

---

## 6. End-to-end verification (real screening)

Run the existing live acceptance harness against the new endpoint (it already
drives real Qwen screenings through the UI and DB):

```bash
cd verification
node candidates-live-acceptance.mjs
```

Expected: candidate A screening COMPLETED with real scores/evidence, provider
failure→FAILED→restore→RETRY→COMPLETED path, evidence isolation, bulk screening
terminal counts. This proves the migrated host reproduces the full product path.
