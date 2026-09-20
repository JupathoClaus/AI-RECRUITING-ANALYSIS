#!/usr/bin/env bash
#
# start-vllm.sh
#
# Canonical vLLM launch for the AI Recruiter screening model.
#
# This reproduces the WORKING Lightning deployment contract that this repo's
# backend consumes (see qwen-screening.provider.ts + backend/.env):
#   - OpenAI-compatible server on port 8000
#   - Health endpoint at /health
#   - Served model name == the exact checkpoint id recovered from the migration
#   - JSON-mode friendly (vLLM guided decoding) for response_format json_object
#
# On the retained Lightning host this lived at
#   /teamspace/studios/this_studio/start-vllm.sh
# (referenced by verification/candidates-live-acceptance.mjs). It drove:
#   bash /teamspace/studios/this_studio/start-vllm.sh
#   curl http://127.0.0.1:8000/health   -> 200
#   pkill -f '[v]llm serve'             -> stop
#
set -euo pipefail

MODEL="${VLLM_MODEL:-Qwen/Qwen3.5-9B}"
HOST="${VLLM_HOST:-0.0.0.0}"
PORT="${VLLM_PORT:-8000}"
MAX_MODEL_LEN="${VLLM_MAX_MODEL_LEN:-16384}"
MAX_NUM_SEQS="${VLLM_MAX_NUM_SEQS:-8}"
GPU_MEMORY_UTILIZATION="${VLLM_GPU_MEMORY_UTILIZATION:-0.9}"
API_KEY="${VLLM_API_KEY:-}"

echo "== launching vLLM: model=${MODEL} host=${HOST}:${PORT} =="

API_KEY_ARGS=()
if [ -n "${API_KEY}" ]; then
  API_KEY_ARGS=(--api-key "${API_KEY}")
fi

exec vllm serve "${MODEL}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --max-model-len "${MAX_MODEL_LEN}" \
  --max-num-seqs "${MAX_NUM_SEQS}" \
  --gpu-memory-utilization "${GPU_MEMORY_UTILIZATION}" \
  "${API_KEY_ARGS[@]}" \
  --served-model-name "${MODEL}"
