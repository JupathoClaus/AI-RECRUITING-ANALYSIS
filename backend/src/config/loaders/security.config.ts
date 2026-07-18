import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
}));
