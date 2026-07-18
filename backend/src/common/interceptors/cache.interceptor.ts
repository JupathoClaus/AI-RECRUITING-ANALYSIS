import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '@modules/redis/redis.service';
import { Request } from 'express';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(private readonly redisService: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.method !== 'GET') {
      return next.handle();
    }

    const cacheKey = this.generateCacheKey(request);

    try {
      const cachedData = await this.redisService.get(cacheKey);

      if (cachedData) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return of(JSON.parse(cachedData));
      }
    } catch (error) {
      this.logger.error(`Cache error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(data), 60);
          this.logger.debug(`Cache set: ${cacheKey}`);
        } catch (error) {
          this.logger.error(
            `Cache set error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }

  private generateCacheKey(request: Request): string {
    const { method, url, query } = request;
    const user = (request as unknown as Record<string, unknown>).user as
      Record<string, unknown> | undefined;
    const userId = user?.id || 'anonymous';
    return `cache:${method}:${url}:${JSON.stringify(query)}:${userId}`;
  }
}
