import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { IdempotencyService } from '../idempotency.service';
import { Prisma } from '@prisma/client';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IdempotencyService, PrismaService],
    }).compile();
    service = module.get<IdempotencyService>(IdempotencyService);
    prisma = module.get<PrismaService>(PrismaService);

    // Clean up any leftover test records
    await prisma.idempotencyKey.deleteMany({
      where: { companyId: { in: ['test-company', 'other-company'] } },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: { companyId: { in: ['test-company', 'other-company'] } },
    });
    await prisma.$disconnect();
  });

  const companyId = 'test-company';
  const userId = 'test-user';
  const otherUserId = 'other-user';
  const operation = 'TEST_OPERATION';
  const key = 'test-key-1';
  const requestHash = 'abc123hash';
  const otherHash = 'otherhash456';

  async function executeDummy(_tx: Prisma.TransactionClient) {
    return {
      resourceType: 'test-resource',
      resourceId: 'resource-1',
      responseJson: { data: 'test' },
    };
  }

  describe('executeTransactional', () => {
    it('creates a new idempotency record and returns COMPLETED on first call', async () => {
      const result = await service.executeTransactional({
        companyId,
        userId,
        operation,
        key,
        requestHash,
        execute: executeDummy,
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.resourceType).toBe('test-resource');
      expect(result.resourceId).toBe('resource-1');
      expect(result.responseJson).toEqual({ data: 'test' });

      const record = await prisma.idempotencyKey.findUnique({
        where: { key_companyId_userId_operation: { key, companyId, userId, operation } },
      });
      expect(record).not.toBeNull();
      expect(record!.status).toBe('COMPLETED');
      expect(record!.requestHash).toBe(requestHash);
      expect(record!.leaseToken).toBeNull();
      expect(record!.processingStartedAt).toBeNull();
    });

    it('returns the same response on replay with the same key and hash', async () => {
      const result = await service.executeTransactional({
        companyId,
        userId,
        operation,
        key,
        requestHash,
        execute: async () => {
          throw new Error('Should not execute again');
        },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.resourceId).toBe('resource-1');
    });

    it('rejects a different request hash with the same key', async () => {
      await expect(
        service.executeTransactional({
          companyId,
          userId,
          operation,
          key,
          requestHash: otherHash,
          execute: async () => {
            throw new Error('Should not execute');
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a different userId with the same key (separate idempotency scope)', async () => {
      const result = await service.executeTransactional({
        companyId,
        userId: otherUserId,
        operation,
        key,
        requestHash,
        execute: async () => {
          return { resourceType: 'test', resourceId: 'other', responseJson: null };
        },
      });
      expect(result.status).toBe('COMPLETED');
      expect(result.resourceId).toBe('other');

      const created = await prisma.idempotencyKey.findUnique({
        where: {
          key_companyId_userId_operation: { key, companyId, userId: otherUserId, operation },
        },
      });
      expect(created).not.toBeNull();
    });

    it('recovers a FAILED record and re-executes', async () => {
      const failKey = 'test-key-fail-recover';

      const failed = await prisma.idempotencyKey.create({
        data: {
          key: failKey,
          companyId,
          userId,
          operation,
          requestHash,
          status: 'FAILED',
          resourceType: '',
          resourceId: '',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const result = await service.executeTransactional({
        companyId,
        userId,
        operation,
        key: failKey,
        requestHash,
        execute: async (tx) => {
          return {
            resourceType: 'recovered',
            resourceId: 'recovered-1',
            responseJson: { recovered: true },
          };
        },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.resourceId).toBe('recovered-1');

      const record = await prisma.idempotencyKey.findUnique({
        where: { id: failed.id },
      });
      expect(record!.status).toBe('COMPLETED');
    });

    it('rolls back the business write if the executor throws', async () => {
      const rollbackKey = 'test-key-rollback';

      // Create a dummy table to test rollback
      const testRecord = await prisma.idempotencyKey.create({
        data: {
          key: 'rollback-marker',
          companyId,
          userId,
          operation: 'ROLLBACK_TEST',
          requestHash: 'marker',
          status: 'COMPLETED',
          resourceType: 'marker',
          resourceId: 'marker',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      try {
        await service.executeTransactional({
          companyId,
          userId,
          operation,
          key: rollbackKey,
          requestHash,
          execute: async (tx) => {
            // Delete the marker inside the transaction
            await tx.idempotencyKey.delete({ where: { id: testRecord.id } });
            // Then throw - both the delete AND the idempotency record should roll back
            throw new Error('Business logic failure');
          },
        });
      } catch {
        // Expected
      }

      // The marker should still exist (rolled back)
      const marker = await prisma.idempotencyKey.findUnique({ where: { id: testRecord.id } });
      expect(marker).not.toBeNull();

      // The idempotency key should not exist (rolled back)
      const record = await prisma.idempotencyKey.findUnique({
        where: {
          key_companyId_userId_operation: { key: rollbackKey, companyId, userId, operation },
        },
      });
      expect(record).toBeNull();
    });

    it('single-owner FAILED recovery: exactly one execution, both callers converge on one result', async () => {
      const concurrentKey = 'test-key-concurrent-fail';

      // Create a FAILED record
      await prisma.idempotencyKey.create({
        data: {
          key: concurrentKey,
          companyId,
          userId,
          operation,
          requestHash,
          status: 'FAILED',
          resourceType: '',
          resourceId: '',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      let executionCount = 0;

      // Run two concurrent claims
      const results = await Promise.allSettled([
        service.executeTransactional({
          companyId,
          userId,
          operation,
          key: concurrentKey,
          requestHash,
          execute: async () => {
            executionCount++;
            await new Promise((r) => setTimeout(r, 100));
            return {
              resourceType: 'concurrent',
              resourceId: 'concurrent-1',
              responseJson: { count: executionCount },
            };
          },
        }),
        service.executeTransactional({
          companyId,
          userId,
          operation,
          key: concurrentKey,
          requestHash,
          execute: async () => {
            executionCount++;
            await new Promise((r) => setTimeout(r, 100));
            return {
              resourceType: 'concurrent',
              resourceId: 'concurrent-2',
              responseJson: { count: executionCount },
            };
          },
        }),
      ]);

      // The business executor must have run exactly once, never twice.
      expect(executionCount).toBe(1);

      // Both callers legitimately return COMPLETED: the owner executes and
      // the competitor replays the committed result after the serialization
      // conflict. Every fulfilled result must reference the SAME resource.
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(2);
      const completedResults = fulfilled.map((r) => r.value);
      for (const result of completedResults) {
        // PROCESSING is only acceptable while the owner is still running;
        // here both calls were awaited to settle, so both must be COMPLETED.
        expect(result.status).toBe('COMPLETED');
        expect(result.responseJson).toEqual({ count: 1 });
      }
      // Both callers identify the SAME business resource — whichever caller
      // won the single-owner claim may own it; a second resource never exists.
      const ownerResourceId = completedResults[0].resourceId;
      for (const result of completedResults) {
        expect(result.resourceId).toBe(ownerResourceId);
      }

      // Exactly one idempotency record exists for the complete scope.
      const records = await prisma.idempotencyKey.findMany({
        where: { key: concurrentKey, companyId, userId, operation },
      });
      expect(records.length).toBe(1);
      expect(records[0].status).toBe('COMPLETED');
      expect(records[0].resourceId).toBe(ownerResourceId);

      // A subsequent replay returns the owner response.
      const replay = await service.executeTransactional({
        companyId,
        userId,
        operation,
        key: concurrentKey,
        requestHash,
        execute: async () => {
          executionCount++;
          return { resourceType: 'concurrent', resourceId: 'should-not-run', responseJson: {} };
        },
      });
      expect(replay.status).toBe('COMPLETED');
      expect(replay.resourceId).toBe(ownerResourceId);
      expect(replay.responseJson).toEqual({ count: 1 });
      expect(executionCount).toBe(1);

      // No second business resource was ever created.
      const allConcurrentResources = await prisma.idempotencyKey.findMany({
        where: { companyId, userId, operation, resourceId: { startsWith: 'concurrent-' } },
        select: { resourceId: true },
      });
      expect(allConcurrentResources.map((r) => r.resourceId)).toEqual([ownerResourceId]);
    }, 30000);

    it('FAILED recovery stays single-owner across repeated concurrent runs', async () => {
      // Repeat enough times to expose scheduling nondeterminism.
      for (let round = 0; round < 25; round++) {
        const concurrentKey = `test-key-concurrent-fail-round-${round}`;
        await prisma.idempotencyKey.create({
          data: {
            key: concurrentKey,
            companyId,
            userId,
            operation,
            requestHash,
            status: 'FAILED',
            resourceType: '',
            resourceId: '',
            expiresAt: new Date(Date.now() + 86400000),
          },
        });

        let executionCount = 0;
        const results = await Promise.allSettled([
          service.executeTransactional({
            companyId,
            userId,
            operation,
            key: concurrentKey,
            requestHash,
            execute: async () => {
              executionCount++;
              await new Promise((r) => setTimeout(r, 100));
              return {
                resourceType: 'concurrent',
                resourceId: `round-${round}-1`,
                responseJson: { count: executionCount },
              };
            },
          }),
          service.executeTransactional({
            companyId,
            userId,
            operation,
            key: concurrentKey,
            requestHash,
            execute: async () => {
              executionCount++;
              await new Promise((r) => setTimeout(r, 100));
              return {
                resourceType: 'concurrent',
                resourceId: `round-${round}-2`,
                responseJson: { count: executionCount },
              };
            },
          }),
        ]);

        expect(executionCount).toBe(1);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        expect(fulfilled.length).toBe(2);
        // Both callers converge on ONE shared business resource — either caller
        // may own the claim, so only the shared identity is asserted, never
        // a specific owner.
        const resourceIds = [...new Set(fulfilled.map((r) => r.value.resourceId))];
        expect(resourceIds.length).toBe(1);

        const records = await prisma.idempotencyKey.findMany({
          where: { key: concurrentKey, companyId, userId, operation },
        });
        expect(records.length).toBe(1);
        expect(records[0].status).toBe('COMPLETED');
        expect(records[0].resourceId).toBe(resourceIds[0]);
      }
    }, 120000);

    it('fresh-key concurrent insert: P2002 competitors converge, executor runs once', async () => {
      // Six callers racing to claim a brand-new key. Only one may insert the
      // claim row; the rest hit the unique constraint (P2002) and must
      // converge on the committed result instead of erroring.
      const concurrentKey = `test-key-fresh-insert-${Date.now()}`;
      let executionCount = 0;

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          service.executeTransactional({
            companyId,
            userId,
            operation,
            key: concurrentKey,
            requestHash,
            execute: async () => {
              executionCount++;
              await new Promise((r) => setTimeout(r, 150));
              return {
                resourceType: 'fresh',
                resourceId: `fresh-${i}`,
                responseJson: { count: executionCount },
              };
            },
          }),
        ),
      );

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(0);
      expect(executionCount).toBe(1);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(6);
      const resourceIds = [...new Set(fulfilled.map((r) => r.value.resourceId))];
      expect(resourceIds.length).toBe(1);

      const records = await prisma.idempotencyKey.findMany({
        where: { key: concurrentKey, companyId, userId, operation },
      });
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('COMPLETED');
    }, 30000);
  });

  describe('getRecord', () => {
    it('returns the record for the given key, company, user, and operation', async () => {
      const record = await service.getRecord(key, companyId, userId, operation);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('COMPLETED');
      expect(record!.resourceType).toBe('test-resource');
    });

    it('returns null for non-existent key', async () => {
      const record = await service.getRecord('non-existent', companyId, userId, operation);
      expect(record).toBeNull();
    });

    it('returns record scoped to user, company, key, and operation', async () => {
      const record = await service.getRecord(key, companyId, userId, operation);
      expect(record).not.toBeNull();
      expect(record!.resourceId).toBe('resource-1');

      const otherRecord = await service.getRecord(key, companyId, otherUserId, operation);
      expect(otherRecord).not.toBeNull();
      expect(otherRecord!.resourceId).toBe('other');
    });
  });

  describe('expired COMPLETED records', () => {
    it('reclaims expired COMPLETED records and allows re-execution', async () => {
      const expiredKey = 'test-key-expired';

      // Create an expired COMPLETED record
      await prisma.idempotencyKey.create({
        data: {
          key: expiredKey,
          companyId,
          userId,
          operation,
          requestHash,
          status: 'COMPLETED',
          resourceType: 'old',
          resourceId: 'old-resource',
          responseJson: { old: true },
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const result = await service.executeTransactional({
        companyId,
        userId,
        operation,
        key: expiredKey,
        requestHash,
        execute: async () => {
          return { resourceType: 'new', resourceId: 'new-resource', responseJson: { new: true } };
        },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.resourceId).toBe('new-resource');
    });
  });
});
