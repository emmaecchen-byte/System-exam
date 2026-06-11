#!/usr/bin/env bash
# Used by macOS LaunchAgent on login — restore PM2 processes without opening Cursor.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

LOG="$ROOT/logs/autostart.log"
mkdir -p "$ROOT/logs"
exec >>"$LOG" 2>&1
echo "=== $(date) resurrect-services ==="

if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1 \
  && curl -sf http://127.0.0.1:5173/api/health >/dev/null 2>&1; then
  echo "Services already healthy."
  exit 0
fi

if [[ -f "$HOME/.pm2/dump.pm2" ]]; then
  npx pm2 resurrect 2>/dev/null || true
  sleep 3
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "PM2 resurrect OK."
    exit 0
  fi
fi

echo "PM2 resurrect failed or empty — running quick start…"
bash "$ROOT/scripts/start-services-quick.sh"
