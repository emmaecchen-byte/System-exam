/** @type {import('pm2').StartOptions[]} */
const webPort = process.env.EXAM_WEB_PORT || '5173';
const apiPort = process.env.EXAM_API_PORT || '3000';

module.exports = {
  apps: [
    {
      name: 'exam-api',
      cwd: './backend',
      script: 'dist/main.js',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 15,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        REDIS_ENABLED: 'false',
        HOST: '0.0.0.0',
        PORT: apiPort,
      },
    },
    {
      name: 'exam-web',
      cwd: './frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: `preview --host 0.0.0.0 --port ${webPort}`,
      autorestart: true,
      max_restarts: 15,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        EXAM_WEB_PORT: webPort,
        EXAM_API_PORT: apiPort,
      },
    },
  ],
};
