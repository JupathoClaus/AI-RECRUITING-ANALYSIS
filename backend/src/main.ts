import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app/app.module';
import { validateEnvironment } from './config/validation';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

function buildGlobalPrefix(prefix: string, version: string): string {
  const p = prefix.replace(/^\/+|\/+$/g, '');
  const v = version.replace(/^\/+|\/+$/g, '');
  return `${p}/${v}`;
}

async function bootstrap() {
  const validatedEnv = validateEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port') || 3000;
  const env = configService.get<string>('app.env') || 'development';
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api';
  const apiVersion = configService.get<string>('app.apiVersion') || 'v1';
  const appName = configService.get<string>('app.name') || 'TalentAI';
  const appVersion = configService.get<string>('app.version') || '1.0.0';
  const frontendUrl = configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
  const corsOrigin = configService.get<string>('security.corsOrigin') || 'http://localhost:3001';
  const swaggerEnabled = validatedEnv.SWAGGER_ENABLED;
  const swaggerTitle = configService.get<string>('swagger.title') || 'TalentAI API';
  const swaggerDescription = configService.get<string>('swagger.description') || 'API';
  const swaggerVersion = configService.get<string>('swagger.version') || '1.0.0';

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS
  const allowedOrigins =
    env === 'development'
      ? [
          'http://localhost:3001',
          'http://127.0.0.1:3001',
          /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:3001$/,
          /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:3001$/,
          /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:3001$/,
        ]
      : [corsOrigin];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Request-Id',
    ],
  });

  // Global prefix: /api/v1 (normalized)
  const globalPrefix = buildGlobalPrefix(apiPrefix, apiVersion);
  app.setGlobalPrefix(globalPrefix);

  // Global pipes, filters, interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle(swaggerTitle)
      .setDescription(swaggerDescription)
      .setVersion(swaggerVersion)
      .addBearerAuth()
      .addTag('Health', 'Health check endpoints')
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Users', 'User management endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  await app.listen(port);

  const pinoLogger = app.get(Logger);
  pinoLogger.log(`${appName} v${appVersion} running on port ${port}`);
  pinoLogger.log(`Environment: ${env}`);
  pinoLogger.log(`API: /${globalPrefix}`);
  pinoLogger.log(`Frontend: ${frontendUrl}`);

  // Graceful shutdown
  const shutdownSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      pinoLogger.log(`Received ${signal}, shutting down...`);
      await app.close();
      pinoLogger.log('Shutdown complete');
      process.exit(0);
    });
  }

  process.on('unhandledRejection', (reason) => {
    pinoLogger.error(`Unhandled rejection: ${String(reason)}`);
  });

  process.on('uncaughtException', (error) => {
    pinoLogger.error(`Uncaught exception: ${error.message}`, error.stack);
    process.exit(1);
  });
}

bootstrap();
