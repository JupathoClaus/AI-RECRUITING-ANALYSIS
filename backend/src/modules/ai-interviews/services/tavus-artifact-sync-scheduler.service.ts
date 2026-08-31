import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TavusArtifactSyncService } from './tavus-artifact-sync.service';

@Injectable()
export class TavusArtifactSyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TavusArtifactSyncScheduler.name);
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeTick: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly syncService: TavusArtifactSyncService,
    configService: ConfigService,
  ) {
    this.intervalMs = configService.get<number>('tavus.artifactSyncIntervalMs') ?? 120_000;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(`Starting Tavus artifact sync scheduler every ${this.intervalMs}ms`);
    await this.startTick();
    this.timer = setInterval(() => void this.startTick(), this.intervalMs);
  }

  onModuleDestroy(): void {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.log('Tavus artifact sync scheduler stopped');
  }

  private async startTick(): Promise<void> {
    if (this.stopping) return;
    if (this.activeTick) {
      this.logger.warn('Previous artifact sync cycle still running, skipping');
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
      const result = await this.syncService.reconcile();
      if (result.checked > 0) {
        this.logger.log(
          `Artifact sync cycle: ${result.checked} candidates, ${result.synced} synced, ${result.failed} failed`,
        );
      }
    } catch (err) {
      this.logger.error(`Artifact sync cycle failed: ${(err as Error).message}`);
    }
  }
}
