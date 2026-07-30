import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionDispatchReconcilerService } from './extraction-dispatch-reconciler.service';

@Injectable()
export class ExtractionDispatchReconcilerScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExtractionDispatchReconcilerScheduler.name);
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeTick: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly reconciler: ExtractionDispatchReconcilerService,
    configService: ConfigService,
  ) {
    this.intervalMs = configService.get<number>('reconciler.pollIntervalMs') ?? 15_000;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(`Starting reconciler scheduler every ${this.intervalMs}ms`);
    await this.startTick();
    this.timer = setInterval(() => void this.startTick(), this.intervalMs);
  }

  onModuleDestroy(): void {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.log('Reconciler scheduler stopped');
  }

  private async startTick(): Promise<void> {
    if (this.stopping) return;
    if (this.activeTick) {
      this.logger.warn('Previous reconcile cycle still running, skipping');
      return;
    }
    this.activeTick = this.tick();
    try {
      await this.activeTick;
    } finally {
      this.activeTick = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.reconciler.reconcile();
      if (result.reclaimed > 0 || result.dispatched > 0 || result.failed > 0) {
        this.logger.log(
          `Reconcile cycle: ${result.reclaimed} reclaimed, ${result.dispatched} dispatched, ${result.failed} failed`,
        );
      }
    } catch (err) {
      this.logger.error(`Reconcile cycle failed: ${(err as Error).message}`);
    }
  }
}
