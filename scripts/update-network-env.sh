#!/usr/bin/env bash
# Add this Mac's LAN address to backend/.env for phone QR codes and CORS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
LAN_IP="$("$ROOT/scripts/get-lan-ip.sh" || true)"
PORT_WEB="${EXAM_WEB_PORT:-5173}"

if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect LAN IP (Wi‑Fi may be off)."
  exit 0
fi

LAN_ORIGIN="http://${LAN_IP}:${PORT_WEB}"

node - "$ENV_FILE" "$LAN_ORIGIN" "$LAN_IP" "$PORT_WEB" <<'NODE'
const fs = require('fs');
const [envFile, lanOrigin, lanIp, port] = process.argv.slice(2);
let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

function setOrReplace(key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

function mergeCors(origin) {
  const match = text.match(/^CORS_ORIGIN="([^"]*)"/m);
  const current = match ? match[1].split(',').map((s) => s.trim()).filter(Boolean) : [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  if (!current.includes(origin)) current.push(origin);
  setOrReplace('CORS_ORIGIN', current.join(','));
}

mergeCors(lanOrigin);
setOrReplace('FRONTEND_URL', lanOrigin);
setOrReplace('LAN_IP', lanIp);
fs.writeFileSync(envFile, text.endsWith('\n') ? text : `${text}\n`);
console.log(`Network env updated: ${lanOrigin}`);
NODE
