import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { StorageModule } from './storage.module';
import { FilesController } from './controllers/files.controller';
import { PublicFilesController } from './controllers/public-files.controller';
import { FilesService } from './services/files.service';

@Module({
  imports: [ApplicationsModule, StorageModule],
  controllers: [FilesController, PublicFilesController],
  providers: [FilesService],
  exports: [FilesService, StorageModule],
})
export class FilesModule {}
