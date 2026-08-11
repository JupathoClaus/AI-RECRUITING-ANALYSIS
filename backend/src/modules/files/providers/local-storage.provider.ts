import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, normalize, resolve, sep } from 'path';
import { ReadStream } from 'fs';
import { StorageProvider, StoragePutResult } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;

  constructor(configService: ConfigService) {
    const uploadDir = configService.get<string>('app.uploadDir') || './uploads';
    this.basePath = resolve(uploadDir);
    mkdirSync(this.basePath, { recursive: true });
    this.logger.log(`Local storage root: ${this.basePath}`);
  }

  async put(
    companyId: string,
    storedName: string,
    buffer: Buffer,
    _mimeType: string,
  ): Promise<StoragePutResult> {
    const companyDir = join(this.basePath, companyId);
    mkdirSync(companyDir, { recursive: true });

    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const storageKey = `${companyId}/${storedName}`;
    const absolutePath = resolve(join(this.basePath, storageKey));

    this.assertPathSafe(absolutePath);

    writeFileSync(absolutePath, buffer);

    return { storageKey, checksumSha256, sizeBytes: buffer.length };
  }

  async get(
    storageKey: string,
  ): Promise<{ stream: ReadStream; mimeType: string; sizeBytes: number }> {
    const absolutePath = this.resolveSafe(storageKey);
    let stat;
    try {
      stat = await import('fs/promises').then((fs) => fs.stat(absolutePath));
    } catch (err) {
      throw err;
    }
    const ext = storageKey.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return {
      stream: createReadStream(absolutePath),
      mimeType: mimeMap[ext] || 'application/octet-stream',
      sizeBytes: stat.size,
    };
  }

  async exists(storageKey: string): Promise<boolean> {
    const absolutePath = this.resolveSafe(storageKey);
    return existsSync(absolutePath);
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.resolveSafe(storageKey);
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }
  }

  private resolveSafe(storageKey: string): string {
    const absolutePath = resolve(join(this.basePath, storageKey));
    this.assertPathSafe(absolutePath);
    return absolutePath;
  }

  private assertPathSafe(absolutePath: string): void {
    const normalized = normalize(absolutePath);
    if (!normalized.startsWith(this.basePath)) {
      throw new Error('Path traversal detected');
    }
  }

  generateStoredName(extension: string): string {
    const id = randomUUID();
    return `${id}.${extension}`;
  }
}
