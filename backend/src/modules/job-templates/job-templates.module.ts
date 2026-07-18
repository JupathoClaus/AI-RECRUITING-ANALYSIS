import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { JobTemplatesController } from './job-templates.controller';
import { JobTemplatesService } from './job-templates.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JobTemplatesController],
  providers: [JobTemplatesService],
  exports: [JobTemplatesService],
})
export class JobTemplatesModule {}
