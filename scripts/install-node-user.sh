#!/usr/bin/env bash
# Install Node.js 20 for the current user without sudo.
# Tries nvm first; falls back to official Linux x64 tarball into ~/.local.
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-20}"
LOCAL_PREFIX="${HOME}/.local"
BIN_DIR="${LOCAL_PREFIX}/bin"

ensure_path() {
  export PATH="${BIN_DIR}:${PATH}"
  if ! grep -q '\.local/bin' "${HOME}/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "${HOME}/.bashrc"
  fi
}

if command -v node >/dev/null 2>&1; then
  echo "Node already installed: $(node -v)"
  exit 0
fi

# Try nvm
export NVM_DIR="${HOME}/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
elif [[ ! -d "$NVM_DIR" ]]; then
  echo "==> Trying nvm install…"
  if curl -fsSL --connect-timeout 15 --max-time 120 \
    https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
  else
    echo "    nvm install script unreachable (GitHub blocked or slow)."
  fi
fi

if command -v nvm >/dev/null 2>&1; then
  nvm install "$NODE_MAJOR" || true
  nvm use "$NODE_MAJOR" || true
fi

if command -v node >/dev/null 2>&1; then
  echo "Node via nvm: $(node -v)"
  exit 0
fi

# Fallback: official Node tarball
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) NODE_ARCH="linux-x64" ;;
  aarch64|arm64) NODE_ARCH="linux-arm64" ;;
  *)
    echo "Unsupported CPU architecture: $ARCH"
    exit 1
    ;;
esac

NODE_VERSION="${NODE_VERSION:-v20.18.1}"
TARBALL="node-${NODE_VERSION}-${NODE_ARCH}.tar.xz"
URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
TMP="$(mktemp -d)"

echo "==> Downloading Node ${NODE_VERSION} (${NODE_ARCH})…"
curl -fsSL --connect-timeout 20 --max-time 300 "$URL" -o "${TMP}/${TARBALL}"
tar -xJf "${TMP}/${TARBALL}" -C "$TMP"
mkdir -p "$BIN_DIR"
cp -a "${TMP}/node-${NODE_VERSION}-${NODE_ARCH}/." "${LOCAL_PREFIX}/"
rm -rf "$TMP"
ensure_path

if ! command -v node >/dev/null 2>&1; then
  echo "Node install failed."
  exit 1
fi

echo "Node installed to ${LOCAL_PREFIX}: $(node -v)"
