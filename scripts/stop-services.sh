#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx pm2 delete exam-api exam-web 2>/dev/null || true
npx pm2 save --force 2>/dev/null || true

echo "Exam system services stopped."
