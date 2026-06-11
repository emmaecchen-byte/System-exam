import { ExamEntryResult } from './qr-entry.service';

export function renderQrEntryErrorHtml(result: ExamEntryResult): string {
  const title =
    result.status === 'expired'
      ? 'QR Code Expired'
      : result.status === 'invalidated'
        ? 'QR Code Invalidated'
        : 'QR Code Unavailable';

  const message = result.message ?? 'This QR code is no longer valid.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 32px 28px; max-width: 420px; width: 100%; box-shadow: 0 10px 30px rgba(15,23,42,.08); text-align: center; }
    h1 { margin: 0 0 12px; font-size: 1.35rem; color: #111827; }
    p { margin: 0; color: #4b5563; line-height: 1.6; }
    .meta { margin-top: 16px; font-size: 0.9rem; color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${result.examTitle ? `<p class="meta">${escapeHtml(result.examTitle)}${result.sessionName ? ` · ${escapeHtml(result.sessionName)}` : ''}</p>` : ''}
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
