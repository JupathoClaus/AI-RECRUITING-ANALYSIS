import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { JobWorkflowService } from '../job-workflow.service';
import { JobActivityService } from '../job-activity.service';
import {
  JobStatus,
  JobApprovalStatus,
  JobActivityEventType,
  JobPublicationStatus,
} from '@prisma/client';

describe('JobWorkflowService', () => {
  let service: JobWorkflowService;
  let prisma: any;
  let jobActivityService: any;

  const mockPrismaService = {
    job: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    jobApproval: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
  };

  const mockJobActivityService = {
    record: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobWorkflowService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JobActivityService, useValue: mockJobActivityService },
      ],
    }).compile();

    service = module.get<JobWorkflowService>(JobWorkflowService);
    prisma = mockPrismaService;
    jobActivityService = mockJobActivityService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Valid transitions ─────────────────────────────────────────────────────────
  describe('transition', () => {
    it('should accept DRAFT -> PENDING_APPROVAL', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        title: 'Test Job',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.transition('company-1', 'job-1', JobStatus.PENDING_APPROVAL, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ status: JobStatus.PENDING_APPROVAL }),
        }),
      );
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.JOB_SUBMITTED_FOR_APPROVAL,
        }),
      );
    });

    it('should accept DRAFT -> PUBLISHED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.transition('company-1', 'job-1', JobStatus.PUBLISHED, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.PUBLISHED,
            publicationStatus: JobPublicationStatus.PUBLISHED,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should accept PUBLISHED -> PAUSED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.transition('company-1', 'job-1', JobStatus.PAUSED, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.PAUSED }),
        }),
      );
    });

    it('should accept PAUSED -> PUBLISHED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PAUSED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.transition('company-1', 'job-1', JobStatus.PUBLISHED, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.PUBLISHED }) }),
      );
    });

    it('should accept PUBLISHED -> CLOSED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.transition('company-1', 'job-1', JobStatus.CLOSED, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.CLOSED,
            closedAt: expect.any(Date),
            publicationStatus: JobPublicationStatus.UNPUBLISHED,
          }),
        }),
      );
    });

    it('should accept CLOSED -> DRAFT', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.CLOSED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.transition('company-1', 'job-1', JobStatus.DRAFT, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.DRAFT }) }),
      );
    });

    // ─── Invalid transitions ───────────────────────────────────────────────────────
    it('should reject invalid transition with BadRequestException', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await expect(
        service.transition('company-1', 'job-1', JobStatus.DRAFT, 'mem-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transition from ARCHIVED to PUBLISHED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.ARCHIVED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await expect(
        service.transition('company-1', 'job-1', JobStatus.PUBLISHED, 'mem-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submitForApproval ─────────────────────────────────────────────────────────
  describe('submitForApproval', () => {
    it('should create approval record and change status', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
      });
      prisma.jobApproval.create.mockResolvedValue({ id: 'approval-1' });

      await service.submitForApproval('company-1', 'job-1', 'approver-1', 'mem-1', 'user-1');

      expect(prisma.jobApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobId: 'job-1',
            assignedApproverMembershipId: 'approver-1',
            status: JobApprovalStatus.PENDING,
          }),
        }),
      );
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: JobStatus.PENDING_APPROVAL,
            approvalStatus: JobApprovalStatus.PENDING,
          }),
        }),
      );
      expect(jobActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: JobActivityEventType.JOB_SUBMITTED_FOR_APPROVAL,
        }),
      );
    });

    it('should reject if job not in DRAFT', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
      });

      await expect(
        service.submitForApproval('company-1', 'job-1', 'approver-1', 'mem-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── approve ───────────────────────────────────────────────────────────────────
  describe('approve', () => {
    it('should update approval and job status to APPROVED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PENDING_APPROVAL,
        approvalStatus: JobApprovalStatus.PENDING,
      });
      prisma.jobApproval.findFirst.mockResolvedValue({
        id: 'approval-1',
        jobId: 'job-1',
        status: JobApprovalStatus.PENDING,
        assignedApproverMembershipId: 'mem-1',
      });

      await service.approve('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.jobApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'approval-1' },
          data: expect.objectContaining({
            status: JobApprovalStatus.APPROVED,
            reviewedByMembershipId: 'mem-1',
            reviewedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.APPROVED,
            approvalStatus: JobApprovalStatus.APPROVED,
          }),
        }),
      );
    });

    it('should reject if not pending approval', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
      });

      await expect(service.approve('company-1', 'job-1', 'mem-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── reject ────────────────────────────────────────────────────────────────────
  describe('reject', () => {
    it('should update approval and return job to DRAFT', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PENDING_APPROVAL,
        approvalStatus: JobApprovalStatus.PENDING,
      });
      prisma.jobApproval.findFirst.mockResolvedValue({
        id: 'approval-1',
        jobId: 'job-1',
        status: JobApprovalStatus.PENDING,
        assignedApproverMembershipId: 'mem-1',
      });

      await service.reject('company-1', 'job-1', 'mem-1', 'user-1', 'Not good enough');

      expect(prisma.jobApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'approval-1' },
          data: expect.objectContaining({ status: JobApprovalStatus.REJECTED }),
        }),
      );
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.DRAFT,
            approvalStatus: JobApprovalStatus.NOT_REQUIRED,
          }),
        }),
      );
    });
  });

  // ─── requestChanges ────────────────────────────────────────────────────────────
  describe('requestChanges', () => {
    it('should set approval to CHANGES_REQUESTED and return to DRAFT', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PENDING_APPROVAL,
        approvalStatus: JobApprovalStatus.PENDING,
      });
      prisma.jobApproval.findFirst.mockResolvedValue({
        id: 'approval-1',
        jobId: 'job-1',
        status: JobApprovalStatus.PENDING,
        assignedApproverMembershipId: 'mem-1',
      });

      await service.requestChanges('company-1', 'job-1', 'mem-1', 'user-1', 'Please fix');

      expect(prisma.jobApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'approval-1' },
          data: expect.objectContaining({ status: JobApprovalStatus.CHANGES_REQUESTED }),
        }),
      );
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.DRAFT }),
        }),
      );
    });
  });

  // ─── schedulePublish ───────────────────────────────────────────────────────────
  describe('schedulePublish', () => {
    it('should schedule publish with future timestamp', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 7);
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.APPROVED,
        approvalStatus: JobApprovalStatus.APPROVED,
      });

      await service.schedulePublish('company-1', 'job-1', futureDate, 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.SCHEDULED,
            scheduledPublishAt: futureDate,
          }),
        }),
      );
    });

    it('should reject past timestamp', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      await expect(
        service.schedulePublish('company-1', 'job-1', pastDate, 'mem-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if not yet approved', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 7);
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
      });

      await expect(
        service.schedulePublish('company-1', 'job-1', futureDate, 'mem-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── publish (requires approval) ───────────────────────────────────────────────
  describe('publish', () => {
    it('should require APPROVED status when company settings require approval', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.APPROVED,
        approvalStatus: JobApprovalStatus.APPROVED,
        company: { settings: { requireJobApproval: true } },
      });

      await service.publish('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.PUBLISHED }),
        }),
      );
    });

    it('should reject if job not approved when settings require approval', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
        company: { settings: { requireJobApproval: true } },
      });

      await expect(service.publish('company-1', 'job-1', 'mem-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow DRAFT -> PUBLISHED when approval not required', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
        company: { settings: { requireJobApproval: false } },
      });

      await service.publish('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.PUBLISHED }),
        }),
      );
    });
  });

  // ─── Convenience methods ───────────────────────────────────────────────────────
  describe('convenience methods', () => {
    it('close should call transition to CLOSED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.close('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.CLOSED }) }),
      );
    });

    it('pause should call transition to PAUSED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.pause('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.PAUSED }) }),
      );
    });

    it('resume should call transition to PUBLISHED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PAUSED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.resume('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.PUBLISHED }) }),
      );
    });

    it('fill should call transition to FILLED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.PUBLISHED,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.fill('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.FILLED }) }),
      );
    });

    it('cancel should call transition to CANCELLED', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        companyId: 'company-1',
        status: JobStatus.DRAFT,
        title: 'Test',
        jobCode: 'JOB-001',
        deletedAt: null,
      });

      await service.cancel('company-1', 'job-1', 'mem-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: JobStatus.CANCELLED }) }),
      );
    });
  });
});
