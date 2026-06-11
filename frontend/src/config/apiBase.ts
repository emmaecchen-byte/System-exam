/**
 * API base URL for axios/fetch.
 * - Local dev: leave VITE_API_BASE_URL unset — Vite proxies `/api` → localhost:3000
 * - Production (Vercel): set VITE_API_BASE_URL to your API origin, e.g.
 *   https://your-api.example.com/api
 */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return '/api';
}
