import { Test, TestingModule } from '@nestjs/testing';
import { InterviewsService } from '../services/interviews.service';
import { InterviewConflictService } from '../services/interview-conflict.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  InterviewStatus,
  InterviewType,
  InterviewResult,
  InterviewHistoryEventType,
} from '@prisma/client';

const mockPrisma = {
  application: { findFirst: jest.fn() },
  jobPipelineStage: { findFirst: jest.fn() },
  interview: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  interviewParticipant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  interviewHistory: { create: jest.fn() },
  companyMembership: { findFirst: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

const mockConflictService = {
  findConflicts: jest.fn().mockResolvedValue([]),
  assertNoConflict: jest.fn().mockResolvedValue(undefined),
};

const COMPANY_ID = 'company-1';
const APP_ID = 'application-1';
const JOB_ID = 'job-1';
const MEMBERSHIP_ID = 'membership-1';
const USER_ID = 'user-1';
const INTERVIEW_ID = 'interview-1';

const mockApplication = {
  id: APP_ID,
  companyId: COMPANY_ID,
  jobId: JOB_ID,
  candidateId: 'candidate-1',
  job: { pipeline: { stages: [{ id: 'stage-1', type: 'RECRUITER_INTERVIEW', sortOrder: 0 }] } },
};

const mockInterview = {
  id: INTERVIEW_ID,
  companyId: COMPANY_ID,
  applicationId: APP_ID,
  jobId: JOB_ID,
  title: 'Technical Interview',
  type: InterviewType.TECHNICAL,
  status: InterviewStatus.SCHEDULED,
  result: InterviewResult.NOT_RECORDED,
  scheduledAt: new Date(Date.now() + 86400000), // tomorrow
  durationMinutes: 60,
  timezone: 'Africa/Kampala',
  version: 1,
  participants: [],
  history: [],
};

describe('InterviewsService', () => {
  let service: InterviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InterviewConflictService, useValue: mockConflictService },
      ],
    }).compile();
    service = module.get<InterviewsService>(InterviewsService);
  });

  describe('create', () => {
    const dto = {
      applicationId: APP_ID,
      type: InterviewType.TECHNICAL,
      title: 'Technical Interview',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      durationMinutes: 60,
      timezone: 'Africa/Kampala',
    };

    it('creates an interview successfully', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.interview.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.interview.create.mockResolvedValue(mockInterview);
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        participants: [],
        history: [],
        stage: null,
        application: null,
        job: null,
        createdBy: null,
        updatedBy: null,
      });

      const result = await service.create(dto, COMPANY_ID, USER_ID, MEMBERSHIP_ID);
      expect(result).toBeDefined();
      expect(mockPrisma.interview.create).toHaveBeenCalledTimes(1);
    });

    it('throws NOT_FOUND when application does not belong to company', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);
      await expect(service.create(dto, COMPANY_ID, USER_ID, MEMBERSHIP_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BAD_REQUEST when scheduledAt is in the past', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      await expect(
        service.create(
          { ...dto, scheduledAt: new Date(Date.now() - 3600000).toISOString() },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws CONFLICT when duplicate active interview exists in same stage', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.jobPipelineStage.findFirst.mockResolvedValue({ id: 'stage-1' });
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview); // duplicate found
      await expect(
        service.create(
          { ...dto, jobPipelineStageId: 'stage-1' },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BAD_REQUEST when stage does not belong to job pipeline', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.jobPipelineStage.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { ...dto, jobPipelineStageId: 'bad-stage' },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns paginated interviews scoped to company', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([
        { ...mockInterview, participants: [], stage: null },
      ]);
      mockPrisma.interview.count.mockResolvedValue(1);
      const result = await service.findAll({}, COMPANY_ID);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      const call = mockPrisma.interview.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe(COMPANY_ID);
    });
  });

  describe('findById', () => {
    it('returns interview when found', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        participants: [],
        history: [],
        stage: null,
        application: null,
        job: null,
        createdBy: null,
        updatedBy: null,
      });
      const result = await service.findById(INTERVIEW_ID, COMPANY_ID);
      expect(result.id).toBe(INTERVIEW_ID);
    });

    it('throws NOT_FOUND when interview not in company', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      await expect(service.findById(INTERVIEW_ID, COMPANY_ID)).rejects.toThrow(NotFoundException);
    });

    it('never returns another company interview (tenant isolation)', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      await expect(service.findById(INTERVIEW_ID, 'other-company')).rejects.toThrow(
        NotFoundException,
      );
      // Ensure companyId filter was used
      expect(mockPrisma.interview.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'other-company' }) }),
      );
    });
  });

  describe('findByApplication', () => {
    it('returns interviews for an application within the company', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.interview.findMany.mockResolvedValue([
        { ...mockInterview, participants: [], stage: null },
      ]);
      const result = await service.findByApplication(APP_ID, COMPANY_ID);
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.interview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ applicationId: APP_ID, companyId: COMPANY_ID }),
        }),
      );
    });

    it('throws NOT_FOUND when application does not belong to company', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);
      await expect(service.findByApplication(APP_ID, COMPANY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates interview details successfully', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.interview.update.mockResolvedValue({
        ...mockInterview,
        title: 'Updated Title',
        version: 2,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.update(
        INTERVIEW_ID,
        { title: 'Updated Title', expectedVersion: 1 },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(mockPrisma.interview.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'Updated Title' }) }),
      );
    });

    it('throws NOT_FOUND for unknown interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      await expect(
        service.update(
          INTERVIEW_ID,
          { title: 'Updated', expectedVersion: 1 },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BAD_REQUEST for terminal-state interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CANCELLED,
      });
      await expect(
        service.update(
          INTERVIEW_ID,
          { title: 'Updated', expectedVersion: 1 },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws CONFLICT on stale version', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({ ...mockInterview, version: 2 });
      await expect(
        service.update(
          INTERVIEW_ID,
          { title: 'Updated', expectedVersion: 1 },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reschedule', () => {
    const dto = {
      scheduledAt: new Date(Date.now() + 172800000).toISOString(), // 2 days out
      expectedVersion: 1,
    };

    it('reschedules a SCHEDULED interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.interview.update.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.RESCHEDULED,
        version: 2,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.reschedule(
        INTERVIEW_ID,
        dto,
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(mockPrisma.interview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: InterviewStatus.RESCHEDULED }),
        }),
      );
    });

    it('throws BAD_REQUEST when rescheduling a COMPLETED interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.COMPLETED,
      });
      await expect(
        service.reschedule(INTERVIEW_ID, dto, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BAD_REQUEST when rescheduling a CANCELLED interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CANCELLED,
      });
      await expect(
        service.reschedule(INTERVIEW_ID, dto, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws CONFLICT on stale version', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({ ...mockInterview, version: 2 });
      await expect(
        service.reschedule(
          INTERVIEW_ID,
          { ...dto, expectedVersion: 1 },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BAD_REQUEST when new time is in the past', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      await expect(
        service.reschedule(
          INTERVIEW_ID,
          { scheduledAt: new Date(Date.now() - 3600000).toISOString(), expectedVersion: 1 },
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels a SCHEDULED interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.interview.update.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CANCELLED,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.cancel(
        INTERVIEW_ID,
        { expectedVersion: 1, reason: 'Conflict' },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(result).toEqual({ cancelled: true, applicationId: 'application-1' });
    });

    it('is idempotent for already-cancelled interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CANCELLED,
      });
      const result = await service.cancel(
        INTERVIEW_ID,
        { expectedVersion: 1 },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(result).toEqual({ alreadyCancelled: true });
    });

    it('throws BAD_REQUEST when cancelling a COMPLETED interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.COMPLETED,
      });
      await expect(
        service.cancel(INTERVIEW_ID, { expectedVersion: 1 }, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('start', () => {
    it('starts a CONFIRMED interview (CONFIRMED → IN_PROGRESS)', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CONFIRMED,
      });
      mockPrisma.interview.update.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.IN_PROGRESS,
        version: 2,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.start(
        INTERVIEW_ID,
        { expectedVersion: 1 },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(result).toEqual({ started: true });
      expect(mockPrisma.interview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InterviewStatus.IN_PROGRESS,
            version: 2,
          }),
        }),
      );
      expect(mockPrisma.interviewHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: InterviewHistoryEventType.INTERVIEW_STARTED,
          }),
        }),
      );
    });

    it('throws BAD_REQUEST when starting a SCHEDULED interview (invalid transition)', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.SCHEDULED,
      });
      await expect(
        service.start(INTERVIEW_ID, { expectedVersion: 1 }, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BAD_REQUEST when starting a COMPLETED interview (terminal state)', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.COMPLETED,
      });
      await expect(
        service.start(INTERVIEW_ID, { expectedVersion: 1 }, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NOT_FOUND for unknown interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      await expect(
        service.start(INTERVIEW_ID, { expectedVersion: 1 }, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws CONFLICT on stale version', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CONFIRMED,
        version: 2,
      });
      await expect(
        service.start(INTERVIEW_ID, { expectedVersion: 1 }, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    it('completes an IN_PROGRESS interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.IN_PROGRESS,
      });
      mockPrisma.interview.update.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.COMPLETED,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.complete(
        INTERVIEW_ID,
        { expectedVersion: 1 },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(result).toEqual({ completed: true, applicationId: 'application-1' });
    });

    it('throws BAD_REQUEST when completing a CANCELLED interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        status: InterviewStatus.CANCELLED,
      });
      await expect(
        service.complete(INTERVIEW_ID, { expectedVersion: 1 }, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('state chain (SCHEDULED → CONFIRMED → IN_PROGRESS → COMPLETED)', () => {
    let currentVersion: number;
    let chainInterview: any;

    beforeEach(() => {
      currentVersion = 1;
      chainInterview = {
        ...mockInterview,
        status: InterviewStatus.SCHEDULED,
        version: currentVersion,
        participants: [],
        history: [],
      };
      jest.clearAllMocks();
    });

    it('executes the full lifecycle with version tracking', async () => {
      // Step 1: confirm (SCHEDULED → CONFIRMED)
      mockPrisma.interview.findFirst.mockResolvedValue(chainInterview);
      const confirmResult = await service.confirm(
        INTERVIEW_ID,
        1,
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(confirmResult).toEqual({ confirmed: true });
      // Simulate backend version increment after confirm
      currentVersion++;
      chainInterview = {
        ...chainInterview,
        status: InterviewStatus.CONFIRMED,
        version: currentVersion,
      };

      // Step 2: start (CONFIRMED → IN_PROGRESS)
      mockPrisma.interview.findFirst.mockResolvedValue(chainInterview);
      const startResult = await service.start(
        INTERVIEW_ID,
        { expectedVersion: currentVersion },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(startResult).toEqual({ started: true });
      currentVersion++;
      chainInterview = {
        ...chainInterview,
        status: InterviewStatus.IN_PROGRESS,
        version: currentVersion,
      };

      // Step 3: complete (IN_PROGRESS → COMPLETED)
      mockPrisma.interview.findFirst.mockResolvedValue(chainInterview);
      const completeResult = await service.complete(
        INTERVIEW_ID,
        { expectedVersion: currentVersion },
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(completeResult).toEqual({ completed: true, applicationId: APP_ID });
      currentVersion++;
      chainInterview = {
        ...chainInterview,
        status: InterviewStatus.COMPLETED,
        version: currentVersion,
      };

      // Step 4: record result (COMPLETED only)
      mockPrisma.interview.findFirst.mockResolvedValue(chainInterview);
      mockPrisma.interview.update.mockResolvedValue({
        ...chainInterview,
        result: InterviewResult.PASS,
        version: currentVersion + 1,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const resultResult = await service.recordResult(
        INTERVIEW_ID,
        InterviewResult.PASS,
        'Excellent',
        currentVersion,
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(resultResult.result).toBe(InterviewResult.PASS);
      expect(resultResult.suggestedApplicationAction).toBe('ADVANCE');

      // Verify history events were written for all four steps
      const historyCalls = mockPrisma.interviewHistory.create.mock.calls;
      const eventTypes = historyCalls.map((c: any) => c[0].data.eventType);
      expect(eventTypes).toContain(InterviewHistoryEventType.INTERVIEW_CONFIRMED);
      expect(eventTypes).toContain(InterviewHistoryEventType.INTERVIEW_STARTED);
      expect(eventTypes).toContain(InterviewHistoryEventType.INTERVIEW_COMPLETED);
      expect(eventTypes).toContain(InterviewHistoryEventType.INTERVIEW_RESULT_RECORDED);
    });
  });

  describe('recordResult', () => {
    const completedInterview = {
      ...mockInterview,
      status: InterviewStatus.COMPLETED,
      completedAt: new Date(),
    };

    it('records a PASS result and returns suggested ADVANCE action', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(completedInterview);
      mockPrisma.interview.update.mockResolvedValue({
        ...completedInterview,
        result: InterviewResult.PASS,
        version: 2,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.recordResult(
        INTERVIEW_ID,
        InterviewResult.PASS,
        'Great communication skills',
        1,
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(result.result).toBe(InterviewResult.PASS);
      expect(result.suggestedApplicationAction).toBe('ADVANCE');
      expect(result.version).toBe(2);
    });

    it('records a FAIL result and suggests REJECT_OR_HOLD action', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(completedInterview);
      mockPrisma.interview.update.mockResolvedValue({
        ...completedInterview,
        result: InterviewResult.FAIL,
        version: 2,
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.recordResult(
        INTERVIEW_ID,
        InterviewResult.FAIL,
        'Lacks required technical skills',
        1,
        COMPANY_ID,
        USER_ID,
        MEMBERSHIP_ID,
      );
      expect(result.result).toBe(InterviewResult.FAIL);
      expect(result.suggestedApplicationAction).toBe('REJECT_OR_HOLD');
    });

    it('throws BAD_REQUEST when interview is not COMPLETED', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview); // SCHEDULED
      await expect(
        service.recordResult(
          INTERVIEW_ID,
          InterviewResult.PASS,
          undefined,
          1,
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NOT_FOUND for unknown interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      await expect(
        service.recordResult(
          INTERVIEW_ID,
          InterviewResult.PASS,
          undefined,
          1,
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws CONFLICT on stale version', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue({ ...completedInterview, version: 2 });
      await expect(
        service.recordResult(
          INTERVIEW_ID,
          InterviewResult.PASS,
          undefined,
          1,
          COMPANY_ID,
          USER_ID,
          MEMBERSHIP_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addParticipant', () => {
    it('adds a participant successfully', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.companyMembership.findFirst.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockPrisma.interviewParticipant.findUnique.mockResolvedValue(null);
      mockPrisma.interviewParticipant.create.mockResolvedValue({
        id: 'p-1',
        interviewId: INTERVIEW_ID,
        membershipId: 'new-member',
        role: 'INTERVIEWER',
      });
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.addParticipant(
        INTERVIEW_ID,
        COMPANY_ID,
        'new-member',
        'INTERVIEWER' as any,
        true,
        undefined,
        MEMBERSHIP_ID,
        USER_ID,
      );
      expect(result.id).toBe('p-1');
    });

    it('rejects participant from another company', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.companyMembership.findFirst.mockResolvedValue(null); // not in company
      await expect(
        service.addParticipant(
          INTERVIEW_ID,
          COMPANY_ID,
          'cross-member',
          'INTERVIEWER' as any,
          true,
          undefined,
          MEMBERSHIP_ID,
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate participant', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.companyMembership.findFirst.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockPrisma.interviewParticipant.findUnique.mockResolvedValue({ id: 'existing-p' });
      await expect(
        service.addParticipant(
          INTERVIEW_ID,
          COMPANY_ID,
          MEMBERSHIP_ID,
          'INTERVIEWER' as any,
          true,
          undefined,
          MEMBERSHIP_ID,
          USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeParticipant', () => {
    it('removes a participant and writes history', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.interviewParticipant.findFirst.mockResolvedValue({
        id: 'p-1',
        role: 'INTERVIEWER',
      });
      mockPrisma.interviewParticipant.delete.mockResolvedValue({});
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      const result = await service.removeParticipant(
        INTERVIEW_ID,
        'p-1',
        COMPANY_ID,
        MEMBERSHIP_ID,
        USER_ID,
      );
      expect(result).toEqual({ removed: true });
    });

    it('throws NOT_FOUND for unknown participant', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.interviewParticipant.findFirst.mockResolvedValue(null);
      await expect(
        service.removeParticipant(INTERVIEW_ID, 'bad-p', COMPANY_ID, MEMBERSHIP_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Slot-conflict integration ──────────────────────────────────────────────
  describe('create — slot conflict', () => {
    const dto = {
      applicationId: APP_ID,
      type: InterviewType.TECHNICAL,
      title: 'Technical Interview',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      durationMinutes: 60,
      timezone: 'Africa/Kampala',
      participants: [{ membershipId: 'member-9', role: 'INTERVIEWER' as any }],
    };

    it('checks candidate and participant overlap before creating', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      mockPrisma.companyMembership.findFirst.mockResolvedValue({ id: 'member-9' });
      mockPrisma.interview.create.mockResolvedValue(mockInterview);
      mockPrisma.interviewHistory.create.mockResolvedValue({});
      mockPrisma.interview.findFirst.mockResolvedValue({
        ...mockInterview,
        participants: [],
        history: [],
        stage: null,
        application: null,
        job: null,
        createdBy: null,
        updatedBy: null,
      });

      await service.create(dto as any, COMPANY_ID, USER_ID, MEMBERSHIP_ID);

      expect(mockConflictService.assertNoConflict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          companyId: COMPANY_ID,
          candidateId: 'candidate-1',
          membershipIds: ['member-9'],
        }),
      );
    });

    it('rejects creation when the slot conflicts', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(mockApplication);
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      mockPrisma.companyMembership.findFirst.mockResolvedValue({ id: 'member-9' });
      mockConflictService.assertNoConflict.mockRejectedValueOnce(
        new ConflictException({
          code: 'INTERVIEW_SLOT_CONFLICT',
          message: 'Interview slot conflict',
          conflicts: [{ kind: 'CANDIDATE' }],
        }),
      );

      await expect(service.create(dto as any, COMPANY_ID, USER_ID, MEMBERSHIP_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.interview.create).not.toHaveBeenCalled();
    });
  });

  describe('reschedule — slot conflict', () => {
    const dto = {
      scheduledAt: new Date(Date.now() + 172800000).toISOString(),
      expectedVersion: 1,
      timezone: 'Africa/Kampala',
    };

    it('checks overlap excluding the interview itself', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.application.findFirst.mockResolvedValue({ candidateId: 'candidate-1' });
      mockPrisma.interviewParticipant.findMany.mockResolvedValue([{ membershipId: 'member-9' }]);
      mockPrisma.interview.update.mockResolvedValue(mockInterview);
      mockPrisma.interviewHistory.create.mockResolvedValue({});

      await service.reschedule(INTERVIEW_ID, dto, COMPANY_ID, USER_ID, MEMBERSHIP_ID);

      expect(mockConflictService.assertNoConflict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          candidateId: 'candidate-1',
          membershipIds: ['member-9'],
          excludeInterviewId: INTERVIEW_ID,
        }),
      );
    });

    it('rejects rescheduling into a conflicting slot', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);
      mockPrisma.application.findFirst.mockResolvedValue({ candidateId: 'candidate-1' });
      mockPrisma.interviewParticipant.findMany.mockResolvedValue([]);
      mockConflictService.assertNoConflict.mockRejectedValueOnce(
        new ConflictException({
          code: 'INTERVIEW_SLOT_CONFLICT',
          message: 'Interview slot conflict',
          conflicts: [{ kind: 'PARTICIPANT' }],
        }),
      );

      await expect(
        service.reschedule(INTERVIEW_ID, dto, COMPANY_ID, USER_ID, MEMBERSHIP_ID),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.interview.update).not.toHaveBeenCalled();
    });
  });

  describe('runSerializable — concurrent write-conflict mapping', () => {
    it('converts a P2034 serialization failure into a 409 slot conflict', async () => {
      const prismaErr = new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });
      mockPrisma.$transaction.mockRejectedValueOnce(prismaErr);

      await expect((service as any).runSerializable(async () => 'ok')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INTERVIEW_SLOT_CONFLICT' },
      });
    });
  });
});
