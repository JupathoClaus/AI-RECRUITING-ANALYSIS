#!/usr/bin/env bash
#
# MIGRATE the working Lightning Qwen + vLLM screening deployment to a reliable
# Google Cloud GPU host.
#
# Source deployment recovered from the repo (verification/candidates-live-acceptance.mjs
# + backend/.env + qwen-screening.provider.ts):
#   - Model .......... Qwen/Qwen3.5-9B
#   - Server ......... vLLM (OpenAI-compatible) on port 8000, health at /health
#   - Public API ..... <https host>/v1  (consumed by QWEN_BASE_URL)
#   - Backend ........ AI_SCREENING_PROVIDER=qwen, QWEN_BASE_URL, QWEN_MODEL,
#                      temperature 0.1, max_tokens 6000, response_format json_object
#
# This script provisions a GCP GPU VM (default: L4, which reliably runs a 9B
# model at fp16 with headroom; switch to T4 only if you also set a compatible
# quantized model id) and installs + starts the SAME model via vLLM behind a
# public HTTPS endpoint.
#
# Prereqs: gcloud installed + authenticated, project billing/Compute API enabled,
#          GPU quota granted for the chosen accelerator.
#
set -euo pipefail

# ── CONFIG (edit for your environment) ────────────────────────────────────────
PROJECT="${GCP_PROJECT:?set GCP_PROJECT}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-${REGION}-a}"
VM_NAME="${GCP_VM_NAME:-qwen-vllm-$(date +%s)}"

# Reliability-first GPU. L4 (24GB) fits a 9B model in fp16 (~18GB) with headroom.
# Use T4 only with a quantized model id (e.g. an AWQ/GPTQ build of the same
# checkpoint) that fits 16GB.
MACHINE_TYPE="${GCP_MACHINE_TYPE:-g2-standard-12}"
ACCELERATOR_TYPE="${GCP_ACCELERATOR:-nvidia-l4}"
ACCELERATOR_COUNT="${GCP_ACCELERATOR_COUNT:-1}"
BOOT_DISK_SIZE_GB="${GCP_BOOT_DISK_GB:-200}"

# EXACT model id recovered from the working Lightning deployment. A scrape/blob
# override can be supplied via GCP_MODEL (e.g. a GCS/HF path backed by the same
# checkpoint) if the public id needs a mirror.
MODEL="${GCP_MODEL:-Qwen/Qwen3.5-9B}"

MAX_NUM_SEQS=8
MAX_MODEL_LEN=16384
GPU_MEMORY_UTILIZATION="${GCP_GPU_MEM_UTIL:-0.9}"

# ── Helpers ───────────────────────────────────────────────────────────────────
say() { echo -e "\n== $* =="; }

bootstrap_script() {
  cat <<'BOOTSTRAP'
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export PATH="/root/.local/bin:/usr/local/cuda/bin:$PATH"
export HF_HOME=/root/.cache/huggingface

say() { echo "== $* =="; }

# 1. NVIDIA driver + CUDA (via Google's NVIDIA OS Login repo images already have
#    drivers, but ensure the runtime is present).
nvidia-smi >/dev/null 2>&1 || echo "nvidia-smi not present yet"

# 2. Python + vLLM (pinned to a stable recent line; reproduces OpenAI-compatible
#    /v1 API exactly as the consumer expects).
apt-get update -y >/dev/null
apt-get install -y python3-pip python3-venv curl >/dev/null
python3 -m venv /opt/vllm
source /opt/vllm/bin/activate
pip install --upgrade pip >/dev/null 2>&1
pip install "vllm" "openai" >/dev/null

mkdir -p /etc/vllm
cat > /etc/vllm/vllm.env <<ENV
MODEL=${MODEL}
MAX_MODEL_LEN=${MAX_MODEL_LEN}
MAX_NUM_SEQS=${MAX_NUM_SEQS}
GPU_MEMORY_UTILIZATION=${GPU_MEMORY_UTILIZATION}
ENV

cat > /usr/local/bin/start-vllm.sh <<'SRV'
#!/usr/bin/env bash
set -euo pipefail
source /opt/vllm/bin/activate
export PATH="/usr/local/cuda/bin:$PATH"
echo "== launching vLLM =="
exec vllm serve "$MODEL" \
  --host 0.0.0.0 --port 8000 \
  --max-model-len "$MAX_MODEL_LEN" \
  --max-num-seqs "$MAX_NUM_SEQS" \
  --gpu-memory-utilization "$GPU_MEMORY_UTILIZATION" \
  --api-key "${VLLM_API_KEY:?set VLLM_API_KEY}" \
  --enable-auto-tool-choice \
  --tool-call-parser hermes \
  --served-model-name "$MODEL"
SRV
chmod +x /usr/local/bin/start-vllm.sh

# 3. Service under systemd so the endpoint comes back automatically (reliability
#    is the whole point of the migration).
cat > /etc/systemd/system/vllm.service <<'UNIT'
[Unit]
Description=vLLM OpenAI-compatible server (Qwen)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/vllm/vllm.env
EnvironmentFile=/etc/vllm/vllm.apikey
ExecStart=/usr/local/bin/start-vllm.sh
Restart=always
RestartSec=10
# vLLM downloads the model on first boot; give it plenty of time.
TimeoutStartSec=3600

[Install]
WantedBy=multi-user.target
UNIT

echo "${VLLM_API_KEY}" > /etc/vllm/vllm.apikey
chmod 600 /etc/vllm/vllm.apikey

systemctl daemon-reload
systemctl enable vllm
systemctl start vllm
echo "== startup script complete =="
BOOTSTRAP
  # Inject the model/env values that vary per deploy.
  sed -i \
    -e "s|^MODEL=.*|MODEL=${MODEL}|" \
    -e "s|^MAX_MODEL_LEN=.*|MAX_MODEL_LEN=${MAX_MODEL_LEN}|" \
    -e "s|^MAX_NUM_SEQS=.*|MAX_NUM_SEQS=${MAX_NUM_SEQS}|" \
    -e "s|^GPU_MEMORY_UTILIZATION=.*|GPU_MEMORY_UTILIZATION=${GPU_MEMORY_UTILIZATION}|" \
    /dev/stdin <<< "$(cat)"
}

# ── 1. Enable APIs + pick project ─────────────────────────────────────────────
say "Enabling required GCP APIs"
gcloud config set project "$PROJECT"
gcloud services enable compute.googleapis.com --project="$PROJECT" --quiet

# ── 2. Regional static IP for a stable endpoint ───────────────────────────────
say "Reserving static external IP"
if ! gcloud compute addresses describe "qwen-endpoint-ip" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute addresses create "qwen-endpoint-ip" --region="$REGION" --project="$PROJECT"
fi
EXT_IP=$(gcloud compute addresses describe "qwen-endpoint-ip" --region="$REGION" --project="$PROJECT" --format="value(address)")

# ── 3. Firewall: HTTPS + vLLM port (8000) from the internet ──────────────────
say "Configuring firewall: TCP 8000 (vLLM) open to 0.0.0.0/0"
if ! gcloud compute firewall-rules describe "allow-qwen-vllm-8000" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "allow-qwen-vllm-8000" \
    --project="$PROJECT" \
    --network=default \
    --allow=tcp:8000 \
    --direction=INGRESS \
    --priority=1000 \
    --source-ranges=0.0.0.0/0
fi

# ── 4. Create the GPU VM with the bootstrapping startup script ────────────────
say "Creating GPU VM ${VM_NAME} (${ACCELERATOR_TYPE} x${ACCELERATOR_COUNT})"
gcloud compute instances create "$VM_NAME" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --accelerator="type=${ACCELERATOR_TYPE},count=${ACCELERATOR_COUNT}" \
  --maintenance-policy=TERMINATE \
  --image-family="ubuntu-2204-lts" \
  --image-project="ubuntu-os-cloud" \
  --boot-disk-size="$BOOT_DISK_SIZE_GB" \
  --boot-disk-type=pd-ssd \
  --metadata=startup-script="$(bootstrap_script)" \
  --address="$EXT_IP" \
  --scopes=default \
  --tags="qwen-vllm" \
  --quiet

say "VM created: ${VM_NAME} @ ${EXT_IP}"
echo "──────────────────────────────────────────────────────────────"
echo "Public OpenAI-compatible base URL: http://${EXT_IP}:8000/v1"
echo "Healthcheck:                       http://${EXT_IP}:8000/health"
echo ""
echo "Wait for model load, then run:"
echo "  curl http://${EXT_IP}:8000/health"
echo ""
echo "Backend switchover (.env):"
echo "  AI_SCREENING_PROVIDER=qwen"
echo "  QWEN_BASE_URL=http://${EXT_IP}:8000/v1"
echo "  QWEN_MODEL=${MODEL}"
echo "  QWEN_API_KEY=<the VLLM_API_KEY used above>"
echo "──────────────────────────────────────────────────────────────"
