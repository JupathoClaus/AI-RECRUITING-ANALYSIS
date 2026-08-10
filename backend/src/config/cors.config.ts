export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
  'Origin',
  'X-Requested-With',
  'X-Request-Id',
  'Idempotency-Key',
] as const;

export function buildCorsOptions(env: string, corsOrigin: string) {
  const origin =
    env === 'development'
      ? [
          'http://localhost:3001',
          'http://127.0.0.1:3001',
          /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:3001$/,
          /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:3001$/,
          /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:3001$/,
        ]
      : [corsOrigin];

  return {
    origin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
  };
}
