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
  | 'SELECTED'
  | 'ALL_FOR_JOB'
  | 'UNSCREENED_FOR_JOB'
  | 'ALL_UNSCREENED_OPEN_JOBS';

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
  pending: number;
  recommended: number;
  humanReview: number;
  notRecommended: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const MAX_BATCH_SIZE = 1000;

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
   * Resolves the application IDs based on mode, verifies ownership,
   * creates an AiScreeningBatch record, then calls requestScreening()
   * once per application — reusing the existing BullMQ pipeline.
   *
   * Each application is evaluated against its own job (never a shared one).
   * No cross-application or cross-job state is shared.
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

    // ── Create batch record ──────────────────────────────────────────────────
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

    this.logger.log(
      `Bulk screening batch ${batch.id} created: ${applicationIds.length} applications, mode=${request.mode}`,
    );

    // ── Queue each application individually ──────────────────────────────────
    // We do NOT loop synchronously and await all model calls.
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

        // Attach batchId to the screening record
        const screeningId = result.data.id;
        await this.prisma.aiScreeningResult.update({
          where: { id: screeningId },
          data: { batchId: batch.id },
        });

        if (result.action === 'CREATED') queued++;
        else reused++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Conflict errors (extraction pending, no resume) — skip gracefully
        if (errMsg.includes('RESUME_EXTRACTION') || errMsg.includes('No resume')) {
          skipped++;
          this.logger.warn(`Skipped application ${appId}: ${errMsg}`);
        } else {
          errors++;
          this.logger.error(`Failed to queue application ${appId}: ${errMsg}`);
        }
      }
    }

    // Update batch status
    await this.prisma.aiScreeningBatch.update({
      where: { id: batch.id },
      data: {
        status: errors === applicationIds.length ? 'FAILED' : ('RUNNING' as never),
        totalCount: applicationIds.length,
      },
    });

    this.logger.log(
      `Batch ${batch.id}: queued=${queued} reused=${reused} skipped=${skipped} errors=${errors}`,
    );

    return {
      batchId: batch.id,
      status: 'QUEUED',
      total: applicationIds.length,
      queued,
      reused,
      skipped,
      errors,
    };
  }

  /**
   * Get batch progress by deriving counts from individual AiScreeningResult records.
   * The individual records are always authoritative.
   */
  async getBatchProgress(batchId: string, companyId: string): Promise<BulkBatchProgress> {
    const batch = await this.prisma.aiScreeningBatch.findFirst({
      where: { id: batchId, companyId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    // Derive live counts from the individual screening records
    const results = await this.prisma.aiScreeningResult.groupBy({
      by: ['status', 'recommendation'],
      where: { batchId, companyId },
      _count: { id: true },
    });

    let completed = 0;
    let failed = 0;
    let pending = 0;
    let recommended = 0;
    let humanReview = 0;
    let notRecommended = 0;

    for (const row of results) {
      const count = row._count.id;
      if (row.status === 'COMPLETED') {
        completed += count;
        if (row.recommendation === 'SHORTLIST') recommended += count;
        else if (row.recommendation === 'HUMAN_REVIEW') humanReview += count;
        else if (row.recommendation === 'NOT_SHORTLIST') notRecommended += count;
      } else if (row.status === 'FAILED') {
        failed += count;
      } else {
        pending += count;
      }
    }

    // Auto-complete the batch when all screened
    const total = batch.totalCount;
    const done = completed + failed;
    let batchStatus = batch.status as string;

    if (done >= total && total > 0 && batchStatus === 'RUNNING') {
      const newStatus = failed === 0 ? 'COMPLETED' : failed === total ? 'FAILED' : 'PARTIALLY_COMPLETED';
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
      completed,
      failed,
      pending,
      recommended,
      humanReview,
      notRecommended,
      createdAt: batch.createdAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
    };
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
        throw new BadRequestException(`Unsupported bulk screening mode: ${(request as never)['mode']}`);
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
