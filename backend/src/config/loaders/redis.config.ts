import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => {
  const redisUrl = process.env.REDIS_URL?.trim();
  const parsed = redisUrl ? new URL(redisUrl) : null;

  return {
    host: parsed?.hostname || process.env.REDIS_HOST || 'localhost',
    port: parsed?.port ? parseInt(parsed.port, 10) : parseInt(process.env.REDIS_PORT || '6379', 10),
    username: parsed?.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed?.password
      ? decodeURIComponent(parsed.password)
      : process.env.REDIS_PASSWORD || undefined,
    db:
      parsed?.pathname && parsed.pathname !== '/'
        ? parseInt(parsed.pathname.slice(1), 10)
        : parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'talentai:',
    tls: parsed?.protocol === 'rediss:' || process.env.REDIS_TLS === 'true',
  };
});
