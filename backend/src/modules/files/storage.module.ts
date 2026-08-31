import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './providers/local-storage.provider';

/**
 * Registers the local filesystem storage provider so any module can persist
 * applicant/company files without importing the whole FilesModule (which
 * depends on ApplicationsModule and would create module cycles).
 */
@Module({
  providers: [LocalStorageProvider],
  exports: [LocalStorageProvider],
})
export class StorageModule {}
