import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { QueueService } from '@modules/queue/queue.service';
import {
  HealthCheckResult,
  LivenessResult,
  ReadinessResult,
  VersionResult,
  ServiceHealth,
  QueueHealth,
  MemoryHealth,
} from './interfaces/health.interface';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  private readonly timeoutMs: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {
    this.timeoutMs = this.configService.get<number>('app.healthCheckTimeoutMs') || 3000;
  }

  async check(): Promise<HealthCheckResult> {
    const [database, redis, queues, memory] = await Promise.all([
      this.withTimeout(this.checkDatabase(), {
        status: 'down' as const,
        latencyMs: this.timeoutMs,
      }),
      this.withTimeout(this.checkRedis(), {
        status: 'down' as const,
        latencyMs: this.timeoutMs,
      }),
      this.withTimeout(this.checkQueues(), {
        status: 'down' as const,
        details: { error: 'timed_out' },
      }),
      this.checkMemory(),
    ]);

    const anyDown = database.status === 'down' || redis.status === 'down';
    const allUp = database.status === 'up' && redis.status === 'up' && queues.status === 'up';

    let status: 'ok' | 'error' | 'degraded' = 'ok';
    if (anyDown) {
      status = 'error';
    } else if (!allUp) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: this.getUptimeSeconds(),
      version: this.configService.get<string>('app.version') || '1.0.0',
      environment: this.configService.get<string>('app.env') || 'development',
      checks: { database, redis, queues, memory },
    };
  }

  async liveness(): Promise<LivenessResult> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: this.getUptimeSeconds(),
    };
  }

  async readiness(): Promise<ReadinessResult> {
    const [database, redis, queues] = await Promise.all([
      this.withTimeout(this.checkDatabase(), {
        status: 'down' as const,
        latencyMs: this.timeoutMs,
      }),
      this.withTimeout(this.checkRedis(), {
        status: 'down' as const,
        latencyMs: this.timeoutMs,
      }),
      this.withTimeout(this.checkQueues(), {
        status: 'down' as const,
        details: { error: 'timed_out' },
      }),
    ]);

    const ready = database.status === 'up' && redis.status === 'up' && queues.status === 'up';

    return {
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: { database, redis, queues },
    };
  }

  async version(): Promise<VersionResult> {
    return {
      name: this.configService.get<string>('app.name') || 'TalentAI',
      version: this.configService.get<string>('app.version') || '1.0.0',
      apiVersion: this.configService.get<string>('app.apiVersion') || 'v1',
      environment: this.configService.get<string>('app.env') || 'development',
      nodeVersion: process.version,
      uptimeSeconds: this.getUptimeSeconds(),
    };
  }

  private async withTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(fallback), this.timeoutMs);
        }),
      ]);
    } catch {
      return fallback;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const result = await this.prismaService.isHealthy();
    return { status: result.healthy ? 'up' : 'down', latencyMs: result.latencyMs };
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const result = await this.redisService.isHealthy();
    return { status: result.healthy ? 'up' : 'down', latencyMs: result.latencyMs };
  }

  private async checkQueues(): Promise<QueueHealth> {
    try {
      const result = await this.queueService.isHealthy();
      return {
        status: result.healthy ? 'up' : 'down',
        details: result.details,
      };
    } catch {
      return { status: 'down', details: { error: 'Queue check failed' } };
    }
  }

  private checkMemory(): MemoryHealth {
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const externalMb = Math.round(mem.external / 1024 / 1024);

    let status: 'up' | 'down' = 'up';
    if (heapUsedMb > 1024) {
      status = 'down';
    }

    return { status, heapUsedMb, heapTotalMb, rssMb, externalMb };
  }

  private getUptimeSeconds(): number {
    return Math.round(((Date.now() - this.startTime) / 1000) * 100) / 100;
  }
}
