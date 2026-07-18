import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME || 'TalentAI',
  version: process.env.APP_VERSION || '1.0.0',
  port: parseInt(process.env.APP_PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  apiVersion: process.env.API_VERSION || 'v1',
  env: process.env.NODE_ENV || 'development',
  debug: process.env.APP_DEBUG === 'true',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  logLevel: process.env.LOG_LEVEL || 'debug',
  healthCheckTimeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '3000', 10),
}));
