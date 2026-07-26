import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';

export interface CompletedExtraction {
  parsedText: string;
  extractedTextSha256: string;
  sourceFileSha256: string;
  parserName: string;
  parserVersion: string;
  completedAt: Date;
}

@Injectable()
export class ResumeTextLoaderService {
  private readonly logger = new Logger(ResumeTextLoaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadCompletedExtraction(
    storedFileId: string,
    companyId: string,
  ): Promise<CompletedExtraction | null> {
    const extraction = await this.prisma.resumeTextExtraction.findFirst({
      where: {
        storedFileId,
        companyId,
        status: 'COMPLETED',
        storedFile: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    if (!extraction || !extraction.extractedText) {
      return null;
    }

    return {
      parsedText: extraction.extractedText,
      extractedTextSha256: extraction.extractedTextSha256 ?? '',
      sourceFileSha256: extraction.sourceFileSha256 ?? '',
      parserName: extraction.parserName ?? '',
      parserVersion: extraction.parserVersion ?? '',
      completedAt: extraction.completedAt!,
    };
  }
}
