/**
 * Public HTTPS tunnel so anyone with the link can open the app (phone, other networks).
 * Requires exam-web running on port 5173.
 */
const fs = require('fs');
const path = require('path');
const localtunnel = require('localtunnel');

const ROOT = path.join(__dirname, '..');
const LOGS = path.join(ROOT, 'logs');
const PORT = Number(process.env.EXAM_WEB_PORT || 5173);

async function main() {
  fs.mkdirSync(LOGS, { recursive: true });

  const tunnel = await localtunnel({ port: PORT });
  const publicUrl = tunnel.url.replace(/\/$/, '');

  fs.writeFileSync(path.join(LOGS, 'public-url.txt'), `${publicUrl}\n`);
  console.log('');
  console.log('Public link (share with anyone):');
  console.log(`  ${publicUrl}`);
  console.log('');

  const envFile = path.join(ROOT, 'backend', '.env');
  if (fs.existsSync(envFile)) {
    let text = fs.readFileSync(envFile, 'utf8');
    const line = `FRONTEND_URL="${publicUrl}"`;
    text = /^FRONTEND_URL=.*$/m.test(text)
      ? text.replace(/^FRONTEND_URL=.*$/m, line)
      : `${text.trimEnd()}\n${line}\n`;
    if (!/^PUBLIC_URL=.*$/m.test(text)) {
      text = `${text.trimEnd()}\nPUBLIC_URL="${publicUrl}"\n`;
    } else {
      text = text.replace(/^PUBLIC_URL=.*$/m, `PUBLIC_URL="${publicUrl}"`);
    }
    fs.writeFileSync(envFile, text);
    console.log('Updated FRONTEND_URL for QR codes. Restart API: npm run services:restart');
  }

  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err.message);
    process.exit(1);
  });

  tunnel.on('close', () => {
    console.error('Tunnel closed.');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
