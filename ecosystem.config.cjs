/** @type {import('pm2').StartOptions[]} */
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
      },
    },
    {
      name: 'exam-web',
      cwd: './frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 5173',
      autorestart: true,
      max_restarts: 15,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
