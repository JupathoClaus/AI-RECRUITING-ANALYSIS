import * as Joi from 'joi';
import { Logger } from '@nestjs/common';

const logger = new Logger('ConfigValidation');

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  APP_NAME: Joi.string().default('TalentAI'),
  APP_PORT: Joi.number().port().default(3000),
  APP_VERSION: Joi.string().default('1.0.0'),
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),
  DATABASE_URL: Joi.string()
    .required()
    .pattern(/^postgresql:\/\//),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(0),
  REDIS_KEY_PREFIX: Joi.string().default('talentai:'),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  JWT_ISSUER: Joi.string().default('talentai-api'),
  JWT_AUDIENCE: Joi.string().default('talentai-recruiter-web'),
  BCRYPT_ROUNDS: Joi.number().min(4).max(15).default(10),
  AUTH_MAX_FAILED_ATTEMPTS: Joi.number().min(1).max(50).default(5),
  AUTH_LOCKOUT_DURATION_MINUTES: Joi.number().min(1).max(1440).default(15),
  AUTH_LOGIN_RATE_LIMIT_MAX: Joi.number().min(1).max(1000).default(10),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: Joi.number().min(1).max(86400).default(900),
  AUTH_VERIFICATION_TOKEN_TTL_MINUTES: Joi.number().min(1).max(10080).default(1440),
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: Joi.number().min(1).max(1440).default(30),
  AUTH_SESSION_LIMIT_PER_USER: Joi.number().min(1).max(100).default(10),
  REFRESH_TOKEN_COOKIE_NAME: Joi.string().default('talentai_refresh'),
  REFRESH_COOKIE_SECURE: Joi.boolean().default(false),
  REFRESH_COOKIE_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
  RATE_LIMIT_TTL: Joi.number().default(60000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  REQUEST_TIMEOUT_MS: Joi.number().default(30000),
  HEALTH_CHECK_TIMEOUT_MS: Joi.number().default(3000),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('debug'),
  BUILD_ID: Joi.string().optional(),
  MAX_FILE_SIZE: Joi.number().default(10485760),
  UPLOAD_DIR: Joi.string().default('./uploads'),

  // AI Screening
  AI_SCREENING_PROVIDER: Joi.string().valid('mock', 'openai').default('mock'),
  OPENAI_API_KEY: Joi.string().optional().allow(''),
  OPENAI_MODEL: Joi.string().optional().default('gpt-4o-mini'),
  AI_SCREENING_TIMEOUT_MS: Joi.number().min(5000).max(120000).default(30000),
  AI_SCREENING_MAX_RESUME_CHARS: Joi.number().min(1000).max(100000).default(15000),
  AI_SCREENING_PROMPT_VERSION: Joi.string().min(1).default('v1'),
  AI_SCREENING_SCHEMA_VERSION: Joi.string().min(1).default('v1'),
});

export interface ValidatedEnv {
  NODE_ENV: string;
  APP_PORT: number;
  APP_NAME: string;
  APP_VERSION: string;
  API_PREFIX: string;
  API_VERSION: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;
  REDIS_KEY_PREFIX: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRATION: string;
  JWT_REFRESH_EXPIRATION: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
  REQUEST_TIMEOUT_MS: number;
  HEALTH_CHECK_TIMEOUT_MS: number;
  SWAGGER_ENABLED: boolean;
  LOG_LEVEL: string;
  BUILD_ID?: string;
  [key: string]: unknown;
}

export function validateEnvironment(): ValidatedEnv {
  const nodeEnv = process.env.NODE_ENV || 'development';

  const { error, value } = validationSchema.validate(process.env, {
    allowUnknown: true,
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    for (const detail of error.details) {
      logger.error(`Config validation: ${detail.message}`);
    }
    throw new Error(
      `Environment validation failed:\n${error.details.map((d) => d.message).join('\n')}`,
    );
  }

  const env = value as ValidatedEnv;
  const postErrors: string[] = [];

  if (nodeEnv === 'production') {
    if (env.JWT_SECRET.length < 32) {
      postErrors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (env.JWT_REFRESH_SECRET.length < 32) {
      postErrors.push('JWT_REFRESH_SECRET must be at least 32 characters in production');
    }
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      postErrors.push('JWT_SECRET and JWT_REFRESH_SECRET must not be equal');
    }
    if (env.CORS_ORIGIN === '*') {
      postErrors.push('CORS_ORIGIN must not be wildcard (*) in production');
    }
    if (env.DATABASE_URL.includes('password') || env.DATABASE_URL.includes('postgres:postgres')) {
      postErrors.push(
        'DATABASE_URL contains placeholder credentials. Set a strong production password.',
      );
    }
  }

  if (postErrors.length > 0) {
    for (const err of postErrors) {
      logger.error(err);
    }
    throw new Error(`Production config validation failed:\n${postErrors.join('\n')}`);
  }

  return env;
}
