import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RATE_LIMIT_TTL_KEY = 'rateLimitTtl';
export const RATE_LIMIT_COUNT_KEY = 'rateLimitCount';

export interface RateLimitOptions {
  ttl?: number;
  count?: number;
}

export const RateLimit = (options: RateLimitOptions = {}) =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, true),
    SetMetadata(RATE_LIMIT_TTL_KEY, options.ttl || 60000),
    SetMetadata(RATE_LIMIT_COUNT_KEY, options.count || 100),
  );

function applyDecorators(...decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, propertyKey) => {
    decorators.forEach((decorator) => decorator(target, propertyKey));
  };
}
