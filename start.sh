#!/usr/bin/env bash
# Starts the AI service, backend and frontend together, and stops them all on Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="ai-service/.venv/Scripts/python.exe"
[ -x "$PYTHON" ] || PYTHON="ai-service/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  echo "Python virtualenv not found. Run: cd ai-service && python -m venv .venv && .venv/bin/python -m pip install -r requirements.txt"
  exit 1
fi

pids=()
cleanup() { echo; echo "Stopping Smart Road..."; for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

echo "Starting AI service on :8000 (first start takes ~15s to score the network)..."
( cd ai-service && exec "../$PYTHON" -m uvicorn app.main:app --port 8000 ) & pids+=($!)

echo "Starting backend on :4000..."
( cd backend && exec npm run dev ) & pids+=($!)

echo "Starting frontend on :5173..."
( cd frontend && exec npm run dev ) & pids+=($!)

echo
echo "Smart Road is starting. Open http://localhost:5173 once the frontend is ready."
wait
