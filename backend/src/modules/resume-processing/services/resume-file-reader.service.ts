import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { LocalStorageProvider } from '../../files/providers/local-storage.provider';

@Injectable()
export class ResumeFileReaderService {
  private readonly logger = new Logger(ResumeFileReaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageProvider,
  ) {}

  async fileExists(storedFileId: string, companyId: string): Promise<boolean> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: storedFileId, companyId, category: 'RESUME', status: 'ACTIVE', deletedAt: null },
      select: { storageKey: true },
    });
    if (!file) return false;
    try {
      return await this.storage.exists(file.storageKey);
    } catch {
      return false;
    }
  }

  async readStoredFile(
    storedFileId: string,
    companyId: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    checksumSha256: string;
    sizeBytes: number;
  }> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: storedFileId, companyId, category: 'RESUME', status: 'ACTIVE', deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('Stored file not found');
    }

    const { stream, mimeType, sizeBytes } = await this.storage.get(file.storageKey);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    return {
      buffer,
      mimeType,
      originalName: file.originalName,
      checksumSha256: file.checksumSha256,
      sizeBytes,
    };
  }
}
