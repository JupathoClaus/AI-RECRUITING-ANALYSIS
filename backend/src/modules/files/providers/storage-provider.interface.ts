import { ReadStream } from 'fs';

export interface StoragePutResult {
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
}

export interface StorageProvider {
  put(
    companyId: string,
    storedName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoragePutResult>;

  get(storageKey: string): Promise<{ stream: ReadStream; mimeType: string; sizeBytes: number }>;

  exists(storageKey: string): Promise<boolean>;

  delete(storageKey: string): Promise<void>;
}
