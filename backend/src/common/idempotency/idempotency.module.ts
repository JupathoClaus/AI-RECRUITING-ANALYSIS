import { Module, Global } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
