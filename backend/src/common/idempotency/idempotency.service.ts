import { Injectable, Logger, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma, IdempotencyStatus } from '@prisma/client';
import * as crypto from 'crypto';

export interface IdempotencyClaim<T> {
  status: 'COMPLETED' | 'PROCESSING';
  resourceType: string;
  resourceId: string;
  responseJson?: T;
}

export interface IdempotencyExecutorResult {
  resourceType: string;
  resourceId: string;
  responseJson?: unknown;
}

export interface ExecuteTransactionalParams<T> {
  companyId: string;
  userId: string;
  operation: string;
  key: string;
  requestHash: string;
  ttlMs?: number;
  leaseTtlMs?: number;
  execute: (tx: Prisma.TransactionClient) => Promise<IdempotencyExecutorResult>;
}

const DEFAULT_TTL_MS = 86_400_000;
const DEFAULT_LEASE_TTL_MS = 30_000;
const MAX_SERIALIZATION_RETRIES = 3;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  private uniqueWhere(params: {
    key: string;
    companyId: string;
    userId: string;
    operation: string;
  }): Prisma.IdempotencyKeyWhereUniqueInput {
    return {
      key_companyId_userId_operation: {
        key: params.key,
        companyId: params.companyId,
        userId: params.userId,
        operation: params.operation,
      },
    };
  }

  private async checkHashOrThrow(
    existing: { requestHash: string | null },
    requestHash: string,
  ): Promise<void> {
    if (existing.requestHash && existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        message: 'Idempotency key was used with a different request payload.',
      });
    }
  }

  async executeTransactional<T>(
    params: ExecuteTransactionalParams<T>,
  ): Promise<IdempotencyClaim<T>> {
    const {
      companyId,
      userId,
      operation,
      key,
      requestHash,
      ttlMs = DEFAULT_TTL_MS,
      leaseTtlMs = DEFAULT_LEASE_TTL_MS,
      execute,
    } = params;

    const uniqueWhere = this.uniqueWhere({ key, companyId, userId, operation });
    const expiresAt = new Date(Date.now() + ttlMs);
    const leaseToken = crypto.randomUUID();

    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.idempotencyKey.findUnique({
              where: uniqueWhere,
            });

            if (existing) {
              if (existing.status === 'COMPLETED') {
                await this.checkHashOrThrow(existing, requestHash);

                if (existing.expiresAt < new Date()) {
                  const reclaimed = await tx.idempotencyKey.updateMany({
                    where: {
                      id: existing.id,
                      status: 'COMPLETED',
                      leaseToken: existing.leaseToken ?? null,
                    },
                    data: {
                      status: 'PROCESSING',
                      leaseToken,
                      processingStartedAt: new Date(),
                      requestHash,
                      responseJson: Prisma.DbNull,
                      resourceType: '',
                      resourceId: '',
                    },
                  });
                  if (reclaimed.count === 1) {
                    return this.executeAndComplete(
                      tx,
                      key,
                      companyId,
                      userId,
                      operation,
                      leaseToken,
                      execute,
                    );
                  }
                  const updated = await tx.idempotencyKey.findUnique({
                    where: { id: existing.id },
                  });
                  if (updated?.status === 'COMPLETED') {
                    return {
                      status: 'COMPLETED' as const,
                      resourceType: updated.resourceType,
                      resourceId: updated.resourceId,
                      responseJson: updated.responseJson as T,
                    };
                  }
                  return {
                    status: 'PROCESSING' as const,
                    resourceType: updated?.resourceType ?? '',
                    resourceId: updated?.resourceId ?? '',
                  };
                }
                return {
                  status: 'COMPLETED' as const,
                  resourceType: existing.resourceType,
                  resourceId: existing.resourceId,
                  responseJson: existing.responseJson as T,
                };
              }

              if (existing.status === 'PROCESSING') {
                const leaseActive =
                  existing.leaseToken &&
                  existing.processingStartedAt &&
                  Date.now() - existing.processingStartedAt.getTime() < leaseTtlMs;

                if (leaseActive) {
                  await this.checkHashOrThrow(existing, requestHash);
                  return {
                    status: 'PROCESSING' as const,
                    resourceType: existing.resourceType,
                    resourceId: existing.resourceId,
                  };
                }

                await this.checkHashOrThrow(existing, requestHash);

                const renewed = await tx.idempotencyKey.updateMany({
                  where: {
                    id: existing.id,
                    status: 'PROCESSING',
                    leaseToken: existing.leaseToken,
                  },
                  data: {
                    leaseToken,
                    processingStartedAt: new Date(),
                    requestHash,
                  },
                });

                if (renewed.count === 1) {
                  return this.executeAndComplete(
                    tx,
                    key,
                    companyId,
                    userId,
                    operation,
                    leaseToken,
                    execute,
                  );
                }

                const afterRenew = await tx.idempotencyKey.findUnique({
                  where: { id: existing.id },
                });
                if (afterRenew?.status === 'COMPLETED') {
                  return {
                    status: 'COMPLETED' as const,
                    resourceType: afterRenew.resourceType,
                    resourceId: afterRenew.resourceId,
                    responseJson: afterRenew.responseJson as T,
                  };
                }

                return {
                  status: 'PROCESSING' as const,
                  resourceType: existing.resourceType,
                  resourceId: existing.resourceId,
                };
              }

              if (existing.status === 'FAILED') {
                await this.checkHashOrThrow(existing, requestHash);

                const acquired = await tx.idempotencyKey.updateMany({
                  where: {
                    id: existing.id,
                    status: 'FAILED',
                    leaseToken: null,
                  },
                  data: {
                    status: 'PROCESSING',
                    leaseToken,
                    processingStartedAt: new Date(),
                    requestHash,
                  },
                });

                if (acquired.count === 0) {
                  const owned = await tx.idempotencyKey.findUnique({
                    where: { id: existing.id },
                    select: {
                      status: true,
                      resourceType: true,
                      resourceId: true,
                      responseJson: true,
                    },
                  });
                  if (owned?.status === 'COMPLETED') {
                    return {
                      status: 'COMPLETED' as const,
                      resourceType: owned.resourceType,
                      resourceId: owned.resourceId,
                      responseJson: owned.responseJson as T,
                    };
                  }
                  return {
                    status: 'PROCESSING' as const,
                    resourceType: existing.resourceType,
                    resourceId: existing.resourceId,
                  };
                }

                return this.executeAndComplete(
                  tx,
                  key,
                  companyId,
                  userId,
                  operation,
                  leaseToken,
                  execute,
                );
              }
            }

            await tx.idempotencyKey.create({
              data: {
                key,
                companyId,
                userId,
                operation,
                requestHash,
                status: 'PROCESSING',
                leaseToken,
                processingStartedAt: new Date(),
                resourceType: '',
                resourceId: '',
                expiresAt,
              },
            });

            return this.executeAndComplete(
              tx,
              key,
              companyId,
              userId,
              operation,
              leaseToken,
              execute,
            );
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 15000,
          },
        );
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2034' && attempt < MAX_SERIALIZATION_RETRIES - 1) {
          this.logger.warn(
            `Serialization conflict (P2034) on idempotency attempt ${attempt + 1}/${MAX_SERIALIZATION_RETRIES}, retrying`,
          );
          continue;
        }
        if (prismaErr.code === 'P2034') {
          throw new ServiceUnavailableException({
            code: 'IDEMPOTENCY_CONCURRENCY_EXHAUSTED',
            message: 'Could not acquire idempotency lock due to concurrent access.',
          });
        }
        // Concurrent request inserted the same key first (unique violation on
        // the claim row). Re-read: the owner has either completed or is still
        // processing, so we can converge instead of surfacing an error.
        if (prismaErr.code === 'P2002') {
          const existing = await this.prisma.idempotencyKey.findUnique({
            where: uniqueWhere,
            select: {
              status: true,
              requestHash: true,
              resourceType: true,
              resourceId: true,
              responseJson: true,
            },
          });
          if (existing && existing.status === 'COMPLETED') {
            await this.checkHashOrThrow(existing, requestHash);
            return {
              status: 'COMPLETED' as const,
              resourceType: existing.resourceType,
              resourceId: existing.resourceId,
              responseJson: existing.responseJson as T,
            };
          }
          if (existing) {
            return {
              status: 'PROCESSING' as const,
              resourceType: existing.resourceType,
              resourceId: existing.resourceId,
            };
          }
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException({
      code: 'IDEMPOTENCY_CONCURRENCY_EXHAUSTED',
      message: 'Could not acquire idempotency lock due to concurrent access.',
    });
  }

  private async executeAndComplete<T>(
    tx: Prisma.TransactionClient,
    key: string,
    companyId: string,
    userId: string,
    operation: string,
    leaseToken: string,
    execute: (tx: Prisma.TransactionClient) => Promise<IdempotencyExecutorResult>,
  ): Promise<IdempotencyClaim<T>> {
    try {
      const result = await execute(tx);

      const updateResult = await tx.idempotencyKey.updateMany({
        where: {
          key,
          companyId,
          userId,
          operation,
          status: 'PROCESSING',
          leaseToken,
        },
        data: {
          status: 'COMPLETED',
          leaseToken: null,
          processingStartedAt: null,
          resourceType: result.resourceType,
          resourceId: result.resourceId,
          responseJson: result.responseJson ?? Prisma.DbNull,
        },
      });

      if (updateResult.count !== 1) {
        throw new ServiceUnavailableException({
          code: 'IDEMPOTENCY_OWNERSHIP_LOST',
          message: 'Idempotency ownership was lost before completion could be persisted.',
        });
      }

      return {
        status: 'COMPLETED' as const,
        resourceType: result.resourceType,
        resourceId: result.resourceId,
        responseJson: result.responseJson as T,
      };
    } catch (err) {
      await tx.idempotencyKey.updateMany({
        where: {
          key,
          companyId,
          userId,
          operation,
          status: 'PROCESSING',
          leaseToken,
        },
        data: {
          status: 'FAILED',
          leaseToken: null,
        },
      });
      throw err;
    }
  }

  async getRecord(
    key: string,
    companyId: string,
    userId: string,
    operation: string,
  ): Promise<{
    status: IdempotencyStatus;
    resourceType: string;
    resourceId: string;
    responseJson: unknown;
  } | null> {
    const record = await this.prisma.idempotencyKey.findUnique({
      where: this.uniqueWhere({ key, companyId, userId, operation }),
    });
    if (!record) return null;
    return {
      status: record.status,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      responseJson: record.responseJson,
    };
  }
}
