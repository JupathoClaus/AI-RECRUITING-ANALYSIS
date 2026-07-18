import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '@modules/redis/redis.service';

@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(ThrottlerGuard.name);
  private readonly windowMs = 60000;
  private readonly maxRequests = 100;

  constructor(
    private reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clientIp = request.ip || request.connection.remoteAddress;
    const key = `throttle:${clientIp}`;

    try {
      const currentCount = await this.redisService.get(key);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= this.maxRequests) {
        this.logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
        throw new HttpException(
          'Rate limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.redisService.setWithExpiry(
        key,
        String(count + 1),
        Math.ceil(this.windowMs / 1000),
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Throttle check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }
}
