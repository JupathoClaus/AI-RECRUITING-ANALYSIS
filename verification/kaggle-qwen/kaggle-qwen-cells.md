# Kaggle Qwen Cells — AI Recruiter /v1 (T4x2 + vLLM + Cloudflare tunnel)

Temporary dev/demo infrastructure. **NOT** production hosting.

- Model: `Qwen/Qwen3.5-9B` (unchanged)
- GPUs: **2 x Tesla T4** (GPU verification already passed elsewhere)
- Serving: vLLM, OpenAI-compatible, `--tensor-parallel-size 2`
- JSON mode: `response_format={"type":"json_object"}`, `temperature=0.1`, `max_tokens=6000` (AI Recruiter contract)
- Work dir on Kaggle: `/kaggle/working`
- Log: `/kaggle/working/vllm.log`

> Cell 1 (GPU check) was already run and passed: `CUDA 13.0`, driver `580.159.04`, GPU count 2, each T4 14.56 GB.

---

## CELL 2 — Install vLLM (+ minimal deps)

```bash
# Latest stable vLLM supports Qwen3_5ForConditionalGeneration.
# On Kaggle (Python ~3.11, CUDA 13) plain pip is the supported path.
pip install -U --quiet "vllm" "openai" "huggingface_hub"
python -c "import vllm; print('vllm', vllm.__version__)"
```

**Result:**
- `PASS` → vLLM version prints; continue to CELL 3.
- **`STOP HERE`** if pip fails / import fails → report the exact error (do not blindly retry more than twice; a Kaggle env/CUDA incompatibility is the likely cause).

---

## CELL 3 — Print versions + GPU count

```python
import torch, vllm
print("vllm:", vllm.__version__)
print("torch:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
print("CUDA version:", torch.version.cuda)
print("GPU count:", torch.cuda.device_count())
for i in range(torch.cuda.device_count()):
    print(i, torch.cuda.get_device_name(i), round(torch.cuda.get_device_properties(i).total_memory/1e9,2), "GB")
```

**Result:**
- `PASS` → `GPU count: 2` (both Tesla T4). Continue.
- **`STOP HERE`** if `device_count() != 2` → only one T4 attached; do **not** try to load full BF16 on a single 16 GB T4.

---

## CELL 4 — Temporary strong API key (runtime only)

```python
import secrets
API_KEY = secrets.token_urlsafe(32)
print("TEMP_API_KEY_CREATED=True")
# Environment only. Do NOT commit. AI Recruiter will use this as QWEN_API_KEY.
```

**Result:**
- `PASS` → key generated in-memory. Continue.
- **`STOP HERE`** if exception (unlikely).

---

## CELL 5 — Start vLLM in background (TP=2)

```python
import subprocess, os, textwrap

# Text-only screening workload -> skip vision encoder to free VRAM.
cmd = (
    "nohup vllm serve Qwen/Qwen3.5-9B "
    "--tensor-parallel-size 2 "
    "--served-model-name Qwen/Qwen3.5-9B "
    "--host 0.0.0.0 --port 8000 "
    "--max-model-len 8192 "
    "--gpu-memory-utilization 0.90 "
    "--max-num-seqs 8 "
    "--limit-mm-per-prompt.image 0 "
    "--limit-mm-per-prompt.video 0 "
    f"--api-key {API_KEY} "
    f"> /kaggle/working/vllm.log 2>&1 &"
)
print("starting vLLM...")
print(cmd)
os.system(cmd)
print("launched. log -> /kaggle/working/vllm.log")
```

**Result:**
- `PASS` → process launched (prints, returns). Continue to CELL 6 (readiness) which is the real gate.
- **`STOP HERE`** if the shell errors immediately, or if CELL 6 fails with an OOM / "Failed to infer device type" / only-one-GPU message → report exact log lines.

---

## CELL 6 — Bounded readiness loop (max ~5 min)

```python
import time, requests, subprocess

BASE = "http://127.0.0.1:8000"
deadline = time.time() + 300
ok = False
while time.time() < deadline:
    try:
        r = requests.get(f"{BASE}/health", timeout=5)
        if r.status_code == 200:
            ok = True
            break
    except Exception:
        pass
    time.sleep(10)

print("HEALTH_READY=", ok)
if not ok:
    print("---- last vllm.log ----")
    print(open("/kaggle/working/vllm.log").read()[-4000:])
else:
    print("vLLM is healthy at", BASE)
```

**Result:**
- `PASS` (`HEALTH_READY=True`) → continue.
- **`STOP HERE`** if not ready in 5 min → read the printed log tail. Common fail signs:
  - OOM (`CUDA out of memory`) → lower `--gpu-memory-utilization` / `--max-model-len` (do **not** silently quantize).
  - "Failed to infer device type" / single-device → tensor-parallel problem; report, don't rerun repeatedly.

---

## CELL 7 — nvidia-smi after load (prove BOTH GPUs used)

```bash
!nvidia-smi
!cat /proc/driver/nvidia/gpus/*/information 2>/dev/null | grep -iE 'Product Name|Model' || true
```

**Result:**
- `PASS` → BOTH GPUs show large (~several GB each) `MiB` used by the vLLM process. Continue.
- **`STOP HERE`** if only one GPU has meaningful allocation → TP misconfigured; report (max 2 fixes).

---

## CELL 8 — GET /v1/models

```python
import requests
r = requests.get(f"{BASE}/v1/models", headers={"Authorization": f"Bearer {API_KEY}"}, timeout=20)
print("status", r.status_code)
print(r.json())
```

**Result:**
- `PASS` → HTTP 200 and `id` = `Qwen/Qwen3.5-9B`. Continue.
- **`STOP HERE`** if not → vLLM not serving; report.

---

## CELL 9 — JSON-mode chat smoke test

```python
import requests, json, time
payload = {
    "model": "Qwen/Qwen3.5-9B",
    "messages": [
        {"role": "system", "content": "You are a CV screener. Always answer as strict JSON."},
        {"role": "user", "content": 'Return a JSON object only: {"match": 0-100, "summary": "one sentence"}'},
    ],
    "response_format": {"type": "json_object"},
    "temperature": 0.1,
    "max_tokens": 6000,
}
t0 = time.time()
r = requests.post(f"{BASE}/v1/chat/completions", json=payload,
                  headers={"Authorization": f"Bearer {API_KEY}"}, timeout=180)
dt = time.time() - t0
print("status", r.status_code, "latency_seconds", round(dt,2))
print(r.json()["choices"][0]["message"]["content"])
```

**Result:**
- `PASS` → HTTP 200, JSON-parseable content, reasonable latency. Continue.
- **`STOP HERE`** if not → JSON mode / guided decoding issue; report exact error.

---

## CELL 10 — Install official Cloudflare `cloudflared` binary

```bash
# Official cloudflared quick-tunnel binary (direct from Cloudflare's project).
!curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /kaggle/working/cloudflared
!chmod +x /kaggle/working/cloudflared
!/kaggle/working/cloudflared --version
```

**Result:**
- `PASS` → version prints. Continue.
- **`STOP HERE`** if download/exec fails (no internet / arch issue) → report; do not use a random binary.

---

## CELL 11 — Start Cloudflare quick tunnel → get public HTTPS URL

```python
import subprocess, time, re

LOG = "/kaggle/working/tunnel.log"
s = subprocess.Popen(
    ["/kaggle/working/cloudflared", "tunnel", "--url", "http://127.0.0.1:8000"],
    stdout=open(LOG, "wb"), stderr=subprocess.STDOUT,
)
url = None
for _ in range(30):  # bounded ~30s
    time.sleep(1)
    txt = open(LOG, errors="ignore").read()
    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", txt)
    if m:
        url = m.group(0)
        break
print("PUBLIC_TUNNEL_URL=", url)
print("--- tunnel log tail ---")
print(open(LOG, errors="ignore").read()[-2000:])
```

**Result:**
- `PASS` → `https://<random>.trycloudflare.com` printed. Continue.
- **`STOP HERE`** if no URL within ~30s → tunnel/egress blocked (this is the "EXTERNAL ENDPOINT BLOCKED" case); report `PUBLIC_TUNNEL_URL=None`.

---

## CELL 12 — External self-test through the tunnel

```python
import requests, json, time
PUB = url  # from CELL 11
H = {"Authorization": f"Bearer {API_KEY}"}
r1 = requests.get(f"{PUB}/v1/models", headers=H, timeout=30)
print("external /v1/models", r1.status_code)
payload = {
    "model": "Qwen/Qwen3.5-9B",
    "messages": [{"role": "user", "content": 'Reply with JSON only: {"ok": true, "who": "qwen3.5-9b"}'}],
    "response_format": {"type": "json_object"},
    "temperature": 0.1,
    "max_tokens": 6000,
}
t0 = time.time()
r2 = requests.post(f"{PUB}/v1/chat/completions", json=payload, headers=H, timeout=180)
print("external chat", r2.status_code, "latency_seconds", round(time.time()-t0,2))
print(r2.json()["choices"][0]["message"]["content"])
```

**Result:**
- `PASS` → both HTTP 200 through the public HTTPS URL. Continue to CELL 13.
- **`STOP HERE`** if external fails while local CELL 8/9 passed → external tunnel blocker; report.

---

## CELL 13 — Print final configuration (for AI Recruiter)

```python
print("=" * 50)
print("KAGGLE_QWEN_READY=True")
print("MODEL=Qwen/Qwen3.5-9B")
print("GPU_COUNT=2")
print(f"PUBLIC_BASE_URL={url}/v1")
print("API_KEY_SET=True  (value deliberately not echoed again)")
print("=" * 50)
print("WARNINGS:")
print("1. Keep this Kaggle notebook/session running.")
print("2. The trycloudflare.com URL CHANGES every time the tunnel restarts.")
print("3. If the runtime stops, the endpoint disappears and the model must reload.")
print("4. Do NOT commit the API key or the URL to git.")
```

**Result:**
- `PASS` → `KAGGLE_QWEN_READY=True`. You now have the values to wire the AI Recruiter backend (see below). Continue locally.

---

## Local AI Recruiter switch values (DO NOT edit backend/.env yet)

Set only after the remote endpoint + smoke test pass, in the LOCAL backend env (not committed):

```
AI_SCREENING_PROVIDER=qwen
QWEN_BASE_URL=https://<generated>.trycloudflare.com/v1
QWEN_MODEL=Qwen/Qwen3.5-9B
QWEN_API_KEY=<the TEMP_API_KEY from CELL 4>
```

- Do **not** edit `backend/.env` yet — only after remote inference is proven from this Windows machine.
- Lightning remains the configured endpoint until Kaggle Qwen passes live screening.
