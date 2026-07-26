import { Injectable, Logger, NotFoundException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { ResumeFileReaderService } from './resume-file-reader.service';
import { RESUME_EXTRACTION_QUEUE, RESUME_EXTRACTION_JOB } from '../queue/resume-extraction-queue.constants';
import { ResumeExtractionJobData } from '../queue/resume-extraction-job-data.interface';

export interface ExtractionResultOrAction {
  action: 'CREATED' | 'REUSED';
  extraction: { id: string; status: string };
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
    this.parserVersion = configService.get<string>('resumeExtraction.parserVersion') || '1.1.1';
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

    const existingCompleted = await this.prisma.resumeTextExtraction.findFirst({
      where: {
        storedFileId,
        companyId,
        sourceFileSha256: file.checksumSha256,
        parserName: this.parserName,
        parserVersion: this.parserVersion,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });

    if (existingCompleted) {
      return { action: 'REUSED', extraction: { id: existingCompleted.id, status: 'COMPLETED' } };
    }

    const existingPending = await this.prisma.resumeTextExtraction.findFirst({
      where: {
        storedFileId,
        companyId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending) {
      return { action: 'REUSED', extraction: { id: existingPending.id, status: existingPending.status } };
    }

    const extraction = await this.prisma.resumeTextExtraction.create({
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

    const jobData: ResumeExtractionJobData = {
      extractionId: extraction.id,
      storedFileId,
      companyId,
    };

    try {
      await this.extractionQueue.add(RESUME_EXTRACTION_JOB, jobData, {
        jobId: extraction.id,
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue extraction job: ${(err as Error).message}`);
      await this.prisma.resumeTextExtraction.update({
        where: { id: extraction.id },
        data: { status: 'FAILED', failureCode: 'QUEUE_FAILURE', failureMessageSafe: 'Failed to queue extraction job.' },
      });
      throw new ServiceUnavailableException('Extraction job could not be queued.');
    }

    return { action: 'CREATED', extraction: { id: extraction.id, status: 'PENDING' } };
  }
}
