import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { PipelineController } from './pipeline.controller';
import { ApplicationsModule } from '@modules/applications/applications.module';

@Module({
  imports: [DatabaseModule, ApplicationsModule],
  controllers: [PipelineController],
})
export class PipelineModule {}
