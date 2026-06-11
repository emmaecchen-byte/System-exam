#!/usr/bin/env bash
# Start a public HTTPS link anyone can open (not limited to your Wi‑Fi).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! npx pm2 describe exam-web >/dev/null 2>&1; then
  echo "Web server is not running. Start it first:"
  echo "  npm run services:start"
  exit 1
fi

echo "==> Starting public tunnel (localtunnel)…"
npx pm2 delete exam-tunnel 2>/dev/null || true
npx pm2 start scripts/start-tunnel.cjs --name exam-tunnel --cwd "$ROOT"
npx pm2 save --force

sleep 4
if [[ -f logs/public-url.txt ]]; then
  echo ""
  echo "Share this link:"
  cat logs/public-url.txt
  echo ""
  echo "Stop tunnel: npm run services:unshare"
else
  echo "Tunnel starting… check URL with: npm run services:urls"
  echo "Or: npx pm2 logs exam-tunnel --lines 20"
fi
