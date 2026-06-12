#!/usr/bin/env bash
# Start API + web on configured ports (default web 8895, API 3000).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/server.config.local.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/server.config.local.env"
elif [[ -f "$ROOT/server.config.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/server.config.env"
fi

export EXAM_WEB_PORT="${EXAM_WEB_PORT:-8895}"
export EXAM_API_PORT="${EXAM_API_PORT:-3000}"
export SERVER_PUBLIC_URL="${SERVER_PUBLIC_URL:-http://127.0.0.1:${EXAM_WEB_PORT}}"

# Load nvm / user-local node if present
export PATH="${HOME}/.local/bin:${PATH}"
export NVM_DIR="${HOME}/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Run: bash scripts/setup-linux-server.sh"
  exit 1
fi

"$ROOT/scripts/ensure-env.sh"

if [[ ! -f backend/dist/main.js ]]; then
  echo "Backend not built. Run: (cd backend && npm run build)"
  exit 1
fi

if [[ ! -f frontend/dist/index.html ]]; then
  echo "Frontend not built. Run: (cd frontend && npm run build)"
  exit 1
fi

# Free ports
npx pm2 delete exam-api exam-web 2>/dev/null || true
for port in "$EXAM_API_PORT" "$EXAM_WEB_PORT"; do
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" 2>/dev/null || true
  done < <(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)
done
sleep 1

echo "==> Starting PM2 (web :${EXAM_WEB_PORT}, api :${EXAM_API_PORT})…"
EXAM_WEB_PORT="$EXAM_WEB_PORT" EXAM_API_PORT="$EXAM_API_PORT" npx pm2 start ecosystem.config.cjs
npx pm2 save --force 2>/dev/null || true

echo "==> Waiting for API…"
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${EXAM_API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo ""
echo "Exam system running:"
echo "  ${SERVER_PUBLIC_URL}"
echo "  API health: http://127.0.0.1:${EXAM_API_PORT}/api/health"
echo "  PM2:        npx pm2 status"
