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

echo "==> Waiting for tunnel URL…"
PUBLIC_URL=""
for _ in $(seq 1 20); do
  if [[ -f logs/public-url.txt ]]; then
    PUBLIC_URL="$(tr -d '\n' < logs/public-url.txt)"
    break
  fi
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "Tunnel starting… check: npx pm2 logs exam-tunnel --lines 20"
  exit 1
fi

echo "==> Restarting API (QR / CORS env)…"
npx pm2 restart exam-api --update-env >/dev/null 2>&1 || true

echo "==> Verifying tunnel…"
sleep 3
VERIFIED=false
for _ in $(seq 1 5); do
  if curl -sf -m 20 -H "Bypass-Tunnel-Reminder: true" "${PUBLIC_URL}/api/health" >/dev/null; then
    VERIFIED=true
    break
  fi
  sleep 2
done
if [[ "$VERIFIED" == "true" ]]; then
  echo ""
  echo "✓ Tunnel is working. Open on your phone:"
  echo "  ${PUBLIC_URL}"
  echo ""
  echo "If localtunnel shows a warning page, tap Continue / Click to proceed."
  echo "Stop tunnel: npm run services:unshare"
else
  echo ""
  echo "Tunnel URL: ${PUBLIC_URL}"
  echo "⚠ Health check failed — wait a few seconds and retry in the browser."
  echo "  Or run: npm run services:share"
fi
