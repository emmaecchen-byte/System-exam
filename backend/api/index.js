const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const { ValidationPipe } = require('@nestjs/common');
const express = require('express');
const { AppModule } = require('../dist/app.module');
const serverless = require('serverless-http');

let cachedHandler;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const envOrigins =
    process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
  const defaults = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowed = new Set([...defaults, ...envOrigins]);
  if (allowed.has(origin)) return true;
  if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return true;
  if (
    /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
      origin,
    )
  ) {
    return true;
  }
  if (/^https:\/\/[\w-]+\.(trycloudflare\.com|loca\.lt|ngrok-free\.app|ngrok\.io)$/.test(origin)) {
    return true;
  }
  return false;
}

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  });

  await app.init();
  cachedHandler = serverless(expressApp);
  return cachedHandler;
}

module.exports = async (req, res) => {
  const handler = await bootstrap();
  return handler(req, res);
};
