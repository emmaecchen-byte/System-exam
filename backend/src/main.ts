import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const envOrigins =
    process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
  const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

  const isPrivateLanOrigin = (origin: string) =>
    /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
      origin,
    );

  const isTunnelOrigin = (origin: string) =>
    /^https:\/\/[\w-]+\.(trycloudflare\.com|loca\.lt|ngrok-free\.app|ngrok\.io)$/.test(origin);

  const isVercelOrigin = (origin: string) => /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        isPrivateLanOrigin(origin) ||
        isTunnelOrigin(origin) ||
        isVercelOrigin(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Internal Examination System API')
    .setDescription('Admin, candidate, and QR entry endpoints')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API running at http://localhost:${port}/api`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  if (process.env.LAN_IP) {
    console.log(`LAN API: http://${process.env.LAN_IP}:${port}/api`);
  }
  if (process.env.PUBLIC_URL) {
    console.log(`Public app URL: ${process.env.PUBLIC_URL}`);
  }
}

bootstrap();
