#!/usr/bin/env bash
# Quick checks when phone cannot open the LAN link.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="$("$ROOT/scripts/get-lan-ip.sh" 2>/dev/null || true)"
WEB_PORT="${EXAM_WEB_PORT:-5173}"

echo ""
echo "=== Phone / LAN access diagnostics ==="
echo ""

if [[ -z "$LAN_IP" ]]; then
  echo "✗ Could not detect LAN IP. Connect your Mac to Wi‑Fi."
else
  echo "Mac LAN IP:     $LAN_IP"
  echo "Web app URL:    http://${LAN_IP}:${WEB_PORT}"
  echo "API health:     http://${LAN_IP}:3000/api/health"
fi

echo ""
echo "Listening ports:"
lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null | awk 'NR==1 || /LISTEN/' || echo "  ✗ Nothing on 5173 — run: npm run services:start"
lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | awk 'NR==1 || /LISTEN/' || echo "  ✗ Nothing on 3000 — API not running"
EXTRA=$(lsof -nP -iTCP:5174 -sTCP:LISTEN 2>/dev/null | tail -1)
if [[ -n "$EXTRA" ]]; then
  echo "  ⚠ Port 5174 is also in use (old dev server). Use ${WEB_PORT} on your phone, not 5174."
fi

FW=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null || true)
echo ""
echo "Mac firewall:   $FW"

if [[ -f "$ROOT/logs/public-url.txt" ]]; then
  echo ""
  echo "Public tunnel (works if LAN blocked by router):"
  echo "  $(tr -d '\n' < "$ROOT/logs/public-url.txt")"
fi

echo ""
echo "If http://${LAN_IP:-YOUR_IP}:3000/api/health fails on your phone:"
echo "  → Your router blocks phone-to-Mac traffic (AP/client isolation). LAN links will NOT work."
echo "  → Use the public tunnel URL above, or run: npm run services:share"
echo ""
echo "Other checks:"
echo "  • Never use localhost or port 5174 on your phone"
echo "  • Avoid Guest Wi‑Fi; Mac must stay awake with services running"
echo "  • On localtunnel's first visit, tap Continue on the reminder page"
echo ""
