#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="$("$ROOT/scripts/get-lan-ip.sh" || true)"
PORT="${EXAM_WEB_PORT:-5173}"

echo ""
echo "Exam system links:"
echo "  This computer:  http://localhost:${PORT}"
if [[ -n "$LAN_IP" ]]; then
  echo "  Phone (Wi‑Fi):  http://${LAN_IP}:${PORT}"
  echo "    → Phone must be on the same Wi‑Fi. Do not use localhost on your phone."
else
  echo "  Phone (Wi‑Fi):  (connect Mac to Wi‑Fi to detect IP)"
fi
if [[ -f "$ROOT/logs/public-url.txt" ]]; then
  echo "  Anyone online:  $(tr -d '\n' < "$ROOT/logs/public-url.txt")"
  echo "    → Run: npm run services:share"
else
  echo "  Anyone online:  run npm run services:share"
fi
echo ""
