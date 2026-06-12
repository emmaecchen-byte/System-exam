#!/usr/bin/env bash
# One-time setup on a Linux server (no sudo required).
# Installs Node via nvm, builds the app, and starts on EXAM_WEB_PORT (default 8895).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load port / URL config
if [[ -f "$ROOT/server.config.local.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/server.config.local.env"
elif [[ -f "$ROOT/server.config.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/server.config.env"
fi

export EXAM_WEB_PORT="${EXAM_WEB_PORT:-8895}"
export EXAM_API_PORT="${EXAM_API_PORT:-3000}"
export SERVER_PUBLIC_URL="${SERVER_PUBLIC_URL:-http://127.0.0.1:${EXAM_WEB_PORT}}"

echo "==> Exam system server setup"
echo "    Web:  ${SERVER_PUBLIC_URL}"
echo "    API:  127.0.0.1:${EXAM_API_PORT} (proxied as /api through web port)"

# --- Node.js (user install, no sudo) ---
bash "$ROOT/scripts/install-node-user.sh"
export PATH="${HOME}/.local/bin:${PATH}"
# shellcheck disable=SC1091
[[ -s "${HOME}/.nvm/nvm.sh" ]] && source "${HOME}/.nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not available. Check network access to nodejs.org or GitHub."
  exit 1
fi

echo "    Node: $(node -v)"
echo "    npm:  $(npm -v)"

# --- Backend env ---
if [[ ! -f backend/.env ]]; then
  cp backend/.env.server.example backend/.env
  echo "==> Created backend/.env from .env.server.example"
fi

# Ensure server URL is in CORS / FRONTEND_URL
node - "$ROOT/backend/.env" "$SERVER_PUBLIC_URL" "$EXAM_API_PORT" <<'NODE'
const fs = require('fs');
const [envFile, publicUrl, apiPort] = process.argv.slice(2);
let text = fs.readFileSync(envFile, 'utf8');

function setOrReplace(key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

function mergeCors(origin) {
  const match = text.match(/^CORS_ORIGIN="([^"]*)"/m);
  const current = match
    ? match[1].split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (!current.includes(origin)) current.push(origin);
  setOrReplace('CORS_ORIGIN', current.join(','));
}

setOrReplace('PORT', apiPort || '3000');
setOrReplace('HOST', '0.0.0.0');
mergeCors(publicUrl);
setOrReplace('FRONTEND_URL', publicUrl);
fs.writeFileSync(envFile, text.endsWith('\n') ? text : `${text}\n`);
console.log(`==> backend/.env updated for ${publicUrl}`);
NODE

mkdir -p "$ROOT/logs"

echo "==> Installing dependencies…"
npm install
(cd backend && npm install)
(cd frontend && npm install)

echo "==> Database setup…"
(cd backend && npx prisma generate && npx prisma db push && npm run prisma:seed)

echo "==> Building backend…"
(cd backend && npm run build)

echo "==> Building frontend (production, /api proxy)…"
(cd frontend && npm run build)

echo "==> Starting services on port ${EXAM_WEB_PORT}…"
bash "$ROOT/scripts/start-server.sh"

echo ""
echo "Done. Open: ${SERVER_PUBLIC_URL}"
echo "  Super Admin: admin / Admin@123"
echo "  Status:      npm run services:status"
echo "  Logs:        npm run services:logs"
