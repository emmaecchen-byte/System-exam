#!/usr/bin/env bash
# One-time setup: build, start PM2, save process list, enable login autostart.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing exam system background services…"
bash "$ROOT/scripts/start-services.sh"

echo ""
echo "==> Saving PM2 process list…"
npx pm2 save --force

echo ""
echo "==> Enabling Mac login autostart…"
bash "$ROOT/scripts/install-launch-agent.sh"

echo ""
echo "Done. Bookmark: http://localhost:5173"
echo ""
echo "You do NOT need npm run dev anymore."
echo "  npm run services:status  — check API + web"
echo "  npm run services:stop    — stop background services"
echo "  npm run dev              — only when actively editing code (hot reload)"
