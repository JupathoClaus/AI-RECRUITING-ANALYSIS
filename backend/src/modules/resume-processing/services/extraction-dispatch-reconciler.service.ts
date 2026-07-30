import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobState } from 'bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { ResumeFileReaderService } from './resume-file-reader.service';
import {
  RESUME_EXTRACTION_QUEUE,
  RESUME_EXTRACTION_JOB,
} from '../queue/resume-extraction-queue.constants';
import { ResumeExtractionJobData } from '../queue/resume-extraction-job-data.interface';
import * as crypto from 'crypto';

const DISPATCH_LEASE_TTL_MS = 30_000;
const MAX_DISPATCH_RETRIES = 5;
const BASE_BACKOFF_MS = 5_000;

@Injectable()
export class ExtractionDispatchReconcilerService {
  private readonly logger = new Logger(ExtractionDispatchReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileReader: ResumeFileReaderService,
    @InjectQueue(RESUME_EXTRACTION_QUEUE) private readonly extractionQueue: Queue,
  ) {}

  async reconcile(): Promise<{ reclaimed: number; dispatched: number; failed: number }> {
    let reclaimed = 0;
    let dispatched = 0;
    let failed = 0;

    reclaimed += await this.reclaimStaleDispatching();

    const pending = await this.prisma.extractionDispatch.findMany({
      where: {
        dispatchStatus: { in: ['PENDING_DISPATCH', 'DISPATCH_FAILED'] },
        dispatchAttempts: { lt: MAX_DISPATCH_RETRIES },
        AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }],
      },
      select: {
        id: true,
        extractionId: true,
        dispatchStatus: true,
        dispatchAttempts: true,
        nextAttemptAt: true,
        extraction: {
          select: {
            storedFileId: true,
            companyId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const dispatch of pending) {
      try {
        await this.dispatchOne(dispatch.extractionId);
        dispatched++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to dispatch extraction ${dispatch.extractionId}: ${(err as Error).message}`,
        );
      }
    }

    return { reclaimed, dispatched, failed };
  }

  async dispatchOne(extractionId: string): Promise<void> {
    const committedDispatch = await this.prisma.extractionDispatch.findUnique({
      where: { extractionId },
    });
    if (!committedDispatch) {
      this.logger.error(`Dispatch record for extraction ${extractionId} not found`);
      return;
    }

    if (
      committedDispatch.dispatchStatus === 'DISPATCH_FAILED' &&
      committedDispatch.dispatchAttempts >= MAX_DISPATCH_RETRIES
    ) {
      this.logger.warn(
        `Extraction ${extractionId} dispatch permanently failed after ${committedDispatch.dispatchAttempts} attempts`,
      );
      return;
    }

    if (
      committedDispatch.dispatchStatus === 'DISPATCH_FAILED' &&
      committedDispatch.nextAttemptAt &&
      committedDispatch.nextAttemptAt > new Date()
    ) {
      return;
    }

    if (
      committedDispatch.dispatchStatus !== 'PENDING_DISPATCH' &&
      committedDispatch.dispatchStatus !== 'DISPATCH_FAILED'
    ) {
      return;
    }

    const leaseToken = crypto.randomUUID();
    const claimed = await this.prisma.extractionDispatch.updateMany({
      where: {
        extractionId,
        dispatchStatus: committedDispatch.dispatchStatus,
      },
      data: {
        dispatchStatus: 'DISPATCHING',
        dispatchToken: leaseToken,
        leaseStartedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return;
    }

    const extraction = await this.prisma.resumeTextExtraction.findUnique({
      where: { id: extractionId },
      select: { storedFileId: true, companyId: true },
    });

    if (!extraction) {
      await this.markDispatchFailed(extractionId, leaseToken, 'EXTRACTION_NOT_FOUND');
      return;
    }

    let fileExists = false;
    try {
      fileExists = await this.fileReader.fileExists(extraction.storedFileId, extraction.companyId);
    } catch {
      fileExists = false;
    }

    if (!fileExists) {
      await this.markDispatchFailed(extractionId, leaseToken, 'FILE_NOT_FOUND');
      return;
    }

    const jobId = extractionId;

    try {
      const existingJob = await this.extractionQueue.getJob(jobId);
      if (existingJob) {
        const existingState = await existingJob.getState();
        if (existingState === 'completed') {
          await this.prisma.extractionDispatch.updateMany({
            where: { extractionId, dispatchToken: leaseToken },
            data: {
              dispatchStatus: 'DISPATCHED',
              dispatchToken: null,
              dispatchedAt: new Date(),
              jobId,
            },
          });
          return;
        }
        if (existingState === 'failed') {
          await existingJob.remove();
        } else if (
          existingState === 'waiting' ||
          existingState === 'delayed' ||
          existingState === 'active'
        ) {
          await this.prisma.extractionDispatch.updateMany({
            where: { extractionId, dispatchToken: leaseToken },
            data: {
              dispatchStatus: 'DISPATCHED',
              dispatchToken: null,
              dispatchedAt: new Date(),
              jobId,
            },
          });
          return;
        }
      }

      await this.extractionQueue.add(
        RESUME_EXTRACTION_JOB,
        {
          extractionId,
          storedFileId: extraction.storedFileId,
          companyId: extraction.companyId,
        } satisfies ResumeExtractionJobData,
        { jobId },
      );

      await this.prisma.extractionDispatch.updateMany({
        where: { extractionId, dispatchToken: leaseToken },
        data: {
          dispatchStatus: 'DISPATCHED',
          dispatchToken: null,
          dispatchedAt: new Date(),
          jobId,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue extraction job: ${(err as Error).message}`);
      await this.markDispatchFailed(extractionId, leaseToken, 'QUEUE_FAILURE');
    }
  }

  private async reclaimStaleDispatching(): Promise<number> {
    const staleLeaseThreshold = new Date(Date.now() - DISPATCH_LEASE_TTL_MS);

    const staleDispatches = await this.prisma.extractionDispatch.findMany({
      where: {
        dispatchStatus: 'DISPATCHING',
        leaseStartedAt: { lte: staleLeaseThreshold },
      },
      select: {
        id: true,
        extractionId: true,
        dispatchStatus: true,
        leaseStartedAt: true,
        jobId: true,
      },
    });

    let reclaimed = 0;

    for (const dispatch of staleDispatches) {
      try {
        const jobState = await this.getJobStateInBullMQ(dispatch.extractionId);

        if (
          jobState === 'waiting' ||
          jobState === 'delayed' ||
          jobState === 'active' ||
          jobState === 'completed'
        ) {
          await this.prisma.extractionDispatch.updateMany({
            where: {
              id: dispatch.id,
              dispatchStatus: 'DISPATCHING',
              leaseStartedAt: dispatch.leaseStartedAt,
            },
            data: {
              dispatchStatus: 'DISPATCHED',
              dispatchToken: null,
              dispatchedAt: new Date(),
            },
          });
          this.logger.warn(
            `Stale DISPATCHING → DISPATCHED for extraction ${dispatch.extractionId}: job ${jobState}`,
          );
        } else if (jobState === 'failed') {
          try {
            const job = await this.extractionQueue.getJob(dispatch.extractionId);
            if (job) await job.remove();
          } catch {
            /* empty */
          }
          const nextAttemptAt = new Date(Date.now() + DISPATCH_LEASE_TTL_MS);
          await this.prisma.extractionDispatch.updateMany({
            where: {
              id: dispatch.id,
              dispatchStatus: 'DISPATCHING',
              leaseStartedAt: dispatch.leaseStartedAt,
            },
            data: {
              dispatchStatus: 'PENDING_DISPATCH',
              dispatchToken: null,
              leaseStartedAt: null,
              dispatchAttempts: { increment: 1 },
              nextAttemptAt,
            },
          });
          this.logger.warn(
            `Stale DISPATCHING → PENDING_DISPATCH for extraction ${dispatch.extractionId}: removed failed BullMQ job`,
          );
        } else {
          const nextAttemptAt = new Date(Date.now() + DISPATCH_LEASE_TTL_MS);
          await this.prisma.extractionDispatch.updateMany({
            where: {
              id: dispatch.id,
              dispatchStatus: 'DISPATCHING',
              leaseStartedAt: dispatch.leaseStartedAt,
            },
            data: {
              dispatchStatus: 'PENDING_DISPATCH',
              dispatchToken: null,
              leaseStartedAt: null,
              dispatchAttempts: { increment: 1 },
              nextAttemptAt,
            },
          });
          this.logger.warn(
            `Reclaimed stale DISPATCHING → PENDING_DISPATCH for extraction ${dispatch.extractionId}`,
          );
        }
        reclaimed++;
      } catch (err) {
        this.logger.error(
          `Failed to reconcile stale dispatch ${dispatch.id}: ${(err as Error).message}`,
        );
      }
    }

    return reclaimed;
  }

  private async getJobStateInBullMQ(extractionId: string): Promise<JobState | null> {
    try {
      const job = await this.extractionQueue.getJob(extractionId);
      if (!job) return null;
      return (await job.getState()) as JobState;
    } catch {
      return null;
    }
  }

  private async markDispatchFailed(
    extractionId: string,
    leaseToken: string,
    failureCode: string,
  ): Promise<void> {
    const dispatch = await this.prisma.extractionDispatch.findUnique({
      where: { extractionId },
      select: { dispatchAttempts: true },
    });
    const attempts = (dispatch?.dispatchAttempts ?? 0) + 1;
    const exhausted = attempts >= MAX_DISPATCH_RETRIES;
    const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts - 1), 300_000);
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + backoffMs);

    await this.prisma.extractionDispatch.updateMany({
      where: { extractionId, dispatchToken: leaseToken },
      data: {
        dispatchStatus: 'DISPATCH_FAILED',
        dispatchToken: null,
        dispatchFailedAt: new Date(),
        failureCode,
        lastErrorCode: failureCode,
        dispatchAttempts: attempts,
        nextAttemptAt,
      },
    });

    if (exhausted) {
      this.logger.error(
        `Extraction ${extractionId} dispatch permanently failed after ${attempts} attempts: ${failureCode}`,
      );
    }
  }
}
