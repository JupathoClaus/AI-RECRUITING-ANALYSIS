import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BulkScreeningService, computeItemProgress } from '../services/bulk-screening.service';
import { ItemProgressInput } from '../services/bulk-screening.service';

// ── Pure progress accounting ─────────────────────────────────────────────────

describe('computeItemProgress (pure batch accounting)', () => {
  it('exactly matches the 50/45/3/2 audit scenario: 45 queued + 3 reused + 2 skipped', () => {
    const items: ItemProgressInput[] = [
      // 45 newly queued, all COMPLETED
      ...Array.from({ length: 45 }, () => ({
        status: 'PENDING' as const,
        action: 'QUEUED' as const,
        screeningStatus: 'COMPLETED' as const,
        screeningRecommendation: 'SHORTLIST' as const,
      })),
      // 3 reused, all COMPLETED
      ...Array.from({ length: 3 }, () => ({
        status: 'PENDING' as const,
        action: 'REUSED' as const,
        screeningStatus: 'COMPLETED' as const,
        screeningRecommendation: 'HUMAN_REVIEW' as const,
      })),
      // 2 skipped (no resume) — terminal without any screening record
      ...Array.from({ length: 2 }, () => ({
        status: 'SKIPPED' as const,
        action: 'SKIPPED' as const,
      })),
    ];

    const totals = computeItemProgress(items);
    expect(totals.completed).toBe(48);
    expect(totals.skipped).toBe(2);
    expect(totals.failed).toBe(0);
    expect(totals.pending).toBe(0);
    // Invariant: total = completed + failed + skipped + pending
    expect(totals.completed + totals.failed + totals.skipped + totals.pending).toBe(50);
  });

  it('reused item with an in-flight screening counts as pending (batch cannot be stuck)', () => {
    const totals = computeItemProgress([
      { status: 'PENDING', action: 'REUSED', screeningStatus: 'RUNNING' },
    ]);
    expect(totals.pending).toBe(1);
    expect(totals.completed).toBe(0);
  });

  it('queue-error items (action=ERROR) count as failed and are terminal', () => {
    const totals = computeItemProgress([
      { status: 'FAILED', action: 'ERROR', errorMessage: 'boom' } as ItemProgressInput,
    ]);
    expect(totals.failed).toBe(1);
    expect(totals.pending).toBe(0);
  });

  it('a failed linked screening counts as failed', () => {
    const totals = computeItemProgress([
      { status: 'PENDING', action: 'QUEUED', screeningStatus: 'FAILED' },
    ]);
    expect(totals.failed).toBe(1);
    expect(totals.pending).toBe(0);
  });

  it('breaks recommendations down from completed screenings', () => {
    const totals = computeItemProgress([
      {
        status: 'PENDING',
        action: 'QUEUED',
        screeningStatus: 'COMPLETED',
        screeningRecommendation: 'SHORTLIST',
      },
      {
        status: 'PENDING',
        action: 'QUEUED',
        screeningStatus: 'COMPLETED',
        screeningRecommendation: 'SHORTLIST',
      },
      {
        status: 'PENDING',
        action: 'QUEUED',
        screeningStatus: 'COMPLETED',
        screeningRecommendation: 'HUMAN_REVIEW',
      },
      {
        status: 'PENDING',
        action: 'QUEUED',
        screeningStatus: 'COMPLETED',
        screeningRecommendation: 'NOT_SHORTLIST',
      },
      {
        status: 'PENDING',
        action: 'QUEUED',
        screeningStatus: 'COMPLETED',
        screeningRecommendation: null,
      },
    ]);
    expect(totals.recommended).toBe(2);
    expect(totals.humanReview).toBe(1);
    expect(totals.notRecommended).toBe(1);
    expect(totals.completed).toBe(5);
  });

  it('partial failure accounting: completed + failed + skipped = total, zero pending', () => {
    const items: ItemProgressInput[] = [
      { status: 'PENDING', action: 'QUEUED', screeningStatus: 'COMPLETED' },
      { status: 'PENDING', action: 'QUEUED', screeningStatus: 'COMPLETED' },
      { status: 'PENDING', action: 'QUEUED', screeningStatus: 'FAILED' },
      { status: 'FAILED', action: 'ERROR' },
      { status: 'SKIPPED', action: 'SKIPPED' },
      { status: 'PENDING', action: 'REUSED', screeningStatus: 'COMPLETED' },
    ];
    const totals = computeItemProgress(items);
    expect(totals.completed).toBe(3);
    expect(totals.failed).toBe(2);
    expect(totals.skipped).toBe(1);
    expect(totals.pending).toBe(0);
    expect(totals.completed + totals.failed + totals.skipped + totals.pending).toBe(6);
  });
});

// ── Service-level behaviour (mocked Prisma) ─────────────────────────────────

function makePrismaMock() {
  return {
    aiScreeningBatch: {
      create: jest.fn().mockResolvedValue({
        id: 'batch-1',
        companyId: 'company-1',
        initiatedByUserId: 'user-1',
        jobId: null,
        mode: 'SELECTED',
        status: 'QUEUED',
        totalCount: 2,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'batch-1' }),
      findFirst: jest.fn(),
    },
    aiScreeningBatchItem: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    },
    aiScreeningResult: {
      update: jest.fn().mockResolvedValue({ id: 'screening-1' }),
      findMany: jest.fn(),
    },
    application: { findMany: jest.fn() },
    job: { findFirst: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

function makeScreeningServiceMock() {
  return {
    requestScreening: jest.fn(),
  };
}

function makeService() {
  const prisma = makePrismaMock();
  const screening = makeScreeningServiceMock();
  const service = new BulkScreeningService(prisma as never, screening as never);
  return { prisma, screening, service };
}

describe('BulkScreeningService.startBulk', () => {
  it('queues applications and links CREATED screenings to the batch', async () => {
    const { prisma, screening, service } = makeService();
    prisma.application.findMany.mockResolvedValue([{ id: 'app-1' }, { id: 'app-2' }]);
    screening.requestScreening
      .mockResolvedValueOnce({ action: 'CREATED', data: { id: 'screening-1' } })
      .mockResolvedValueOnce({ action: 'CREATED', data: { id: 'screening-2' } });

    const result = await service.startBulk(
      { mode: 'SELECTED', applicationIds: ['app-1', 'app-2'] },
      'company-1',
      'user-1',
    );

    expect(prisma.aiScreeningBatch.create).toHaveBeenCalled();
    expect(prisma.aiScreeningBatchItem.createMany).toHaveBeenCalledWith({
      data: [
        { batchId: 'batch-1', applicationId: 'app-1', status: 'PENDING', action: 'QUEUED' },
        { batchId: 'batch-1', applicationId: 'app-2', status: 'PENDING', action: 'QUEUED' },
      ],
    });
    expect(result.queued).toBe(2);
    // CREATED results get their batchId pointer set
    expect(prisma.aiScreeningResult.update).toHaveBeenCalledTimes(2);
  });

  it('REUSED screenings are linked via the item but their batchId is NEVER overwritten', async () => {
    const { prisma, screening, service } = makeService();
    prisma.application.findMany.mockResolvedValue([{ id: 'app-1' }]);
    screening.requestScreening.mockResolvedValue({
      action: 'REUSED',
      data: { id: 'existing-screening' },
    });

    await service.startBulk({ mode: 'SELECTED', applicationIds: ['app-1'] }, 'company-1', 'user-1');

    // Item linked to the existing screening...
    expect(prisma.aiScreeningBatchItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ screeningId: 'existing-screening', action: 'REUSED' }),
      }),
    );
    // ...but the screening result itself must NOT be re-pointed (would corrupt
    // the previous batch's association).
    expect(prisma.aiScreeningResult.update).not.toHaveBeenCalled();
  });

  it('skips applications without resumes and records them as SKIPPED items', async () => {
    const { prisma, screening, service } = makeService();
    prisma.application.findMany.mockResolvedValue([{ id: 'app-1' }, { id: 'app-2' }]);
    screening.requestScreening
      .mockResolvedValueOnce({ action: 'CREATED', data: { id: 'screening-1' } })
      .mockRejectedValueOnce(new Error('No resume file found for this application.'));

    const result = await service.startBulk(
      { mode: 'SELECTED', applicationIds: ['app-1', 'app-2'] },
      'company-1',
      'user-1',
    );

    expect(result.queued).toBe(1);
    expect(result.skipped).toBe(1);
    expect(prisma.aiScreeningBatchItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: 'batch-1', applicationId: 'app-2', status: 'PENDING' },
        data: expect.objectContaining({ status: 'SKIPPED', action: 'SKIPPED' }),
      }),
    );
  });

  it('records queue errors as FAILED items and marks an all-error batch FAILED', async () => {
    const { prisma, screening, service } = makeService();
    prisma.application.findMany.mockResolvedValue([{ id: 'app-1' }]);
    screening.requestScreening.mockRejectedValue(new Error('Redis connection failed'));

    const result = await service.startBulk(
      { mode: 'SELECTED', applicationIds: ['app-1'] },
      'company-1',
      'user-1',
    );

    expect(result.errors).toBe(1);
    expect(prisma.aiScreeningBatchItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', action: 'ERROR' }),
      }),
    );
    expect(prisma.aiScreeningBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', completedAt: expect.any(Date) }),
      }),
    );
  });

  it('rejects cross-company application IDs', async () => {
    const { prisma, service } = makeService();
    // Only app-1 belongs to company-1; app-2 is foreign
    prisma.application.findMany.mockResolvedValue([{ id: 'app-1' }]);

    await expect(
      service.startBulk(
        { mode: 'SELECTED', applicationIds: ['app-1', 'app-2'] },
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces the 1000-application batch limit server-side', async () => {
    const { prisma, service } = makeService();
    const ids = Array.from({ length: 1001 }, (_, i) => `app-${i}`);
    prisma.application.findMany.mockResolvedValue(ids.map((id) => ({ id })));

    await expect(
      service.startBulk({ mode: 'SELECTED', applicationIds: ids }, 'company-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BulkScreeningService.getBatchProgress', () => {
  it('404s for batches owned by another company', async () => {
    const { prisma, service } = makeService();
    prisma.aiScreeningBatch.findFirst.mockResolvedValue(null);

    await expect(service.getBatchProgress('batch-1', 'company-9')).rejects.toThrow();
  });

  it('reaches COMPLETED once every item is terminal (skipped included)', async () => {
    const { prisma, service } = makeService();
    prisma.aiScreeningBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      companyId: 'company-1',
      mode: 'SELECTED',
      status: 'RUNNING',
      totalCount: 50,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
    });
    prisma.aiScreeningBatchItem.findMany.mockResolvedValue([
      ...Array.from({ length: 45 }, (_, i) => ({
        id: `item-${i}`,
        batchId: 'batch-1',
        applicationId: `a-${i}`,
        screeningId: `s-${i + 1}`,
        status: 'PENDING',
        action: 'QUEUED',
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `item-reused-${i}`,
        batchId: 'batch-1',
        applicationId: `a-reused-${i}`,
        screeningId: `s-${46 + i}`,
        status: 'PENDING',
        action: 'REUSED',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `item-skipped-${i}`,
        batchId: 'batch-1',
        applicationId: `a-skipped-${i}`,
        screeningId: null,
        status: 'SKIPPED',
        action: 'SKIPPED',
      })),
    ]);
    prisma.aiScreeningResult.findMany.mockResolvedValue(
      Array.from({ length: 48 }, (_, i) => ({
        id: `s-${i + 1}`,
        status: 'COMPLETED',
        recommendation: 'SHORTLIST',
      })),
    );

    const progress = await service.getBatchProgress('batch-1', 'company-1');
    expect(progress.completed).toBe(48);
    expect(progress.skipped).toBe(2);
    expect(progress.failed).toBe(0);
    expect(progress.pending).toBe(0);
    expect(progress.status).toBe('COMPLETED');
    expect(prisma.aiScreeningBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
      }),
    );
  });

  it('marks a batch with failures PARTIALLY_COMPLETED (never stuck RUNNING)', async () => {
    const { prisma, service } = makeService();
    prisma.aiScreeningBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      companyId: 'company-1',
      mode: 'SELECTED',
      status: 'RUNNING',
      totalCount: 4,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
    });
    prisma.aiScreeningBatchItem.findMany.mockResolvedValue([
      {
        id: 'i-1',
        batchId: 'batch-1',
        applicationId: 'a-1',
        screeningId: 's-1',
        status: 'PENDING',
        action: 'QUEUED',
      },
      {
        id: 'i-2',
        batchId: 'batch-1',
        applicationId: 'a-2',
        screeningId: 's-2',
        status: 'PENDING',
        action: 'QUEUED',
      },
      {
        id: 'i-3',
        batchId: 'batch-1',
        applicationId: 'a-3',
        screeningId: null,
        status: 'SKIPPED',
        action: 'SKIPPED',
      },
      {
        id: 'i-4',
        batchId: 'batch-1',
        applicationId: 'a-4',
        screeningId: 's-4',
        status: 'PENDING',
        action: 'QUEUED',
      },
    ]);
    prisma.aiScreeningResult.findMany.mockResolvedValue([
      { id: 's-1', status: 'COMPLETED', recommendation: 'SHORTLIST' },
      { id: 's-2', status: 'FAILED', recommendation: null },
      { id: 's-4', status: 'COMPLETED', recommendation: 'HUMAN_REVIEW' },
    ]);

    const progress = await service.getBatchProgress('batch-1', 'company-1');
    expect(progress.completed).toBe(2);
    expect(progress.failed).toBe(1);
    expect(progress.skipped).toBe(1);
    expect(progress.pending).toBe(0);
    expect(progress.status).toBe('PARTIALLY_COMPLETED');
  });
});
