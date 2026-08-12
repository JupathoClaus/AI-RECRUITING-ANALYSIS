import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { FilesController } from './controllers/files.controller';
import { PublicFilesController } from './controllers/public-files.controller';
import { FilesService } from './services/files.service';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
  imports: [ApplicationsModule],
  controllers: [FilesController, PublicFilesController],
  providers: [FilesService, LocalStorageProvider],
  exports: [FilesService, LocalStorageProvider],
})
export class FilesModule {}
