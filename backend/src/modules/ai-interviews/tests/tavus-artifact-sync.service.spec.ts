import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TavusArtifactSyncService } from '../services/tavus-artifact-sync.service';
import { AiInterviewsService } from '../services/ai-interviews.service';

describe('TavusArtifactSyncService', () => {
  let service: TavusArtifactSyncService;
  let prisma: any;
  let aiInterviewsService: jest.Mocked<Pick<AiInterviewsService, 'syncInterviewArtifactsById'>>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'tavus.artifactSyncCooldownMs': 60000,
        'tavus.artifactSyncMaxPerCycle': 5,
        'tavus.artifactSyncMaxAgeHours': 72,
        'tavus.recording': { enabled: true },
      };
      return config[key] ?? undefined;
    }),
  };

  const mockPrismaService = {
    aiInterview: {
      findMany: jest.fn(),
    },
  };

  const mockAiInterviewsService = {
    syncInterviewArtifactsById: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TavusArtifactSyncService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AiInterviewsService, useValue: mockAiInterviewsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(TavusArtifactSyncService);
    prisma = mockPrismaService;
    aiInterviewsService = module.get(AiInterviewsService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects only interviews that still miss artifacts and are within cooldown', async () => {
    prisma.aiInterview.findMany.mockResolvedValue([{ id: 'int-1' }, { id: 'int-2' }]);
    aiInterviewsService.syncInterviewArtifactsById.mockResolvedValue(undefined);

    const result = await service.reconcile();

    const where = prisma.aiInterview.findMany.mock.calls[0][0].where;
    expect(where.provider).toBe('TAVUS');
    expect(where.tavusConversationId).toEqual({ not: null });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { transcriptStatus: { in: ['NOT_REQUESTED', 'PENDING'] } },
        { recordingStatus: null },
      ]),
    );
    expect(where.AND).toHaveLength(1);
    expect(result).toEqual({ checked: 2, synced: 2, failed: 0 });
    expect(aiInterviewsService.syncInterviewArtifactsById).toHaveBeenCalledTimes(2);
  });

  it('counts failures without aborting the cycle', async () => {
    prisma.aiInterview.findMany.mockResolvedValue([{ id: 'int-1' }, { id: 'int-2' }]);
    aiInterviewsService.syncInterviewArtifactsById
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('provider down'));

    const result = await service.reconcile();

    expect(result).toEqual({ checked: 2, synced: 1, failed: 1 });
  });

  it('skips when there are no candidates', async () => {
    prisma.aiInterview.findMany.mockResolvedValue([]);

    const result = await service.reconcile();

    expect(result).toEqual({ checked: 0, synced: 0, failed: 0 });
    expect(aiInterviewsService.syncInterviewArtifactsById).not.toHaveBeenCalled();
  });

  it('does not chase recording when recording is disabled', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, any> = {
        'tavus.artifactSyncCooldownMs': 60000,
        'tavus.artifactSyncMaxPerCycle': 5,
        'tavus.artifactSyncMaxAgeHours': 72,
        'tavus.recording': { enabled: false },
      };
      return config[key] ?? undefined;
    });
    prisma.aiInterview.findMany.mockResolvedValue([]);

    await service.reconcile();

    const where = prisma.aiInterview.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { transcriptStatus: { in: ['NOT_REQUESTED', 'PENDING'] } },
    ]);
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, any> = {
        'tavus.artifactSyncCooldownMs': 60000,
        'tavus.artifactSyncMaxPerCycle': 5,
        'tavus.artifactSyncMaxAgeHours': 72,
        'tavus.recording': { enabled: true },
      };
      return config[key] ?? undefined;
    });
  });
});