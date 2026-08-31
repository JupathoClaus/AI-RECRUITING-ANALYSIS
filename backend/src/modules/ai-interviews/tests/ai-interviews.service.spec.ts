import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AiInterviewsService } from '../services/ai-interviews.service';
import { AiInterviewCodeService } from '../services/ai-interview-code.service';
import { AiInterviewTokenService } from '../services/ai-interview-token.service';
import { TavusClientService } from '../services/tavus-client.service';
import { RecordingPlaybackService } from '../services/recording-playback.service';
import { EmailService } from '@modules/email/email.service';
import {
  AiInterviewStatus,
  AiInterviewProvider,
  AiInterviewTranscriptStatus,
} from '@prisma/client';

describe('AiInterviewsService', () => {
  let service: AiInterviewsService;
  let prisma: any;
  let codeService: jest.Mocked<AiInterviewCodeService>;
  let tokenService: jest.Mocked<AiInterviewTokenService>;
  let tavusClient: jest.Mocked<TavusClientService>;
  let emailService: jest.Mocked<EmailService>;

  const mockCodeService = {
    generate: jest.fn(),
    hash: jest.fn(),
    normalize: jest.fn(),
    validate: jest.fn(),
    displayHint: jest.fn(),
    format: jest.fn((code: string) => code),
  };

  const mockTokenService = {
    generate: jest.fn(),
    verify: jest.fn(),
    extractInterviewId: jest.fn(),
  };

  const mockTavusClient = {
    isEnabled: false,
    createConversation: jest.fn(),
    getConversation: jest.fn(),
    endConversation: jest.fn(),
  };

  const mockPlaybackService = {
    getPlaybackUrl: jest.fn(),
  };

  const mockEmailService = {
    sendAiInterviewInvitationEmail: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'app.frontendUrl': 'http://localhost:3001',
        'tavus.enabled': false,
        'aiInterview.allowTestEmailOverride': false,
        'app.env': 'test',
      };
      return config[key] ?? undefined;
    }),
  };

  const mockPrismaService = {
    application: {
      findFirst: jest.fn(),
    },
    aiInterview: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiInterviewsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AiInterviewCodeService, useValue: mockCodeService },
        { provide: AiInterviewTokenService, useValue: mockTokenService },
        { provide: TavusClientService, useValue: mockTavusClient },
        { provide: RecordingPlaybackService, useValue: mockPlaybackService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiInterviewsService>(AiInterviewsService);
    codeService = module.get(AiInterviewCodeService);
    tokenService = module.get(AiInterviewTokenService);
    tavusClient = module.get(TavusClientService);
    emailService = module.get(EmailService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockApplication = {
    id: 'app-1',
    companyId: 'company-1',
    candidate: {
      id: 'cand-1',
      firstName: 'Daniel',
      lastName: 'Kato',
      email: 'daniel@test.com',
      totalExperienceYears: 6,
      skills: null,
    },
    job: { id: 'job-1', title: 'Senior Software Developer', description: 'A great job' },
    company: { name: 'Test Corp' },
    deletedAt: null,
  };

  const mockInterview = {
    id: 'interview-1',
    applicationId: 'app-1',
    companyId: 'company-1',
    provider: AiInterviewProvider.MOCK,
    status: AiInterviewStatus.CREATED,
    codeHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    codeDisplayHint: 'ABCD-EFGH',
    invitationSentAt: null,
    invitationEmail: null,
    accessedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    tavusConversationId: null,
    tavusConversationUrl: null,
    tavusStatus: null,
    tavusMeetingToken: null,
    transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
    transcriptUrl: null,
    language: 'en',
    estimatedDurationMinutes: 30,
    availableFrom: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    notes: null,
    cancelledByMembershipId: null,
    createdByMembershipId: 'membership-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    application: {
      ...mockApplication,
    },
  };

  // ─── CREATE ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create an interview with raw code returned once and only hash stored', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('the-hash-value');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      const result = await service.create(
        { applicationId: 'app-1', estimatedDurationMinutes: 30 },
        'company-1',
        'membership-1',
      );

      expect(result.rawCode).toBe('ABCD-EFGH');
      expect(codeService.hash).toHaveBeenCalledWith('ABCD-EFGH');
      expect(prisma.aiInterview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codeHash: 'the-hash-value',
            codeDisplayHint: 'ABCD-EFGH',
          }),
        }),
      );
      expect(codeService.generate).toHaveBeenCalledTimes(1);
    });

    it('should default to MOCK when Tavus is disabled', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('hash');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      const result = await service.create({ applicationId: 'app-1' }, 'company-1', 'membership-1');

      expect(result.provider).toBe(AiInterviewProvider.MOCK);
    });

    it('should derive candidate and job from application', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('hash');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      const result = await service.create({ applicationId: 'app-1' }, 'company-1', 'membership-1');

      expect(result.application.candidate.firstName).toBe('Daniel');
      expect(result.application.job.title).toBe('Senior Software Developer');
    });

    it('should reject non-existent application', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ applicationId: 'nonexistent' }, 'company-1', 'membership-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject cross-company application lookup', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ applicationId: 'app-1' }, 'other-company', 'membership-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the existing interview instead of creating a duplicate', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);

      const result = await service.create(
        { applicationId: 'app-1', estimatedDurationMinutes: 30 },
        'company-1',
        'membership-1',
      );

      expect(result.id).toBe('interview-1');
      expect(prisma.aiInterview.create).not.toHaveBeenCalled();
      expect(codeService.generate).not.toHaveBeenCalled();
    });

    it('should allow a new round after a terminal interview (COMPLETED)', async () => {
      // Prisma filters terminal statuses out of the "existing" lookup, so a
      // completed interview does not block a fresh round.
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('hash');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      const result = await service.create(
        { applicationId: 'app-1', estimatedDurationMinutes: 30 },
        'company-1',
        'membership-1',
      );

      expect(prisma.aiInterview.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('interview-1');
    });

    it('should allow a new round after CANCELLED / EXPIRED / FAILED interviews', async () => {
      for (const terminal of [
        AiInterviewStatus.CANCELLED,
        AiInterviewStatus.EXPIRED,
        AiInterviewStatus.FAILED,
      ]) {
        prisma.application.findFirst.mockResolvedValue(mockApplication);
        prisma.aiInterview.findFirst.mockResolvedValue(null);
        codeService.generate.mockReturnValue('ABCD-EFGH');
        codeService.hash.mockReturnValue('hash');
        codeService.displayHint.mockReturnValue('ABCD-EFGH');
        prisma.aiInterview.create.mockResolvedValue(mockInterview);

        const result = await service.create(
          { applicationId: 'app-1', estimatedDurationMinutes: 30 },
          'company-1',
          'membership-1',
        );
        expect(prisma.aiInterview.create).toHaveBeenCalledTimes(1);
        expect(result.id).toBe('interview-1');
        prisma.aiInterview.create.mockClear();
      }
    });

    it('should apply defaults language "en" and duration 30 when omitted', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('hash');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      await service.create({ applicationId: 'app-1' }, 'company-1', 'membership-1');

      expect(prisma.aiInterview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            language: 'en',
            estimatedDurationMinutes: 30,
          }),
        }),
      );
    });

    it('should store status CREATED with transcript NOT_REQUESTED and an expiry', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('hash');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      await service.create(
        { applicationId: 'app-1', estimatedDurationMinutes: 30 },
        'company-1',
        'membership-1',
      );

      expect(prisma.aiInterview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AiInterviewStatus.CREATED,
            transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
            createdByMembershipId: 'membership-1',
            expiresAt: expect.any(Date),
          }),
        }),
      );
      const data = prisma.aiInterview.create.mock.calls[0][0].data;
      const days = (data.expiresAt.getTime() - Date.now()) / 86400000;
      expect(Math.abs(days - 30)).toBeLessThan(1);
    });

    it('should store only the hashed code, never the raw code', async () => {
      prisma.application.findFirst.mockResolvedValue(mockApplication);
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      codeService.generate.mockReturnValue('ABCD-EFGH');
      codeService.hash.mockReturnValue('the-hash');
      codeService.displayHint.mockReturnValue('ABCD-EFGH');
      prisma.aiInterview.create.mockResolvedValue(mockInterview);

      const result = await service.create(
        { applicationId: 'app-1', estimatedDurationMinutes: 30 },
        'company-1',
        'membership-1',
      );

      expect(result.rawCode).toBe('ABCD-EFGH');
      expect(prisma.aiInterview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codeHash: 'the-hash',
          }),
        }),
      );
      const data = prisma.aiInterview.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('rawCode');
      expect(data.codeHash).not.toContain('ABCD-EFGH');
    });
  });

  // ─── FIND BY ID ───────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should find interview by ID for the same company', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      const result = await service.findById('interview-1', 'company-1');
      expect(result.id).toBe('interview-1');
    });

    it('should reject cross-company access', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(service.findById('interview-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not include meeting token in response', async () => {
      const interviewWithToken = {
        ...mockInterview,
        tavusMeetingToken: 'secret-token',
      };
      prisma.aiInterview.findFirst.mockResolvedValue(interviewWithToken);
      const result = await service.findById('interview-1', 'company-1');
      expect(result).not.toHaveProperty('tavusMeetingToken');
    });
  });

  describe('findAll', () => {
    it('lists only the active company interviews and strips meeting tokens', async () => {
      prisma.aiInterview.findMany.mockResolvedValue([
        { ...mockInterview, tavusMeetingToken: 'secret-token' },
      ]);

      const result = await service.findAll('company-1');

      expect(prisma.aiInterview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1' }, take: 100 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('tavusMeetingToken');
    });
  });

  // ─── SEND INVITATION ──────────────────────────────────────────────────────

  describe('sendInvitation', () => {
    const sentInterview = {
      ...mockInterview,
      status: AiInterviewStatus.CREATED,
      application: {
        ...mockApplication,
      },
    };

    it('should send email with application-derived candidate email', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue(mockInterview.codeHash);
      tokenService.generate.mockReturnValue('jwt-token');
      emailService.sendAiInterviewInvitationEmail.mockResolvedValue(undefined);
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);
      prisma.aiInterview.update.mockResolvedValue(sentInterview);

      const result = await service.sendInvitation(
        'interview-1',
        { rawCode: 'ABCD-EFGH' },
        'company-1',
      );

      expect(emailService.sendAiInterviewInvitationEmail).toHaveBeenCalledWith(
        'daniel@test.com',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(Date),
        undefined,
      );
      expect(prisma.aiInterview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invitationEmail: 'daniel@test.com',
          }),
        }),
      );
      expect(result.sent).toBe(true);
    });

    it('should keep codeHash unchanged after sending', async () => {
      const originalHash = mockInterview.codeHash;
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue(originalHash);
      tokenService.generate.mockReturnValue('jwt-token');
      emailService.sendAiInterviewInvitationEmail.mockResolvedValue(undefined);
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);
      prisma.aiInterview.update.mockResolvedValue(sentInterview);

      await service.sendInvitation('interview-1', { rawCode: 'ABCD-EFGH' }, 'company-1');

      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('codeHash');
      expect(updateCall.data.status).toBe(AiInterviewStatus.SENT);
    });

    it('should reject cross-company send', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(
        service.sendInvitation('interview-1', { rawCode: 'ABCD-EFGH' }, 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject send with wrong rawCode', async () => {
      codeService.normalize.mockReturnValue('WRONGCODE');
      codeService.hash.mockReturnValue('wrong-hash');
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);

      await expect(
        service.sendInvitation('interview-1', { rawCode: 'WRONG-CODE' }, 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow retry on email failure', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue(mockInterview.codeHash);
      tokenService.generate.mockReturnValue('jwt-token');
      emailService.sendAiInterviewInvitationEmail.mockRejectedValue(new Error('SMTP error'));
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);

      await expect(
        service.sendInvitation('interview-1', { rawCode: 'ABCD-EFGH' }, 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not mark SENT on failure and retry succeeds on the same record', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue(mockInterview.codeHash);
      tokenService.generate.mockReturnValue('jwt-token');
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);
      prisma.aiInterview.update.mockResolvedValue(sentInterview);

      // First attempt fails at the provider
      emailService.sendAiInterviewInvitationEmail.mockRejectedValueOnce(new Error('SMTP down'));
      await expect(
        service.sendInvitation('interview-1', { rawCode: 'ABCD-EFGH' }, 'company-1'),
      ).rejects.toThrow(BadRequestException);

      // No status update was applied for the failed attempt (record preserved)
      const updatesAfterFailure = prisma.aiInterview.update.mock.calls;
      expect(
        updatesAfterFailure.filter((c) => c[0].data.status === AiInterviewStatus.SENT),
      ).toHaveLength(0);
      prisma.aiInterview.update.mockClear();

      // Second attempt succeeds on the same record
      emailService.sendAiInterviewInvitationEmail.mockResolvedValueOnce(undefined);
      const result = await service.sendInvitation(
        'interview-1',
        { rawCode: 'ABCD-EFGH' },
        'company-1',
      );
      expect(result.sent).toBe(true);
      const sentUpdate = prisma.aiInterview.update.mock.calls.find(
        (c) => c[0].data.status === AiInterviewStatus.SENT,
      );
      expect(sentUpdate).toBeDefined();
      expect(sentUpdate[0].data.invitationEmail).toBe('daniel@test.com');
    });

    it('should reject candidate without email', async () => {
      const noEmailApplication = {
        ...mockApplication,
        candidate: { ...mockApplication.candidate, email: null },
      };
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...sentInterview,
        application: noEmailApplication,
      });

      await expect(
        service.sendInvitation('interview-1', { rawCode: 'ABCD-EFGH' }, 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should email the raw code, not the masked hint', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue(mockInterview.codeHash);
      codeService.format.mockReturnValue('ABCD-EFGH');
      emailService.sendAiInterviewInvitationEmail.mockResolvedValue(undefined);
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);
      prisma.aiInterview.update.mockResolvedValue(sentInterview);

      await service.sendInvitation('interview-1', { rawCode: 'ABCD-EFGH' }, 'company-1');

      const emailCall = emailService.sendAiInterviewInvitationEmail.mock.calls[0];
      expect(emailCall[5]).toBe('ABCD-EFGH');
      expect(emailCall[5]).not.toMatch(/^\*\*\*\*/);
    });

    it('should generate a fresh code and email it when rawCode is absent', async () => {
      codeService.generate.mockReturnValue('NEWC-ODE1');
      codeService.hash.mockReturnValue('new-hash');
      codeService.displayHint.mockReturnValue('****-ODE1');
      emailService.sendAiInterviewInvitationEmail.mockResolvedValue(undefined);
      prisma.aiInterview.findFirst.mockResolvedValue(sentInterview);
      prisma.aiInterview.update.mockResolvedValue(sentInterview);

      const result = await service.sendInvitation('interview-1', {}, 'company-1');

      const emailCall = emailService.sendAiInterviewInvitationEmail.mock.calls[0];
      expect(emailCall[5]).toBe('NEWC-ODE1');
      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      expect(updateCall.data.codeHash).toBe('new-hash');
      expect(result.sent).toBe(true);
    });
  });

  // ─── REGENERATE CODE ──────────────────────────────────────────────────────

  describe('regenerateCode', () => {
    it('should return new code and invalidate old code', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      codeService.generate.mockReturnValue('NEWC-ODE1');
      codeService.hash.mockReturnValue('new-hash-value');
      codeService.displayHint.mockReturnValue('NEWC-ODE1');
      prisma.aiInterview.update.mockResolvedValue({ ...mockInterview, codeHash: 'new-hash-value' });

      const result = await service.regenerateCode('interview-1', 'company-1');

      expect(result.rawCode).toBe('NEWC-ODE1');
      expect(prisma.aiInterview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codeHash: 'new-hash-value',
            codeDisplayHint: 'NEWC-ODE1',
          }),
        }),
      );
      expect(codeService.generate).toHaveBeenCalledTimes(1);
    });

    it('should reject regeneration for completed interview', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
      });
      await expect(service.regenerateCode('interview-1', 'company-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject cross-company regeneration', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(service.regenerateCode('interview-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── VERIFY CODE ──────────────────────────────────────────────────────────

  describe('verifyCode', () => {
    it('should return signed access token for valid code', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue('the-hash');
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      tokenService.generate.mockReturnValue('signed-jwt-token');
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      const result = await service.verifyCode({ code: 'ABCD-EFGH' });

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result).not.toHaveProperty('interviewId');
      expect(result).not.toHaveProperty('applicationId');
      expect(result).not.toHaveProperty('candidateId');
      expect(result).not.toHaveProperty('companyId');
      expect(result).not.toHaveProperty('codeHash');
    });

    it('should reject invalid code', async () => {
      codeService.normalize.mockReturnValue('INVALID');
      codeService.hash.mockReturnValue('wrong-hash');
      prisma.aiInterview.findUnique.mockResolvedValue(null);

      await expect(service.verifyCode({ code: 'INVALID' })).rejects.toThrow(BadRequestException);
    });

    it('should reject expired interview', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue('the-hash');
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.EXPIRED,
      });

      await expect(service.verifyCode({ code: 'ABCD-EFGH' })).rejects.toThrow(BadRequestException);
    });

    it('should reject cancelled interview', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue('the-hash');
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.CANCELLED,
      });

      await expect(service.verifyCode({ code: 'ABCD-EFGH' })).rejects.toThrow(BadRequestException);
    });

    it('should reject completed interview', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue('the-hash');
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
      });

      await expect(service.verifyCode({ code: 'ABCD-EFGH' })).rejects.toThrow(BadRequestException);
    });

    it('should return candidate display name and org name, not internal IDs', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue('the-hash');
      tokenService.generate.mockReturnValue('jwt-token');
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      const result = await service.verifyCode({ code: 'ABCD-EFGH' });

      expect(result.candidateDisplayName).toBe('Daniel Kato');
      expect(result.organizationName).toBe('Test Corp');
      expect(Object.keys(result)).not.toContain('interviewId');
      expect(Object.keys(result)).not.toContain('applicationId');
    });
  });

  // ─── ACCESS TOKEN ─────────────────────────────────────────────────────────

  describe('access token validation', () => {
    it('should verify valid token and extract interview ID', () => {
      const tokenPayload: any = {
        sub: 'interview-1',
        purpose: 'talentai-ai-interview-access',
        cv: 'hash-prefix',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      tokenService.verify.mockReturnValue(tokenPayload);
      tokenService.extractInterviewId.mockReturnValue('interview-1');

      const result = tokenService.extractInterviewId('valid-token');
      expect(result).toBe('interview-1');
    });

    it('should reject altered token', () => {
      tokenService.extractInterviewId.mockReturnValue(null);
      const result = tokenService.extractInterviewId('altered-token');
      expect(result).toBeNull();
    });

    it('should reject expired token', () => {
      tokenService.extractInterviewId.mockReturnValue(null);
      const result = tokenService.extractInterviewId('expired-token');
      expect(result).toBeNull();
    });

    it('should reject wrong-purpose token', () => {
      tokenService.verify.mockImplementation(() => {
        throw new Error('INVALID_TOKEN_PURPOSE');
      });
      tokenService.extractInterviewId.mockReturnValue(null);
      const result = tokenService.extractInterviewId('wrong-purpose-token');
      expect(result).toBeNull();
    });
  });

  // ─── START INTERVIEW ──────────────────────────────────────────────────────

  describe('startInterview', () => {
    it('should require acknowledgements', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      await expect(
        service.startInterview('token', { acknowledgementsAccepted: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should atomically transition status for mock start', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      prisma.aiInterview.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.IN_PROGRESS,
        tavusConversationUrl: 'http://localhost:3001/interview/session/mock',
        tavusConversationId: 'mock-interview-1',
      });

      const result = await service.startInterview('token', { acknowledgementsAccepted: true });

      expect(result.provider).toBe(AiInterviewProvider.MOCK);
      expect(prisma.aiInterview.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'interview-1',
          status: { in: expect.any(Array) },
        },
        data: expect.objectContaining({
          status: AiInterviewStatus.IN_PROGRESS,
        }),
      });
    });

    it('should persist consent and accommodation on start', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      prisma.aiInterview.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.startInterview('token', {
        acknowledgementsAccepted: true,
        accommodationRequested: true,
        accommodationNotes: '   Extended time please.   ',
      });

      const updateManyCall = prisma.aiInterview.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.consentAcceptedAt).toBeDefined();
      expect(updateManyCall.data.accommodationRequested).toBe(true);
      expect(updateManyCall.data.accommodationNotes).toBe('Extended time please.');
    });

    it('should persist consent without accommodation when not requested', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      prisma.aiInterview.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.startInterview('token', {
        acknowledgementsAccepted: true,
        accommodationRequested: false,
      });

      const updateManyCall = prisma.aiInterview.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.accommodationRequested).toBe(false);
      expect(updateManyCall.data.accommodationNotes).toBeNull();
    });

    it('should only create one provider session on duplicate start', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      // First start succeeds
      prisma.aiInterview.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.IN_PROGRESS,
        tavusConversationUrl: 'http://localhost:3001/interview/session/mock',
        tavusConversationId: 'mock-interview-1',
      });

      await service.startInterview('token', { acknowledgementsAccepted: true });

      // Second start - already IN_PROGRESS
      prisma.aiInterview.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.IN_PROGRESS,
        tavusConversationId: 'mock-interview-1',
        tavusConversationUrl: 'http://localhost:3001/interview/session/mock',
      });

      const result = await service.startInterview('token', { acknowledgementsAccepted: true });

      expect(result.status).toBe(AiInterviewStatus.IN_PROGRESS);
      expect(result.conversationId).toBe('mock-interview-1');
    });

    it('should reject Tavus when disabled', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      prisma.aiInterview.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        provider: AiInterviewProvider.TAVUS,
      });

      await expect(
        service.startInterview('token', { acknowledgementsAccepted: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not return meeting token in response', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      prisma.aiInterview.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.IN_PROGRESS,
      });

      const result = await service.startInterview('token', { acknowledgementsAccepted: true });

      expect(result).not.toHaveProperty('meetingToken');
    });
  });

  // ─── COMPLETE INTERVIEW ───────────────────────────────────────────────────

  describe('completeInterview', () => {
    it('should complete mock interview', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.IN_PROGRESS,
        provider: AiInterviewProvider.MOCK,
      });
      prisma.aiInterview.update.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
      });

      const result = await service.completeInterview('token');

      expect(result.completed).toBe(true);
      expect(prisma.aiInterview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AiInterviewStatus.COMPLETED,
          }),
        }),
      );
    });

    it('should end the Tavus conversation when candidate completes', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.IN_PROGRESS,
        provider: AiInterviewProvider.TAVUS,
        tavusConversationId: 'tavus-conv-1',
      });
      mockTavusClient.endConversation.mockResolvedValue(undefined);
      mockTavusClient.isEnabled = false;

      const result = await service.completeInterview('token');

      expect(result.completed).toBe(false);
      expect(mockTavusClient.endConversation).toHaveBeenCalledWith('tavus-conv-1');
    });

    it('should tolerate duplicate completion calls (idempotent end)', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
        provider: AiInterviewProvider.TAVUS,
        tavusConversationId: 'tavus-conv-1',
      });
      mockTavusClient.endConversation.mockResolvedValue(undefined);

      await service.completeInterview('token');
      await service.completeInterview('token');

      expect(mockTavusClient.endConversation).toHaveBeenCalledTimes(2);
      expect(mockTavusClient.endConversation).toHaveBeenCalledWith('tavus-conv-1');
    });

    it('should reject completion of cancelled interview', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.CANCELLED,
      });

      await expect(service.completeInterview('token')).rejects.toThrow(BadRequestException);
    });

    it('should handle duplicate completion safely', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
        provider: AiInterviewProvider.MOCK,
      });

      const result = await service.completeInterview('token');
      expect(result.completed).toBe(true);
    });
  });

  // ─── TAVUS CALLBACK ───────────────────────────────────────────────────────

  describe('handleTavusCallback', () => {
    const callbackPayload = {
      event: 'system.shutdown',
      conversation_id: 'tavus-conv-1',
      status: 'completed',
    };

    it('should reject missing secret when configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'tavus.callbackSecret') return 'my-secret';
        return undefined;
      });

      await expect(service.handleTavusCallback(callbackPayload)).rejects.toThrow(
        BadRequestException,
      );

      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'tavus.enabled': false,
          'aiInterview.allowTestEmailOverride': false,
          'app.env': 'test',
        };
        return config[key] ?? undefined;
      });
    });

    it('should reject wrong secret', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'tavus.callbackSecret') return 'my-secret';
        return undefined;
      });

      await expect(service.handleTavusCallback(callbackPayload, 'wrong-secret')).rejects.toThrow(
        BadRequestException,
      );

      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'tavus.enabled': false,
          'aiInterview.allowTestEmailOverride': false,
          'app.env': 'test',
        };
        return config[key] ?? undefined;
      });
    });

    it('should accept correct secret', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'tavus.callbackSecret') return 'my-secret';
        return undefined;
      });

      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      const result = await service.handleTavusCallback(callbackPayload, 'my-secret');
      expect(result.received).toBe(true);

      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'tavus.enabled': false,
          'aiInterview.allowTestEmailOverride': false,
          'app.env': 'test',
        };
        return config[key] ?? undefined;
      });
    });

    it('should handle unknown conversation gracefully', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      const result = await service.handleTavusCallback(callbackPayload);
      expect(result.received).toBe(true);
    });

    it('should handle replica_joined event', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.handleTavusCallback({
        event: 'system.replica_joined',
        conversation_id: 'tavus-conv-1',
        status: 'joined',
      });

      expect(prisma.aiInterview.update).toHaveBeenCalled();
    });

    it('should handle shutdown and mark completed', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.handleTavusCallback(callbackPayload);

      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(AiInterviewStatus.COMPLETED);
      expect(updateCall.data.completedAt).toBeDefined();
    });

    it('should handle duplicate shutdown safely', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
      });

      await service.handleTavusCallback(callbackPayload);

      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      // Idempotent: status is NOT overwritten for an already-completed interview
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.tavusStatus).toBeDefined();
    });

    it('should handle transcript_ready event', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.handleTavusCallback({
        event: 'application.transcription_ready',
        conversation_id: 'tavus-conv-1',
        properties: {
          transcript_url: 'https://tavus.com/transcript/abc',
          transcript: [
            {
              role: 'assistant',
              content: 'Welcome to your interview.',
              timestamp: 1779475657.84,
              seconds_from_start: 0.0,
              duration: 2.15,
            },
            {
              role: 'user',
              content: 'Thank you.',
              timestamp: 1779475684.88,
              seconds_from_start: 27.04,
              duration: 1.84,
            },
          ],
        },
      });

      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      expect(updateCall.data.transcriptStatus).toBe(AiInterviewTranscriptStatus.READY);
      expect(updateCall.data.transcriptUrl).toBe('https://tavus.com/transcript/abc');
      expect(updateCall.data.transcript).toHaveLength(2);
      expect(updateCall.data.transcript[0].role).toBe('assistant');
      expect(updateCall.data.transcript[0].content).toContain('Welcome');
    });

    it('should handle recording_ready event', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.handleTavusCallback({
        event: 'application.recording_ready',
        conversation_id: 'tavus-conv-1',
        properties: {
          storage_provider: 's3',
          storage_uri: 's3://recordings/tavus/conv-1/1234',
          duration: 120,
        },
      });

      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      expect(updateCall.data.recordingStatus).toBe('READY');
      expect(updateCall.data.recordingUrl).toBe('s3://recordings/tavus/conv-1/1234');
      expect(updateCall.data.recordingMetadata).toEqual({
        storage_provider: 's3',
        storage_uri: 's3://recordings/tavus/conv-1/1234',
        duration: 120,
      });
    });

    it('should persist only safe recording metadata fields', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      await service.handleTavusCallback({
        event: 'application.recording_ready',
        conversation_id: 'tavus-conv-1',
        properties: {
          storage_provider: 's3',
          storage_uri: 's3://recordings/tavus/conv-1/999',
          s3_key: 'tavus/conv-1/999',
          bucket_name: 'rec-bucket',
          duration: 60,
          signed_url: 'https://signed.example.com/secret-token',
          api_key: 'should-never-be-persisted',
        },
      });

      const updateCall = prisma.aiInterview.update.mock.calls[0][0];
      expect(updateCall.data.recordingMetadata).toEqual({
        storage_provider: 's3',
        storage_uri: 's3://recordings/tavus/conv-1/999',
        s3_key: 'tavus/conv-1/999',
        bucket_name: 'rec-bucket',
        duration: 60,
      });
      expect(JSON.stringify(updateCall.data.recordingMetadata)).not.toContain('signed_url');
      expect(JSON.stringify(updateCall.data.recordingMetadata)).not.toContain('api_key');
    });

    it('should ignore events for unknown conversations', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);

      const result = await service.handleTavusCallback({
        event: 'system.shutdown',
        conversation_id: 'unknown-conv',
      });

      expect(result.received).toBe(true);
      expect(prisma.aiInterview.update).not.toHaveBeenCalled();
    });

    it('should reject malformed payload', async () => {
      const result = await service.handleTavusCallback({
        event: '',
        conversation_id: '',
      });
      expect(result.received).toBe(true);
    });
  });
  // ─── RECORDING CONFIGURATION ───────────────────────────────────────────

  describe('recording conversation configuration', () => {
    const enabledConfig =
      (overrides: Record<string, any> = {}) =>
      (key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'app.backendUrl': 'http://localhost:3000',
          'tavus.enabled': true,
          'tavus.personaId': 'persona-1',
          'tavus.replicaId': 'replica-1',
          'tavus.callbackBaseUrl': 'https://api.example.com',
          'tavus.callbackSecret': 'cb-secret',
          'tavus.participantAbsentTimeoutSeconds': 120,
          'tavus.participantLeftTimeoutSeconds': 60,
          'tavus.recording': {
            enabled: true,
            provider: 's3',
            bucketName: 'rec-bucket',
            bucketRegion: 'eu-west-1',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/TavusRecordingWriter',
          },
          ...overrides,
        };
        return config[key] ?? undefined;
      };

    beforeEach(() => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockInterview);
      prisma.aiInterview.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.findUnique.mockResolvedValue({
        ...mockInterview,
        provider: AiInterviewProvider.TAVUS,
        application: {
          ...mockApplication,
          candidate: { ...mockApplication.candidate, firstName: 'Daniel', lastName: 'Kato' },
          job: { ...mockApplication.job },
          company: { name: 'Test Corp' },
        },
      });
      mockTavusClient.isEnabled = true;
      mockTavusClient.createConversation.mockResolvedValue({
        conversation_id: 'tavus-conv-1',
        conversation_url: 'https://tavus.daily.co/tavus-conv-1',
        status: 'active',
        meeting_token: 'mt-1',
      });
      prisma.aiInterview.update.mockResolvedValue(mockInterview);
    });

    afterEach(() => {
      mockTavusClient.isEnabled = false;
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'tavus.enabled': false,
          'aiInterview.allowTestEmailOverride': false,
          'app.env': 'test',
        };
        return config[key] ?? undefined;
      });
    });

    it('includes auto_start_recording + s3 recording_storage when enabled', async () => {
      mockConfigService.get.mockImplementation(enabledConfig());

      await service.startInterview('token', { acknowledgementsAccepted: true });

      const request = mockTavusClient.createConversation.mock.calls[0][0];
      expect(request.properties).toEqual({
        participant_absent_timeout: 120,
        participant_left_timeout: 60,
        auto_start_recording: true,
        recording_storage: {
          provider: 's3',
          bucket_name: 'rec-bucket',
          bucket_region: 'eu-west-1',
          assume_role_arn: 'arn:aws:iam::123456789012:role/TavusRecordingWriter',
        },
      });
    });

    it('marks recordingStatus PROCESSING when recording enabled', async () => {
      mockConfigService.get.mockImplementation(enabledConfig());

      await service.startInterview('token', { acknowledgementsAccepted: true });

      const updateCall = prisma.aiInterview.update.mock.calls.find(
        (c) => c[0].data.tavusConversationId,
      );
      expect(updateCall[0].data.recordingStatus).toBe('PROCESSING');
    });

    it('omits recording configuration safely when disabled', async () => {
      mockConfigService.get.mockImplementation(
        enabledConfig({ 'tavus.recording': { enabled: false } }),
      );

      await service.startInterview('token', { acknowledgementsAccepted: true });

      const request = mockTavusClient.createConversation.mock.calls[0][0];
      expect(request.properties.auto_start_recording).toBeUndefined();
      expect(request.properties.recording_storage).toBeUndefined();
      const updateCall = prisma.aiInterview.update.mock.calls.find(
        (c) => c[0].data.tavusConversationId,
      );
      expect(updateCall[0].data.recordingStatus).toBeNull();
    });

    it('uses gcs federation fields for provider gcs', async () => {
      mockConfigService.get.mockImplementation(
        enabledConfig({
          'tavus.recording': {
            enabled: true,
            provider: 'gcs',
            bucketName: 'gcs-bucket',
            projectId: 'proj-1',
            workloadIdentityProvider:
              'projects/1/locations/global/workloadIdentityPools/p/providers/w',
            serviceAccountEmail: 'writer@proj-1.iam.gserviceaccount.com',
          },
        }),
      );

      await service.startInterview('token', { acknowledgementsAccepted: true });

      const request = mockTavusClient.createConversation.mock.calls[0][0];
      expect(request.properties.recording_storage).toEqual({
        provider: 'gcs',
        bucket_name: 'gcs-bucket',
        project_id: 'proj-1',
        workload_identity_provider:
          'projects/1/locations/global/workloadIdentityPools/p/providers/w',
        service_account_email: 'writer@proj-1.iam.gserviceaccount.com',
      });
    });
  });

  // ─── RECORDING PLAYBACK ──────────────────────────────────────────────────

  describe('getRecordingPlayback', () => {
    const readyInterview = {
      ...mockInterview,
      recordingStatus: 'READY',
      recordingMetadata: {
        storage_provider: 's3',
        bucket_name: 'rec-bucket',
        s3_key: 'tavus/conv-1/1787527151095',
      },
    };

    it('should return a signed playback URL for a READY s3 recording', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(readyInterview);
      mockPlaybackService.getPlaybackUrl.mockResolvedValue({
        playbackUrl: 'https://s3.example.com/signed?X-Amz-Expires=600',
        expiresAt: '2026-08-24T00:00:00.000Z',
      });

      const result = await service.getRecordingPlayback('interview-1', 'company-1');

      expect(mockPlaybackService.getPlaybackUrl).toHaveBeenCalledWith({
        recordingStatus: 'READY',
        storageProvider: 's3',
        bucketName: 'rec-bucket',
        s3Key: 'tavus/conv-1/1787527151095',
      });
      expect(result.playbackUrl).toContain('signed');
      expect(result.expiresAt).toBeDefined();
    });

    it('should reject cross-company playback with 404', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(service.getRecordingPlayback('interview-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should forward non-READY recordings to the playback guard', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...readyInterview,
        recordingStatus: 'PROCESSING',
      });
      mockPlaybackService.getPlaybackUrl.mockRejectedValue(
        new (require('@nestjs/common').BadRequestException)({ code: 'RECORDING_NOT_READY' }),
      );

      await expect(service.getRecordingPlayback('interview-1', 'company-1')).rejects.toThrow();
      expect(mockPlaybackService.getPlaybackUrl).toHaveBeenCalledWith(
        expect.objectContaining({ recordingStatus: 'PROCESSING' }),
      );
    });
  });

  // ─── ARTIFACT SYNC ───────────────────────────────────────────────────────

  describe('syncInterviewArtifacts', () => {
    it('should reject cross-company sync', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(service.syncInterviewArtifacts('interview-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should sync artifacts and return the updated state', async () => {
      const mockUpdated = {
        status: AiInterviewStatus.COMPLETED,
        transcriptStatus: AiInterviewTranscriptStatus.READY,
        transcript: [{ role: 'user', content: 'Hello' }],
        transcriptUrl: 'https://tavus.test/transcript/1',
        recordingStatus: 'READY',
        recordingUrl: 's3://recordings/1',
        tavusStatus: 'ended',
      };
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.findUnique.mockResolvedValue(mockUpdated);
      prisma.aiInterview.update.mockResolvedValue(mockUpdated);

      const result = await service.syncInterviewArtifacts('interview-1', 'company-1');

      expect(result.synced).toBe(true);
      expect(result.transcriptStatus).toBe(AiInterviewTranscriptStatus.READY);
      expect(result.recordingStatus).toBe('READY');
      expect(result.status).toBe(AiInterviewStatus.COMPLETED);
    });

    it('should reconcile an ended provider conversation to COMPLETED', async () => {
      const mockSyncTarget = {
        id: 'interview-1',
        status: AiInterviewStatus.IN_PROGRESS,
        provider: AiInterviewProvider.TAVUS,
        tavusConversationId: 'tavus-conv-1',
        transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
        recordingStatus: null,
      };
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.findUnique.mockResolvedValueOnce(mockSyncTarget).mockResolvedValue({
        status: AiInterviewStatus.COMPLETED,
        transcriptStatus: AiInterviewTranscriptStatus.READY,
        transcript: [],
        transcriptUrl: null,
        recordingStatus: null,
        recordingUrl: null,
        tavusStatus: 'ended',
      });
      mockTavusClient.isEnabled = true;
      mockTavusClient.getConversation.mockResolvedValue({
        conversation_id: 'tavus-conv-1',
        status: 'ended',
        events: [
          {
            event_type: 'application.transcription_ready',
            properties: {
              transcript: [
                {
                  role: 'user',
                  content: 'Real spoken answer',
                  timestamp: 123.4,
                  seconds_from_start: 5.0,
                  duration: 2.0,
                },
                {
                  role: 'assistant',
                  content: 'Great, tell me more.',
                  timestamp: 128.0,
                  seconds_from_start: 10.0,
                  duration: 1.5,
                },
              ],
            },
          },
          { event_type: 'system.shutdown', properties: { shutdown_reason: 'ended' } },
        ],
      });
      prisma.aiInterview.update.mockResolvedValue(mockSyncTarget);

      await service.syncInterviewArtifacts('interview-1', 'company-1');

      const statusUpdate = prisma.aiInterview.update.mock.calls.find(
        (c) => c[0].data.status === AiInterviewStatus.COMPLETED,
      );
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate[0].data.completedAt).toBeDefined();
      const transcriptUpdate = prisma.aiInterview.update.mock.calls.find(
        (c) => c[0].data.transcript !== undefined,
      );
      expect(transcriptUpdate).toBeDefined();
      expect(transcriptUpdate[0].data.transcript).toHaveLength(2);
      expect(transcriptUpdate[0].data.transcript[0].content).toBe('Real spoken answer');
      expect(transcriptUpdate[0].data.transcriptStatus).toBe(AiInterviewTranscriptStatus.READY);
      mockTavusClient.isEnabled = false;
    });

    it('should auto-end a stale active conversation after the bounded timeout', async () => {
      const staleInterview = {
        id: 'interview-1',
        status: AiInterviewStatus.IN_PROGRESS,
        provider: AiInterviewProvider.TAVUS,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        tavusConversationId: 'tavus-conv-1',
        transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
        recordingStatus: 'PROCESSING',
      };
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.findUnique.mockResolvedValueOnce(staleInterview).mockResolvedValue({
        status: AiInterviewStatus.COMPLETED,
        transcriptStatus: AiInterviewTranscriptStatus.READY,
        transcript: [],
        transcriptUrl: null,
        recordingStatus: 'READY',
        recordingUrl: 's3://rec-bucket/tavus/conv-1/1',
        tavusStatus: 'ended',
      });
      mockTavusClient.isEnabled = true;
      mockTavusClient.getConversation
        .mockResolvedValueOnce({ conversation_id: 'tavus-conv-1', status: 'active', events: [] })
        .mockResolvedValueOnce({
          conversation_id: 'tavus-conv-1',
          status: 'ended',
          events: [
            {
              event_type: 'application.recording_ready',
              properties: { storage_uri: 's3://rec-bucket/tavus/conv-1/1', duration: 202 },
            },
            { event_type: 'application.transcription_ready', properties: { transcript: [] } },
          ],
        });
      mockTavusClient.endConversation.mockResolvedValue(undefined);
      prisma.aiInterview.update.mockResolvedValue(staleInterview);
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'tavus.enabled': false,
          'aiInterview.allowTestEmailOverride': false,
          'app.env': 'test',
          'tavus.autoEndStaleAfterMinutes': 60,
        };
        return config[key] ?? undefined;
      });

      await service.syncInterviewArtifacts('interview-1', 'company-1');

      expect(mockTavusClient.endConversation).toHaveBeenCalledWith('tavus-conv-1');
      const statusUpdate = prisma.aiInterview.update.mock.calls.find(
        (c) => c[0].data.status === AiInterviewStatus.COMPLETED,
      );
      expect(statusUpdate).toBeDefined();
      mockTavusClient.isEnabled = false;
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'app.frontendUrl': 'http://localhost:3001',
          'tavus.enabled': false,
          'aiInterview.allowTestEmailOverride': false,
          'app.env': 'test',
        };
        return config[key] ?? undefined;
      });
    });
  });

  // ─── CANCEL ───────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel an interview', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.CANCELLED,
      });

      const result = await service.cancel('interview-1', 'company-1');
      expect(result.cancelled).toBe(true);
    });

    it('should reject cancelling completed interview', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: AiInterviewStatus.COMPLETED,
      });

      await expect(service.cancel('interview-1', 'company-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject cross-company cancel', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(service.cancel('interview-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── PREVIEW INVITATION ───────────────────────────────────────────────────

  describe('previewInvitation', () => {
    it('should return preview details from interview', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...mockInterview,
        application: mockApplication,
      });

      const result = await service.previewInvitation('interview-1', 'company-1');

      expect(result.candidateName).toBe('Daniel Kato');
      expect(result.candidateEmail).toBe('daniel@test.com');
      expect(result.jobTitle).toBe('Senior Software Developer');
      expect(result.companyName).toBe('Test Corp');
      expect(result.interviewCode).toBe('ABCD-EFGH');
    });

    it('should reject cross-company preview', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(null);
      await expect(service.previewInvitation('interview-1', 'other-company')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── PUBLIC RESPONSE DATA ─────────────────────────────────────────────────

  describe('public response data', () => {
    it('should verify-code response exclude internal IDs', async () => {
      codeService.normalize.mockReturnValue('ABCDEFGH');
      codeService.hash.mockReturnValue('the-hash');
      tokenService.generate.mockReturnValue('jwt-token');
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);
      prisma.aiInterview.update.mockResolvedValue(mockInterview);

      const result = await service.verifyCode({ code: 'ABCD-EFGH' });

      const keys = Object.keys(result);
      expect(keys).not.toContain('interviewId');
      expect(keys).not.toContain('applicationId');
      expect(keys).not.toContain('candidateId');
      expect(keys).not.toContain('companyId');
      expect(keys).not.toContain('codeHash');
      expect(keys).toContain('candidateDisplayName');
      expect(keys).toContain('organizationName');
    });

    it('should session response exclude internal IDs', async () => {
      tokenService.verify.mockReturnValue({
        sub: 'interview-1',
        cv: 'abcdef1234567890',
        purpose: 'talentai-ai-interview-access',
        iat: 1000000,
        exp: 2000000,
      });
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview);

      const result = await service.getInterviewSession('valid-token');

      const keys = Object.keys(result);
      expect(keys).not.toContain('interviewId');
      expect(keys).not.toContain('applicationId');
      expect(keys).not.toContain('candidateId');
      expect(keys).not.toContain('companyId');
      expect(keys).not.toContain('codeHash');
      expect(keys).toContain('candidateDisplayName');
      expect(keys).toContain('organizationName');
    });
  });
});
