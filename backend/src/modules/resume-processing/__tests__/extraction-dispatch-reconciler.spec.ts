import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { ExtractionDispatchReconcilerService } from '../services/extraction-dispatch-reconciler.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { ResumeFileReaderService } from '../services/resume-file-reader.service';
import { RESUME_EXTRACTION_QUEUE } from '../queue/resume-extraction-queue.constants';

describe('ExtractionDispatchReconcilerService — state matrix', () => {
  let service: ExtractionDispatchReconcilerService;
  let prisma: {
    extractionDispatch: { findUnique: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
    resumeTextExtraction: { findUnique: jest.Mock };
  };
  let queue: { getJob: jest.Mock; add: jest.Mock };

  const extractionId = 'extraction-1';

  function makeExtraction(status: string) {
    return { id: extractionId, storedFileId: 'file-1', companyId: 'company-1', status };
  }

  beforeEach(async () => {
    prisma = {
      extractionDispatch: {
        findUnique: jest.fn().mockResolvedValue({
          extractionId,
          dispatchStatus: 'PENDING_DISPATCH',
          dispatchAttempts: 0,
          nextAttemptAt: null,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      resumeTextExtraction: {
        findUnique: jest.fn().mockResolvedValue(makeExtraction('PENDING')),
      },
    };

    queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: extractionId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionDispatchReconcilerService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ResumeFileReaderService,
          useValue: { fileExists: jest.fn().mockResolvedValue(true) },
        },
        { provide: getQueueToken(RESUME_EXTRACTION_QUEUE), useValue: queue },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<ExtractionDispatchReconcilerService>(ExtractionDispatchReconcilerService);
  });

  function lastUpdateManyData() {
    const call = prisma.extractionDispatch.updateMany.mock.calls.at(-1);
    return call && call.length ? call[0].data : undefined;
  }

  describe('reconcile pending selection', () => {
    it('excludes terminal FAILED and COMPLETED extractions from re-dispatch', async () => {
      await service.reconcile();

      const where = prisma.extractionDispatch.findMany.mock.calls.at(-1)[0].where;
      expect(where.extraction.status.notIn).toEqual(['FAILED', 'COMPLETED']);
    });
  });

  describe('dispatchOne with terminal extraction', () => {
    it.each(['FAILED', 'COMPLETED'])(
      'marks DISPATCHED without enqueuing when extraction is %s',
      async (status) => {
        prisma.resumeTextExtraction.findUnique.mockResolvedValue(makeExtraction(status));

        await service.dispatchOne(extractionId);

        expect(queue.add).not.toHaveBeenCalled();
        expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
      },
    );

    it('never re-enqueues a failed BullMQ job for a terminal FAILED extraction', async () => {
      prisma.resumeTextExtraction.findUnique.mockResolvedValue(makeExtraction('FAILED'));
      queue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('failed'),
        remove: jest.fn(),
      });

      await service.dispatchOne(extractionId);

      expect(queue.getJob).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
    });
  });

  describe('dispatchOne with live generation', () => {
    it('re-enqueues after removing a failed job when extraction is PROCESSING', async () => {
      prisma.resumeTextExtraction.findUnique.mockResolvedValue(makeExtraction('PROCESSING'));
      const remove = jest.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('failed'),
        remove,
      });

      await service.dispatchOne(extractionId);

      expect(remove).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
    });

    it('marks DISPATCHED without re-adding when job is active', async () => {
      queue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('active'),
      });

      await service.dispatchOne(extractionId);

      expect(queue.add).not.toHaveBeenCalled();
      expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
    });
  });

  describe('reclaimStaleDispatching state matrix', () => {
    function staleDispatch() {
      return [
        {
          id: 'dispatch-1',
          extractionId,
          dispatchStatus: 'DISPATCHING',
          leaseStartedAt: new Date(Date.now() - 60_000),
          jobId: null,
        },
      ];
    }

    async function reclaimWith({
      jobState,
      extractionStatus,
    }: {
      jobState: 'waiting' | 'delayed' | 'active' | 'completed' | 'failed' | 'missing';
      extractionStatus: string | null;
    }) {
      prisma.extractionDispatch.findMany
        .mockResolvedValueOnce(staleDispatch())
        .mockResolvedValue([]);
      prisma.resumeTextExtraction.findUnique.mockResolvedValue(
        extractionStatus ? makeExtraction(extractionStatus) : null,
      );
      queue.getJob.mockResolvedValue(
        jobState === 'missing'
          ? null
          : {
              getState: jest.fn().mockResolvedValue(jobState),
              remove: jest.fn().mockResolvedValue(undefined),
            },
      );
      return service.reconcile();
    }

    it('failed job + FAILED extraction → DISPATCHED (no resurrection)', async () => {
      await reclaimWith({ jobState: 'failed', extractionStatus: 'FAILED' });
      const data = lastUpdateManyData();
      expect(data.dispatchStatus).toBe('DISPATCHED');
      expect(data.dispatchAttempts).toBeUndefined();
    });

    it('failed job + PROCESSING extraction → PENDING_DISPATCH with backoff (same generation retry)', async () => {
      await reclaimWith({ jobState: 'failed', extractionStatus: 'PROCESSING' });
      const data = lastUpdateManyData();
      expect(data.dispatchStatus).toBe('PENDING_DISPATCH');
      expect(data.dispatchAttempts).toEqual({ increment: 1 });
      expect(data.nextAttemptAt).toBeDefined();
    });

    it('missing job + COMPLETED extraction → DISPATCHED', async () => {
      await reclaimWith({ jobState: 'missing', extractionStatus: 'COMPLETED' });
      expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
    });

    it('missing job + PENDING extraction → PENDING_DISPATCH (retry dispatch)', async () => {
      await reclaimWith({ jobState: 'missing', extractionStatus: 'PENDING' });
      const data = lastUpdateManyData();
      expect(data.dispatchStatus).toBe('PENDING_DISPATCH');
      expect(data.dispatchAttempts).toEqual({ increment: 1 });
    });

    it('waiting job + any extraction → DISPATCHED (insertion observed)', async () => {
      await reclaimWith({ jobState: 'waiting', extractionStatus: 'PENDING' });
      expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
    });

    it('completed job → DISPATCHED', async () => {
      await reclaimWith({ jobState: 'completed', extractionStatus: 'COMPLETED' });
      expect(lastUpdateManyData().dispatchStatus).toBe('DISPATCHED');
    });
  });
});
