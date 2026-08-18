import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AiScreeningService } from '../ai-screening.service';

export type BulkScreeningMode =
  'SELECTED' | 'ALL_FOR_JOB' | 'UNSCREENED_FOR_JOB' | 'ALL_UNSCREENED_OPEN_JOBS';

export interface BulkScreeningRequest {
  mode: BulkScreeningMode;
  /** Required when mode=SELECTED */
  applicationIds?: string[];
  /** Required when mode=ALL_FOR_JOB or UNSCREENED_FOR_JOB */
  jobId?: string;
}

export interface BulkScreeningResult {
  batchId: string;
  status: string;
  total: number;
  queued: number;
  reused: number;
  skipped: number;
  errors: number;
}

export interface BulkBatchProgress {
  batchId: string;
  status: string;
  mode: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
  recommended: number;
  humanReview: number;
  notRecommended: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const MAX_BATCH_SIZE = 1000;

/**
 * Progress-relevant snapshot of a single batch item (pure input for
 * computeItemProgress — unit-testable without a database).
 */
export interface ItemProgressInput {
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  action: 'QUEUED' | 'REUSED' | 'SKIPPED' | 'ERROR';
  screeningStatus?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  screeningRecommendation?: string | null;
}

export interface ItemProgressTotals {
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
  recommended: number;
  humanReview: number;
  notRecommended: number;
}

/**
 * Derive batch totals from item snapshots.
 *
 * Invariant: total = completed + failed + skipped + pending.
 *
 * - skipped:   item marked SKIPPED (e.g. no resume) — terminal, never queued
 * - failed:    item with action=ERROR (never reached a screening) OR its
 *              linked screening reached FAILED — terminal
 * - completed: linked screening reached COMPLETED — terminal
 * - pending:   everything else (queued/reused items whose screening is
 *              still PENDING/RUNNING)
 */
export function computeItemProgress(items: ItemProgressInput[]): ItemProgressTotals {
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  let recommended = 0;
  let humanReview = 0;
  let notRecommended = 0;

  for (const item of items) {
    if (item.status === 'SKIPPED') {
      skipped++;
      continue;
    }
    if (item.action === 'ERROR') {
      failed++;
      continue;
    }
    switch (item.screeningStatus) {
      case 'COMPLETED':
        completed++;
        if (item.screeningRecommendation === 'SHORTLIST') recommended++;
        else if (item.screeningRecommendation === 'HUMAN_REVIEW') humanReview++;
        else if (item.screeningRecommendation === 'NOT_SHORTLIST') notRecommended++;
        break;
      case 'FAILED':
        failed++;
        break;
      default:
        pending++;
    }
  }

  return { completed, failed, skipped, pending, recommended, humanReview, notRecommended };
}

@Injectable()
export class BulkScreeningService {
  private readonly logger = new Logger(BulkScreeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly screeningService: AiScreeningService,
  ) {}

  /**
   * Initiate a bulk screening operation.
   *
   * Resolves the application IDs based on mode, verifies ownership, creates an
   * AiScreeningBatch record with one AiScreeningBatchItem per application, then
   * calls requestScreening() once per application — reusing the existing BullMQ
   * pipeline.
   *
   * Each application is evaluated against its own job (never a shared one).
   * No cross-application or cross-job state is shared.
   *
   * Membership rules:
   * - A NEW screening result created for this batch is linked to the batch
   *   (batchId + item.screeningId).
   * - A REUSED existing result is linked via the item only — its batchId is
   *   NEVER overwritten, so earlier batches keep their association.
   * - Skipped/error applications are recorded on their item so the batch
   *   always reaches a terminal state.
   */
  async startBulk(
    request: BulkScreeningRequest,
    companyId: string,
    userId: string,
  ): Promise<BulkScreeningResult> {
    // ── Resolve application IDs ──────────────────────────────────────────────
    const applicationIds = await this.resolveApplicationIds(request, companyId);

    if (applicationIds.length === 0) {
      throw new BadRequestException('No eligible applications found for screening');
    }

    if (applicationIds.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `Batch size exceeds maximum of ${MAX_BATCH_SIZE}. Use multiple smaller batches.`,
      );
    }

    // ── Create batch record + membership items ──────────────────────────────
    const batch = await this.prisma.aiScreeningBatch.create({
      data: {
        companyId,
        initiatedByUserId: userId,
        jobId: request.jobId ?? null,
        mode: request.mode as never,
        status: 'QUEUED' as never,
        totalCount: applicationIds.length,
        startedAt: new Date(),
      },
    });

    await this.prisma.aiScreeningBatchItem.createMany({
      data: applicationIds.map((applicationId) => ({
        batchId: batch.id,
        applicationId,
        status: 'PENDING' as never,
        action: 'QUEUED' as never,
      })),
    });

    this.logger.log(
      `Bulk screening batch ${batch.id} created: ${applicationIds.length} applications, mode=${request.mode}`,
    );

    // ── Queue each application individually ──────────────────────────────────
    // requestScreening() enqueues a BullMQ job and returns immediately.
    // The existing worker handles concurrency, retry, and idempotency.

    let queued = 0;
    let reused = 0;
    let skipped = 0;
    let errors = 0;

    for (const appId of applicationIds) {
      try {
        const result = await this.screeningService.requestScreening(
          appId,
          companyId,
          userId,
          false, // forceRerun=false — reuse existing valid results
        );

        const screeningId = result.data.id;
        const action = result.action === 'CREATED' ? 'QUEUED' : 'REUSED';
        if (result.action === 'CREATED') queued++;
        else reused++;

        // Link the item to the screening. Only CREATED results get the
        // result.batchId pointer; REUSED results keep their original batch.
        await this.prisma.$transaction([
          this.prisma.aiScreeningBatchItem.updateMany({
            where: { batchId: batch.id, applicationId: appId, status: 'PENDING' },
            data: {
              screeningId,
              action: action as never,
              status: 'PENDING' as never,
            },
          }),
          ...(result.action === 'CREATED'
            ? [
                this.prisma.aiScreeningResult.update({
                  where: { id: screeningId },
                  data: { batchId: batch.id },
                }),
              ]
            : []),
        ]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Conflict errors (extraction pending, no resume) — skip gracefully
        if (errMsg.includes('RESUME_EXTRACTION') || errMsg.includes('No resume')) {
          skipped++;
          this.logger.warn(`Skipped application ${appId}: ${errMsg}`);
          await this.prisma.aiScreeningBatchItem.updateMany({
            where: { batchId: batch.id, applicationId: appId, status: 'PENDING' },
            data: {
              status: 'SKIPPED' as never,
              action: 'SKIPPED' as never,
              errorMessage: errMsg.slice(0, 500),
            },
          });
        } else {
          errors++;
          this.logger.error(`Failed to queue application ${appId}: ${errMsg}`);
          await this.prisma.aiScreeningBatchItem.updateMany({
            where: { batchId: batch.id, applicationId: appId, status: 'PENDING' },
            data: {
              status: 'FAILED' as never,
              action: 'ERROR' as never,
              errorMessage: errMsg.slice(0, 500),
            },
          });
        }
      }
    }

    // ── Update batch status ──────────────────────────────────────────────────
    // Terminal immediately only when NOTHING was queued or reused:
    //   - all errors                 -> FAILED
    //   - anything skipped/error     -> PARTIALLY_COMPLETED (nothing screened)
    const terminal = queued + reused === 0;
    const initialStatus =
      errors > 0 && skipped === 0
        ? 'FAILED'
        : skipped > 0 || errors > 0
          ? 'PARTIALLY_COMPLETED'
          : 'RUNNING';

    await this.prisma.aiScreeningBatch.update({
      where: { id: batch.id },
      data: {
        status: initialStatus as never,
        totalCount: applicationIds.length,
        ...(terminal ? { completedAt: new Date() } : {}),
      },
    });

    this.logger.log(
      `Batch ${batch.id}: queued=${queued} reused=${reused} skipped=${skipped} errors=${errors}`,
    );

    return {
      batchId: batch.id,
      status: terminal ? initialStatus : 'QUEUED',
      total: applicationIds.length,
      queued,
      reused,
      skipped,
      errors,
    };
  }

  /**
   * Get batch progress by deriving counts from the batch's membership items
   * and their linked screening results. The individual screening records are
   * always authoritative for screening outcomes; items are authoritative for
   * membership, reuse, skip, and queue-error accounting.
   */
  async getBatchProgress(batchId: string, companyId: string): Promise<BulkBatchProgress> {
    const batch = await this.prisma.aiScreeningBatch.findFirst({
      where: { id: batchId, companyId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const items = await this.prisma.aiScreeningBatchItem.findMany({
      where: { batchId },
    });

    const screeningIds = items.map((i) => i.screeningId).filter((id): id is string => id !== null);

    const screenings =
      screeningIds.length > 0
        ? await this.prisma.aiScreeningResult.findMany({
            where: { id: { in: screeningIds } },
            select: { id: true, status: true, recommendation: true },
          })
        : [];

    const screeningMap = new Map(
      screenings.map((s) => [
        s.id,
        {
          status: s.status as ItemProgressInput['screeningStatus'],
          recommendation: s.recommendation,
        },
      ]),
    );

    const totals = computeItemProgress(
      items.map((item) => ({
        status: item.status as ItemProgressInput['status'],
        action: item.action as ItemProgressInput['action'],
        screeningStatus: item.screeningId ? screeningMap.get(item.screeningId)?.status : undefined,
        screeningRecommendation: item.screeningId
          ? screeningMap.get(item.screeningId)?.recommendation
          : undefined,
      })),
    );

    // ── Auto-complete the batch when nothing remains pending ────────────────
    const total = batch.totalCount;
    const terminal = totals.pending === 0 && total > 0;
    let batchStatus = batch.status as string;

    if (
      terminal &&
      (batchStatus === 'RUNNING' || batchStatus === 'QUEUED' || batchStatus === 'PENDING')
    ) {
      const newStatus =
        totals.failed === 0
          ? 'COMPLETED'
          : totals.failed === total
            ? 'FAILED'
            : 'PARTIALLY_COMPLETED';
      await this.prisma.aiScreeningBatch.update({
        where: { id: batchId },
        data: { status: newStatus as never, completedAt: new Date() },
      });
      batchStatus = newStatus;
    }

    return {
      batchId: batch.id,
      status: batchStatus,
      mode: batch.mode,
      total,
      completed: totals.completed,
      failed: totals.failed,
      skipped: totals.skipped,
      pending: totals.pending,
      recommended: totals.recommended,
      humanReview: totals.humanReview,
      notRecommended: totals.notRecommended,
      createdAt: batch.createdAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Latest non-terminal batch for the requesting company (and user, when the
   * caller is known) — lets the frontend rediscover an active batch after
   * navigation or a page reload.
   */
  async getRecentBatch(companyId: string, userId?: string): Promise<BulkBatchProgress | null> {
    const batch = await this.prisma.aiScreeningBatch.findFirst({
      where: {
        companyId,
        ...(userId ? { initiatedByUserId: userId } : {}),
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!batch) return null;

    return this.getBatchProgress(batch.id, companyId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveApplicationIds(
    request: BulkScreeningRequest,
    companyId: string,
  ): Promise<string[]> {
    switch (request.mode) {
      case 'SELECTED': {
        if (!request.applicationIds || request.applicationIds.length === 0) {
          throw new BadRequestException('applicationIds required for mode=SELECTED');
        }
        // Verify all IDs belong to this company
        const apps = await this.prisma.application.findMany({
          where: {
            id: { in: request.applicationIds },
            companyId,
            deletedAt: null,
          },
          select: { id: true },
        });
        const validIds = new Set(apps.map((a) => a.id));
        const invalid = request.applicationIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
          throw new ForbiddenException(
            `${invalid.length} application(s) not found or not in your company`,
          );
        }
        return request.applicationIds;
      }

      case 'ALL_FOR_JOB': {
        this.assertJobId(request);
        await this.assertJobOwnership(request.jobId!, companyId);
        const apps = await this.prisma.application.findMany({
          where: {
            jobId: request.jobId,
            companyId,
            deletedAt: null,
            status: { notIn: ['ARCHIVED', 'WITHDRAWN'] },
          },
          select: { id: true },
        });
        return apps.map((a) => a.id);
      }

      case 'UNSCREENED_FOR_JOB': {
        this.assertJobId(request);
        await this.assertJobOwnership(request.jobId!, companyId);
        // Applications with no COMPLETED or RUNNING screening for this company
        const screened = await this.prisma.aiScreeningResult.findMany({
          where: {
            companyId,
            status: { in: ['COMPLETED', 'RUNNING', 'PENDING'] },
            application: { jobId: request.jobId },
          },
          select: { applicationId: true },
        });
        const screenedIds = new Set(screened.map((s) => s.applicationId));

        const apps = await this.prisma.application.findMany({
          where: {
            jobId: request.jobId,
            companyId,
            deletedAt: null,
            status: { notIn: ['ARCHIVED', 'WITHDRAWN'] },
          },
          select: { id: true },
        });
        return apps.map((a) => a.id).filter((id) => !screenedIds.has(id));
      }

      case 'ALL_UNSCREENED_OPEN_JOBS': {
        // All unscreened applications across all published jobs
        const screened = await this.prisma.aiScreeningResult.findMany({
          where: {
            companyId,
            status: { in: ['COMPLETED', 'RUNNING', 'PENDING'] },
          },
          select: { applicationId: true },
        });
        const screenedIds = new Set(screened.map((s) => s.applicationId));

        const apps = await this.prisma.application.findMany({
          where: {
            companyId,
            deletedAt: null,
            status: { notIn: ['ARCHIVED', 'WITHDRAWN'] },
            job: { status: { in: ['PUBLISHED', 'PAUSED'] }, deletedAt: null },
          },
          select: { id: true },
        });
        return apps.map((a) => a.id).filter((id) => !screenedIds.has(id));
      }

      default:
        throw new BadRequestException(
          `Unsupported bulk screening mode: ${(request as never)['mode']}`,
        );
    }
  }

  private assertJobId(request: BulkScreeningRequest): void {
    if (!request.jobId) {
      throw new BadRequestException(`jobId required for mode=${request.mode}`);
    }
  }

  private async assertJobOwnership(jobId: string, companyId: string): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found or not in your company`);
    }
  }
}
