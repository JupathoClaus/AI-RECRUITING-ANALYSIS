import { registerAs } from '@nestjs/config';

export default registerAs('aiInterview', () => ({
  accessTokenSecret: process.env.AI_INTERVIEW_ACCESS_TOKEN_SECRET || '',
  accessTokenTtlMinutes: parseInt(process.env.AI_INTERVIEW_ACCESS_TOKEN_TTL_MINUTES || '60', 10),
  allowTestEmailOverride: process.env.AI_INTERVIEW_ALLOW_TEST_EMAIL_OVERRIDE === 'true',
}));
