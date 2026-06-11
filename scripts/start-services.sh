#!/usr/bin/env bash
# Build (if needed) and start API + web via PM2 — survives closing Cursor/terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/ensure-env.sh"
"$ROOT/scripts/update-network-env.sh" || true

echo "==> Syncing database…"
npm run dev:ensure-db --silent

echo "==> Building backend…"
(cd backend && npm run build)

echo "==> Building frontend…"
(cd frontend && npm run build)

echo "==> Starting PM2 services…"
npx pm2 delete exam-api exam-web 2>/dev/null || true
npx pm2 start ecosystem.config.cjs
npx pm2 save --force

"$ROOT/scripts/print-urls.sh"
echo "  Status:   npm run services:status"
echo "  Share:    npm run services:share   (public link for anyone)"
echo "  Stop:     npm run services:stop"
