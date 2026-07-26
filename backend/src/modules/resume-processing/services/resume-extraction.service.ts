import { Injectable, Logger, NotFoundException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ResumeFileReaderService } from './resume-file-reader.service';
import { RESUME_EXTRACTION_QUEUE, RESUME_EXTRACTION_JOB } from '../queue/resume-extraction-queue.constants';
import { ResumeExtractionJobData } from '../queue/resume-extraction-job-data.interface';

export interface ExtractionResultOrAction {
  action: 'CREATED' | 'REUSED';
  extraction: { id: string; status: string };
}

export interface ExtractionPendingError {
  statusCode: number;
  code: string;
  message: string;
  extraction: { id: string; status: string; failureCode?: string };
}

@Injectable()
export class ResumeExtractionService {
  private readonly logger = new Logger(ResumeExtractionService.name);
  private readonly parserName: string;
  private readonly parserVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileReader: ResumeFileReaderService,
    @InjectQueue(RESUME_EXTRACTION_QUEUE) private readonly extractionQueue: Queue,
    configService: ConfigService,
  ) {
    this.parserName = configService.get<string>('resumeExtraction.parserName') || 'pdf-parse';
    this.parserVersion = configService.get<string>('resumeExtraction.parserVersion') || '2.4.5';
  }

  async requestExtraction(
    storedFileId: string,
    companyId: string,
    initiatedByUserId?: string,
  ): Promise<ExtractionResultOrAction> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: storedFileId, companyId, category: 'RESUME', status: 'ACTIVE', deletedAt: null },
      select: { id: true, checksumSha256: true, mimeType: true },
    });

    if (!file) {
      throw new NotFoundException('Resume file not found');
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.resumeTextExtraction.findFirst({
              where: {
                storedFileId,
                companyId,
                sourceFileSha256: file.checksumSha256,
                parserName: this.parserName,
                parserVersion: this.parserVersion,
                status: { in: ['COMPLETED', 'PENDING', 'PROCESSING'] },
              },
              orderBy: { createdAt: 'desc' },
            });
            if (existing) {
              return { action: 'REUSED' as const, extraction: { id: existing.id, status: existing.status } };
            }

            const created = await tx.resumeTextExtraction.create({
              data: {
                storedFileId,
                companyId,
                initiatedByUserId,
                status: 'PENDING',
                mimeType: file.mimeType,
                sourceFileSha256: file.checksumSha256,
                parserName: this.parserName,
                parserVersion: this.parserVersion,
              },
            });
            return { action: 'CREATED' as const, extraction: { id: created.id, status: 'PENDING' as const } };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );

        if (result.action === 'REUSED') {
          return result;
        }

        const jobData: ResumeExtractionJobData = {
          extractionId: result.extraction.id,
          storedFileId,
          companyId,
        };

        try {
          await this.extractionQueue.add(RESUME_EXTRACTION_JOB, jobData, {
            jobId: result.extraction.id,
          });
        } catch (err) {
          this.logger.error(`Failed to enqueue extraction job: ${(err as Error).message}`);
          await this.prisma.resumeTextExtraction.update({
            where: { id: result.extraction.id },
            data: { status: 'FAILED', failureCode: 'QUEUE_FAILURE', failureMessageSafe: 'Failed to queue extraction job.' },
          });
          throw new ServiceUnavailableException('Extraction job could not be queued.');
        }

        return result;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2034' && attempt < maxRetries - 1) {
          this.logger.warn(`Serialization conflict on extraction creation (attempt ${attempt + 1}), retrying`);
          continue;
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException('Could not create extraction attempt due to concurrent access.');
  }
}
