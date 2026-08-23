import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AiInterviewStatus, AiInterviewTranscriptStatus } from '@prisma/client';
import { AiInterviewsService } from './ai-interviews.service';

/**
 * Reconciles provider artifacts (transcript, recording, ended status) for
 * interviews whose webhooks may not have arrived (e.g. callback base URL not
 * publicly reachable, webhook dropped, duplicate safety).
 *
 * Candidates: interviews that have a provider conversation id and still miss
 * artifacts. Attempts are spaced by a cooldown and capped per cycle so the
 * Tavus API is not hammered.
 */
@Injectable()
export class TavusArtifactSyncService {
  private readonly logger = new Logger(TavusArtifactSyncService.name);
  private readonly cooldownMs: number;
  private readonly maxPerCycle: number;
  private readonly maxAgeHours: number;
  private readonly configService: ConfigService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiInterviewsService: AiInterviewsService,
    configService: ConfigService,
  ) {
    this.configService = configService;
    this.cooldownMs = configService.get<number>('tavus.artifactSyncCooldownMs') ?? 60_000;
    this.maxPerCycle = configService.get<number>('tavus.artifactSyncMaxPerCycle') ?? 5;
    this.maxAgeHours = configService.get<number>('tavus.artifactSyncMaxAgeHours') ?? 72;
  }

  async reconcile(): Promise<{ checked: number; synced: number; failed: number }> {
    const recording = this.configService.get<Record<string, unknown>>('tavus.recording') || {};
    const recordingEnabled = recording.enabled === true;
    const cutoff = new Date(Date.now() - this.maxAgeHours * 60 * 60 * 1000);
    const cooldownBoundary = new Date(Date.now() - this.cooldownMs);

    const artifactConditions: Array<Record<string, unknown>> = [
      {
        transcriptStatus: {
          in: [AiInterviewTranscriptStatus.NOT_REQUESTED, AiInterviewTranscriptStatus.PENDING],
        },
      },
    ];
    // Only chase recording when the provider is configured to record; otherwise
    // a missing recording is expected and must not trigger endless polling.
    if (recordingEnabled) {
      artifactConditions.push({ recordingStatus: null });
    }

    const candidates = await this.prisma.aiInterview.findMany({
      where: {
        provider: 'TAVUS',
        tavusConversationId: { not: null },
        updatedAt: { gt: cutoff },
        status: {
          in: [
            AiInterviewStatus.IN_PROGRESS,
            AiInterviewStatus.READY,
            AiInterviewStatus.ACCESSED,
            AiInterviewStatus.SENT,
            AiInterviewStatus.CREATED,
            AiInterviewStatus.COMPLETED,
          ],
        },
        OR: artifactConditions,
        AND: [
          {
            OR: [
              { artifactSyncAttemptedAt: null },
              { artifactSyncAttemptedAt: { lt: cooldownBoundary } },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: this.maxPerCycle,
    });

    let synced = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        await this.aiInterviewsService.syncInterviewArtifactsById(candidate.id);
        synced += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Artifact sync failed for ${candidate.id}: ${error}`);
      }
    }

    if (candidates.length > 0) {
      this.logger.log(
        `Artifact reconcile cycle: ${candidates.length} candidates, ${synced} synced, ${failed} failed`,
      );
    }
    return { checked: candidates.length, synced, failed };
  }
}