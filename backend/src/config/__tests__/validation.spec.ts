import { validationSchema } from '../validation';

describe('validationSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    APP_PORT: 3000,
    APP_NAME: 'TalentAI',
    APP_VERSION: '1.0.0',
    API_PREFIX: 'api',
    API_VERSION: 'v1',
    FRONTEND_URL: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/talentai?schema=public',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    JWT_SECRET: 'my-secret-key-that-is-long-enough-32+',
    JWT_REFRESH_SECRET: 'my-refresh-key-that-is-also-long-enough-32!',
  };

  it('should validate a correct environment', () => {
    const { error } = validationSchema.validate(validEnv, { allowUnknown: true });
    expect(error).toBeUndefined();
  });

  it('should require DATABASE_URL', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, DATABASE_URL: undefined },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
    expect(error?.details[0].message).toContain('DATABASE_URL');
  });

  it('should require postgresql:// scheme in DATABASE_URL', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, DATABASE_URL: 'mysql://localhost/db' },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
  });

  it('should validate NODE_ENV values', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, NODE_ENV: 'invalid' },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
  });

  it('should reject invalid port numbers', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, APP_PORT: 99999 },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
  });

  it('should accept valid boolean for SWAGGER_ENABLED', () => {
    const { error, value } = validationSchema.validate(
      { ...validEnv, SWAGGER_ENABLED: true },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe(true);
  });

  it('should apply defaults for optional fields', () => {
    const minimalEnv = {
      DATABASE_URL: 'postgresql://localhost:5432/db',
      JWT_SECRET: 'secret-that-is-long-enough-32-characters!!',
      JWT_REFRESH_SECRET: 'refresh-secret-that-is-also-32-characters!!',
    };
    const { error, value } = validationSchema.validate(minimalEnv, { allowUnknown: true });
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.APP_PORT).toBe(3000);
    expect(value.REDIS_HOST).toBe('localhost');
    expect(value.REDIS_TLS).toBe(false);
    expect(value.HEALTH_CHECK_TIMEOUT_MS).toBe(3000);
    expect(value.API_PREFIX).toBe('api');
    expect(value.API_VERSION).toBe('v1');
    expect(value.FRONTEND_URL).toBe('http://localhost:3001');
  });

  it('should load canonical API_PREFIX correctly', () => {
    const { value } = validationSchema.validate(
      { ...validEnv, API_PREFIX: 'api', API_VERSION: 'v1' },
      { allowUnknown: true },
    );
    expect(value.API_PREFIX).toBe('api');
    expect(value.API_VERSION).toBe('v1');
  });

  it('should use FRONTEND_URL as the canonical frontend URL variable', () => {
    const { value } = validationSchema.validate(
      { ...validEnv, FRONTEND_URL: 'https://app.example.com' },
      { allowUnknown: true },
    );
    expect(value.FRONTEND_URL).toBe('https://app.example.com');
  });

  it('should not require old APP_API_PREFIX or APP_API_VERSION', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, APP_API_PREFIX: undefined, APP_API_VERSION: undefined },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });

  it('should apply defaults for auth environment variables', () => {
    const minimalEnv = {
      DATABASE_URL: 'postgresql://localhost:5432/db',
      JWT_SECRET: 'secret-that-is-long-enough-32-characters!!',
      JWT_REFRESH_SECRET: 'refresh-secret-that-is-also-32-characters!!',
    };
    const { error, value } = validationSchema.validate(minimalEnv, { allowUnknown: true });
    expect(error).toBeUndefined();
    expect(value.AUTH_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(value.AUTH_LOCKOUT_DURATION_MINUTES).toBe(15);
    expect(value.AUTH_LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(value.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS).toBe(900);
    expect(value.AUTH_SESSION_LIMIT_PER_USER).toBe(10);
    expect(value.BCRYPT_ROUNDS).toBe(10);
  });

  it('should accept valid custom auth configuration', () => {
    const { error, value } = validationSchema.validate(
      {
        ...validEnv,
        AUTH_MAX_FAILED_ATTEMPTS: 3,
        AUTH_LOCKOUT_DURATION_MINUTES: 10,
        AUTH_LOGIN_RATE_LIMIT_MAX: 5,
        AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 300,
        AUTH_SESSION_LIMIT_PER_USER: 3,
        BCRYPT_ROUNDS: 12,
      },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
    expect(value.AUTH_MAX_FAILED_ATTEMPTS).toBe(3);
    expect(value.AUTH_LOCKOUT_DURATION_MINUTES).toBe(10);
    expect(value.AUTH_LOGIN_RATE_LIMIT_MAX).toBe(5);
    expect(value.AUTH_SESSION_LIMIT_PER_USER).toBe(3);
    expect(value.BCRYPT_ROUNDS).toBe(12);
  });

  it('should reject invalid AUTH_MAX_FAILED_ATTEMPTS', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, AUTH_MAX_FAILED_ATTEMPTS: 0 },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
  });

  it('should reject invalid BCRYPT_ROUNDS (too low)', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, BCRYPT_ROUNDS: 3 },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
  });

  it('should allow Tavus to remain disabled without provider credentials', () => {
    const { error, value } = validationSchema.validate(validEnv, { allowUnknown: true });
    expect(error).toBeUndefined();
    expect(value.TAVUS_ENABLED).toBe(false);
  });

  it('should require Tavus provider identifiers when enabled', () => {
    const { error } = validationSchema.validate(
      { ...validEnv, TAVUS_ENABLED: true },
      { allowUnknown: true, abortEarly: false },
    );
    expect(error?.details.map((detail) => detail.path[0])).toEqual(
      expect.arrayContaining(['TAVUS_API_KEY', 'TAVUS_PERSONA_ID', 'TAVUS_REPLICA_ID']),
    );
  });

  it('should accept a complete Tavus configuration', () => {
    const { error } = validationSchema.validate(
      {
        ...validEnv,
        TAVUS_ENABLED: true,
        TAVUS_API_KEY: 'tavus-key',
        TAVUS_PERSONA_ID: 'persona-id',
        TAVUS_REPLICA_ID: 'replica-id',
        TAVUS_CALLBACK_BASE_URL: 'https://api.example.com',
        TAVUS_CALLBACK_SECRET: 'callback-secret',
      },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });
});
