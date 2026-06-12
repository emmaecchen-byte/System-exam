#!/usr/bin/env bash
# Copy project from this Mac to the Linux server (when git push/pull is unavailable).
# Usage: bash scripts/sync-to-server.sh [user@host]
set -euo pipefail

TARGET="${1:-emma@172.16.20.7}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Syncing to ${TARGET}:~/exam-system/"
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude backend/dist \
  --exclude frontend/dist \
  --exclude backend/prisma/dev.db \
  --exclude backend/prisma/dev.db-journal \
  --exclude backend/uploads \
  --exclude logs \
  --exclude .pm2 \
  "$ROOT/" "${TARGET}:~/exam-system/"

echo ""
echo "Done. On the server run:"
echo "  cd ~/exam-system && bash scripts/setup-linux-server.sh"
