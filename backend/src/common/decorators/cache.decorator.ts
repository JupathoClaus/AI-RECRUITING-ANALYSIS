import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY = 'cache';
export const CACHE_TTL_KEY = 'cacheTtl';

export const Cache = (ttl: number = 60) => SetMetadata(CACHE_KEY, { ttl });

export const NoCache = () => SetMetadata(CACHE_KEY, null);
