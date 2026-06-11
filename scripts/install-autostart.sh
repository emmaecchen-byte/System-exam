#!/usr/bin/env bash
# Register PM2 to start exam services automatically when you log in to your Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/start-services.sh"

echo ""
echo "==> Configuring login autostart (PM2)…"
STARTUP_CMD="$(npx pm2 startup launchd -u "$USER" --hp "$HOME" 2>&1 | grep '^sudo' || true)"
if [[ -n "$STARTUP_CMD" ]]; then
  echo ""
  echo "One more step — run this in Terminal (Mac password required), then run:"
  echo "  npm run services:autostart"
  echo ""
  echo "  $STARTUP_CMD"
  echo ""
else
  npx pm2 save --force
  echo "Autostart is configured. Services will restart after reboot/login."
fi

echo "Bookmark: http://localhost:5173"
