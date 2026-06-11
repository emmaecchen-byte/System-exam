#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
EXAMPLE="$ROOT/backend/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "Created backend/.env from .env.example"
fi

if ! grep -q '^REDIS_ENABLED=' "$ENV_FILE"; then
  echo 'REDIS_ENABLED=false' >> "$ENV_FILE"
fi

mkdir -p "$ROOT/logs"
