import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Registers the @nestjs/throttler guard globally so that @Throttle()
 * decorators (e.g. on public AI interview endpoints) are enforced.
 * The global default is 100 requests / 60s per IP; route-level
 * decorators override it.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class CommonModule {}