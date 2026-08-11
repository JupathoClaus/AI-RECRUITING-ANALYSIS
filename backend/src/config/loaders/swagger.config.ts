import { registerAs } from '@nestjs/config';

export default registerAs('swagger', () => ({
  enabled: process.env.SWAGGER_ENABLED === 'true',
  title: process.env.SWAGGER_TITLE || 'TalentAI API',
  description:
    process.env.SWAGGER_DESCRIPTION ||
    'Enterprise-grade AI-powered Recruitment Management Platform API',
  version: process.env.SWAGGER_VERSION || '1.0.0',
}));
