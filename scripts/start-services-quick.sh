#!/usr/bin/env bash
# Start API + web in PM2 without a full rebuild (fast daily start).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/ensure-env.sh"
"$ROOT/scripts/update-network-env.sh" || true

echo "==> Syncing database…"
npm run dev:ensure-db --silent

if [[ ! -f backend/dist/main.js ]]; then
  echo "==> Building backend (first run)…"
  (cd backend && npm run build)
fi

if [[ ! -f frontend/dist/index.html ]]; then
  echo "==> Building frontend (first run)…"
  (cd frontend && npm run build)
fi

# Stop dev servers that block ports 3000 / 5173
npx pm2 delete exam-api exam-web 2>/dev/null || true
pkill -f "nest start --watch" 2>/dev/null || true
pkill -f "concurrently.*backend:dev" 2>/dev/null || true
for port in 3000 5173 "${EXAM_WEB_PORT:-5173}"; do
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" 2>/dev/null || true
  done < <(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)
done
sleep 1

echo "==> Starting PM2 services…"
npx pm2 start ecosystem.config.cjs
npx pm2 save --force

echo "==> Waiting for API…"
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

"$ROOT/scripts/print-urls.sh"
echo "  Status:   npm run services:status"
echo "  Logs:     npm run services:logs"
echo "  Stop:     npm run services:stop"
