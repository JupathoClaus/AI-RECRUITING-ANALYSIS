import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  maxFailedAttempts: parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS || '5', 10),
  lockoutDurationMinutes: parseInt(process.env.AUTH_LOCKOUT_DURATION_MINUTES || '15', 10),
  loginRateLimitMax: parseInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || '10', 10),
  loginRateLimitWindowSeconds: parseInt(
    process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS || '900',
    10,
  ),
  verificationTokenTtlMinutes: parseInt(
    process.env.AUTH_VERIFICATION_TOKEN_TTL_MINUTES || '1440',
    10,
  ),
  passwordResetTokenTtlMinutes: parseInt(
    process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES || '30',
    10,
  ),
  sessionLimitPerUser: parseInt(process.env.AUTH_SESSION_LIMIT_PER_USER || '10', 10),
  refreshCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME || 'talentai_refresh',
  refreshCookieSecure: process.env.REFRESH_COOKIE_SECURE === 'true',
  refreshCookieSameSite: (process.env.REFRESH_COOKIE_SAME_SITE || 'lax') as
    'lax' | 'strict' | 'none',
}));
