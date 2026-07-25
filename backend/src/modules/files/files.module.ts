import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { FilesController } from './controllers/files.controller';
import { FilesService } from './services/files.service';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
  imports: [ApplicationsModule],
  controllers: [FilesController],
  providers: [FilesService, LocalStorageProvider],
  exports: [FilesService, LocalStorageProvider],
})
export class FilesModule {}
