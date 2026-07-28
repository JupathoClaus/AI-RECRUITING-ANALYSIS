import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ResumeFileReaderService } from './resume-file-reader.service';
import {
  RESUME_EXTRACTION_QUEUE,
  RESUME_EXTRACTION_JOB,
} from '../queue/resume-extraction-queue.constants';
import { ResumeExtractionJobData } from '../queue/resume-extraction-job-data.interface';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import * as crypto from 'crypto';

export interface ExtractionResultOrAction {
  action: 'CREATED' | 'REUSED';
  extraction: { id: string; status: string; failureCode?: string | null };
}

export const MAX_EXTRACTION_RETRIES = 3;

@Injectable()
export class ResumeExtractionService {
  private readonly logger = new Logger(ResumeExtractionService.name);
  private readonly parserName: string;
  private readonly parserVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileReader: ResumeFileReaderService,
    @InjectQueue(RESUME_EXTRACTION_QUEUE) private readonly extractionQueue: Queue,
    private readonly idempotencyService: IdempotencyService,
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
                status: { in: ['COMPLETED', 'PENDING', 'PROCESSING', 'FAILED'] },
              },
              orderBy: { createdAt: 'desc' },
            });

            if (existing && existing.status !== 'FAILED') {
              return {
                action: 'REUSED' as const,
                extraction: { id: existing.id, status: existing.status },
              };
            }

            if (existing && existing.status === 'FAILED') {
              const failedCount = await tx.resumeTextExtraction.count({
                where: {
                  storedFileId,
                  companyId,
                  sourceFileSha256: file.checksumSha256,
                  parserName: this.parserName,
                  parserVersion: this.parserVersion,
                  status: 'FAILED',
                },
              });
              if (failedCount >= MAX_EXTRACTION_RETRIES) {
                throw new ConflictException({
                  code: 'RESUME_EXTRACTION_FAILED',
                  message:
                    'Resume extraction has failed after maximum retry attempts. Upload a new resume file.',
                });
              }
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

            await tx.extractionDispatch.create({
              data: {
                extractionId: created.id,
                dispatchStatus: 'PENDING_DISPATCH',
                dispatchToken: null,
              },
            });

            return {
              action: 'CREATED' as const,
              extraction: { id: created.id, status: 'PENDING' as const },
            };
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

        await this.dispatchExtraction(result.extraction.id, storedFileId, companyId);

        return result;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2034' && attempt < maxRetries - 1) {
          this.logger.warn(
            `Serialization conflict on extraction creation (attempt ${attempt + 1}), retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException(
      'Could not create extraction attempt due to concurrent access.',
    );
  }

  async retryExtraction(
    storedFileId: string,
    companyId: string,
    initiatedByUserId: string,
  ): Promise<ExtractionResultOrAction> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: storedFileId, companyId, category: 'RESUME', status: 'ACTIVE', deletedAt: null },
      select: { id: true, checksumSha256: true, mimeType: true },
    });

    if (!file) {
      throw new NotFoundException('Resume file not found');
    }

    const generationKey = `retry-extraction:${storedFileId}:${this.parserName}:${this.parserVersion}`;

    const claim = await this.idempotencyService.executeTransactional<ExtractionResultOrAction>({
      key: generationKey,
      companyId,
      userId: '',
      operation: 'RESUME_EXTRACTION_RETRY',
      requestHash: crypto.createHash('sha256').update(generationKey).digest('hex'),
      execute: async (tx) => {
        const existingActive = await tx.resumeTextExtraction.findFirst({
          where: {
            storedFileId,
            companyId,
            sourceFileSha256: file.checksumSha256,
            parserName: this.parserName,
            parserVersion: this.parserVersion,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingActive) {
          return {
            resourceType: 'resumeTextExtraction',
            resourceId: existingActive.id,
            responseJson: {
              action: 'REUSED',
              extraction: { id: existingActive.id, status: existingActive.status },
            },
          };
        }

        const failedCount = await tx.resumeTextExtraction.count({
          where: {
            storedFileId,
            companyId,
            sourceFileSha256: file.checksumSha256,
            parserName: this.parserName,
            parserVersion: this.parserVersion,
            status: 'FAILED',
          },
        });

        if (failedCount >= MAX_EXTRACTION_RETRIES) {
          throw new ConflictException({
            code: 'RESUME_EXTRACTION_FAILED',
            message:
              'Resume extraction has failed after maximum retry attempts. Upload a new resume file.',
          });
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
            retryGeneration: failedCount + 1,
          },
        });

        await tx.extractionDispatch.create({
          data: {
            extractionId: created.id,
            dispatchStatus: 'PENDING_DISPATCH',
            dispatchToken: null,
          },
        });

        return {
          resourceType: 'resumeTextExtraction',
          resourceId: created.id,
          responseJson: {
            action: 'CREATED',
            extraction: { id: created.id, status: 'PENDING' },
          },
        };
      },
    });

    if (claim.status === 'COMPLETED') {
      const result = claim.responseJson as ExtractionResultOrAction;

      if (result.action === 'CREATED') {
        await this.dispatchExtraction(result.extraction.id, storedFileId, companyId);
      }

      return result;
    }

    const pollResult = await this.prisma.resumeTextExtraction.findFirst({
      where: {
        storedFileId,
        companyId,
        sourceFileSha256: file.checksumSha256,
        parserName: this.parserName,
        parserVersion: this.parserVersion,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pollResult) {
      return {
        action: 'REUSED',
        extraction: { id: pollResult.id, status: pollResult.status },
      };
    }

    return { action: 'CREATED', extraction: { id: '', status: 'PENDING' } };
  }

  private async dispatchExtraction(
    extractionId: string,
    storedFileId: string,
    companyId: string,
  ): Promise<void> {
    const dispatchToken = crypto.randomUUID();

    const acquired = await this.prisma.extractionDispatch.updateMany({
      where: {
        extractionId,
        dispatchStatus: { in: ['PENDING_DISPATCH', 'DISPATCH_FAILED'] },
      },
      data: {
        dispatchStatus: 'DISPATCHING',
        dispatchToken,
      },
    });

    if (acquired.count === 0) {
      return;
    }

    const jobData: ResumeExtractionJobData = {
      extractionId,
      storedFileId,
      companyId,
    };

    try {
      await this.extractionQueue.add(RESUME_EXTRACTION_JOB, jobData, {
        jobId: extractionId,
      });

      await this.prisma.extractionDispatch.updateMany({
        where: { extractionId, dispatchToken },
        data: {
          dispatchStatus: 'DISPATCHED',
          dispatchToken: null,
          dispatchedAt: new Date(),
          jobId: extractionId,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue extraction job: ${(err as Error).message}`);
      await this.prisma.extractionDispatch.updateMany({
        where: { extractionId, dispatchToken },
        data: {
          dispatchStatus: 'DISPATCH_FAILED',
          dispatchToken: null,
          dispatchFailedAt: new Date(),
          failureCode: 'QUEUE_FAILURE',
          failureMessage: 'Failed to queue extraction job.',
        },
      });
      throw new ServiceUnavailableException('Extraction job could not be queued.');
    }
  }
}
