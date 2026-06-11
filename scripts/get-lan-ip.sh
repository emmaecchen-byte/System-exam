#!/usr/bin/env bash
# Primary LAN IPv4 (macOS Wi‑Fi en0, then Ethernet en1).
ipconfig getifaddr en0 2>/dev/null \
  || ipconfig getifaddr en1 2>/dev/null \
  || ipconfig getifaddr en2 2>/dev/null \
  || true
