const API_PORT = String(import.meta.env.VITE_API_PORT ?? '3000').trim() || '3000';

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isTunnelHost(hostname: string) {
  return /\.(loca\.lt|trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/.test(hostname);
}

function isStaticHost(hostname: string) {
  return hostname.endsWith('.vercel.app') || hostname.endsWith('.netlify.app');
}

/**
 * API base URL for axios/fetch.
 *
 * - localhost: Vite proxies `/api` → 127.0.0.1:3000
 * - Phone / LAN (e.g. 192.168.x.x:5173): API on same host, port 3000 (CORS-enabled)
 * - Public tunnel (loca.lt): same-origin `/api` through the tunnel → Vite proxy
 * - Vercel/static: set VITE_API_BASE_URL at build time
 */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return '/api';
  }

  const { hostname, protocol } = window.location;

  if (isLocalHost(hostname)) {
    return '/api';
  }

  if (isTunnelHost(hostname) || isStaticHost(hostname)) {
    return '/api';
  }

  // LAN hostname or IP — call API directly (avoids Vite proxy issues on mobile)
  return `${protocol}//${hostname}:${API_PORT}/api`;
}

export function needsTunnelBypassHeader(): boolean {
  if (typeof window === 'undefined') return false;
  return isTunnelHost(window.location.hostname);
}
