import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';

@Injectable()
export class AuthorizationCacheService {
  private readonly logger = new Logger(AuthorizationCacheService.name);

  constructor(private readonly redisService: RedisService) {}

  async clearMemberCache(membershipId: string): Promise<void> {
    this.logger.debug(`Clearing authorization cache for membership ${membershipId}`);
    await this.redisService.del(`auth:member:${membershipId}`);
  }

  async clearCompanyMemberCache(companyId: string): Promise<void> {
    this.logger.debug(`Clearing all member authorization caches for company ${companyId}`);
    await this.redisService.del(`auth:company:${companyId}:members`);
  }
}
