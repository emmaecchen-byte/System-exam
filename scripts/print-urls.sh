#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="$("$ROOT/scripts/get-lan-ip.sh" || true)"
PORT="${EXAM_WEB_PORT:-5173}"

echo ""
echo "Exam system links:"
echo "  This computer:  http://localhost:${PORT}"
if [[ -f "$ROOT/logs/public-url.txt" ]]; then
  echo "  Phone (best):   $(tr -d '\n' < "$ROOT/logs/public-url.txt")"
  echo "    → Use this if http://${LAN_IP:-LAN_IP}:${PORT} fails on your phone (router AP isolation)."
  echo "    → Tap Continue on the localtunnel reminder page if shown."
else
  echo "  Phone (best):   run npm run services:share"
fi
if [[ -n "$LAN_IP" ]]; then
  echo "  Phone (Wi‑Fi):  http://${LAN_IP}:${PORT}"
  echo "    → Only works if your router allows device-to-device traffic."
else
  echo "  Phone (Wi‑Fi):  (connect Mac to Wi‑Fi to detect IP)"
fi
echo ""
