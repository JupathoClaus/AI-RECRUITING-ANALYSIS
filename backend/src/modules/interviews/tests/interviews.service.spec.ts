import { Test, TestingModule } from '@nestjs/testing';
import { InterviewsService } from '../services/interviews.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
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
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  interviewHistory: { create: jest.fn() },
  companyMembership: { findFirst: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
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
      providers: [InterviewsService, { provide: PrismaService, useValue: mockPrisma }],
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
});
