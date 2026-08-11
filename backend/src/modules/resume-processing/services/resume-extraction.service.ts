import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ResumeFileReaderService } from './resume-file-reader.service';
import { ExtractionDispatchReconcilerService } from './extraction-dispatch-reconciler.service';

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
    private readonly reconciler: ExtractionDispatchReconcilerService,
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
            // DEBUG: check all extractions visible in this transaction
            const existing = await tx.resumeTextExtraction.findFirst({
              where: {
                storedFileId,
                companyId,
                sourceFileSha256: file.checksumSha256,
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

        if (result.action === 'CREATED') {
          await this.reconciler.dispatchOne(result.extraction.id);
        }

        return result;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2034' && attempt < maxRetries - 1) {
          this.logger.warn(
            `Serialization conflict on extraction creation (attempt ${attempt + 1}), retrying`,
          );
          continue;
        }
        if (prismaErr.code === 'P2034') {
          throw new ServiceUnavailableException(
            'Could not create extraction attempt due to concurrent access.',
          );
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
                },
              });

              return {
                action: 'CREATED' as const,
                extraction: { id: created.id, status: 'PENDING' as const },
              };
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

        if (result.action === 'CREATED') {
          await this.reconciler.dispatchOne(result.extraction.id);
        }

        return result;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2034' && attempt < maxRetries - 1) {
          this.logger.warn(
            `Serialization conflict on retry extraction (attempt ${attempt + 1}), retrying`,
          );
          continue;
        }
        if (prismaErr.code === 'P2034') {
          throw new ServiceUnavailableException(
            'Could not create retry extraction due to concurrent access.',
          );
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException(
      'Could not create retry extraction due to concurrent access.',
    );
  }
}
