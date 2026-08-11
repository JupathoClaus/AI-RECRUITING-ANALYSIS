import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { RedisModule } from '@modules/redis/redis.module';
import { OrganizationAuditService } from './organization-audit.service';
import { AuthorizationCacheService } from './authorization-cache.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [OrganizationAuditService, AuthorizationCacheService],
  exports: [OrganizationAuditService, AuthorizationCacheService],
})
export class OrganizationModule {}
