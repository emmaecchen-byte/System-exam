import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.EXAM_API_PORT || process.env.EXAM_API_PORT || '3000';
  const webPort = Number(env.EXAM_WEB_PORT || process.env.EXAM_WEB_PORT || '5173');

  const apiProxy = {
    '/api': {
      target: `http://127.0.0.1:${apiPort}`,
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: webPort,
      strictPort: true,
      allowedHosts: true,
      proxy: apiProxy,
    },
    preview: {
      host: '0.0.0.0',
      port: webPort,
      strictPort: true,
      // Allow LAN IP + localtunnel/ngrok hostnames when sharing via npm run services:share
      allowedHosts: true,
      proxy: apiProxy,
    },
  };
});
