import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApplicationWorkflowService } from '../services/application-workflow.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationStatus, ApplicationActorType, PipelineStageType } from '@prisma/client';

const COMPANY_ID = 'company-1';
const APP_ID = 'app-1';

function makeApp(status: ApplicationStatus, version = 1, stageId = 'stage-1') {
  return {
    id: APP_ID,
    companyId: COMPANY_ID,
    status,
    version,
    jobId: 'job-1',
    candidateId: 'cand-1',
    currentStageId: stageId,
    deletedAt: null,
    currentStage: { id: stageId },
  };
}

describe('ApplicationWorkflowService', () => {
  let service: ApplicationWorkflowService;
  let prisma: any;
  let auditService: any;

  beforeEach(async () => {
    const txMock = {
      application: { findFirst: jest.fn(), update: jest.fn() },
      jobPipelineStage: { findFirst: jest.fn() },
      applicationStageHistory: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((fn) => fn(txMock)),
      _tx: txMock,
    };
    auditService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationWorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApplicationAuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get<ApplicationWorkflowService>(ApplicationWorkflowService);
  });

  const base = {
    applicationId: APP_ID,
    companyId: COMPANY_ID,
    actorType: ApplicationActorType.RECRUITER,
    expectedVersion: 1,
  };

  it('throws NotFoundException when application not found', async () => {
    prisma._tx.application.findFirst.mockResolvedValue(null);
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException on stale version', async () => {
    prisma._tx.application.findFirst.mockResolvedValue(makeApp(ApplicationStatus.DRAFT, 5));
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED, expectedVersion: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException for invalid status transition', async () => {
    prisma._tx.application.findFirst.mockResolvedValue(makeApp(ApplicationStatus.HIRED));
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED, expectedVersion: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows DRAFT → SUBMITTED transition', async () => {
    const app = makeApp(ApplicationStatus.DRAFT, 1);
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.SUBMITTED,
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED }),
    ).resolves.toMatchObject({ status: ApplicationStatus.SUBMITTED });
  });

  it('allows SUBMITTED → SHORTLISTED transition', async () => {
    const app = makeApp(ApplicationStatus.SUBMITTED, 1);
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.SHORTLISTED,
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.SHORTLISTED }),
    ).resolves.toMatchObject({ status: ApplicationStatus.SHORTLISTED });
  });

  it('prevents transition from terminal HIRED status', async () => {
    prisma._tx.application.findFirst.mockResolvedValue(makeApp(ApplicationStatus.HIRED, 1));
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.UNDER_REVIEW, expectedVersion: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents transition from terminal WITHDRAWN status', async () => {
    prisma._tx.application.findFirst.mockResolvedValue(makeApp(ApplicationStatus.WITHDRAWN, 1));
    await expect(
      service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED, expectedVersion: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates toStageId belongs to job pipeline', async () => {
    const app = makeApp(ApplicationStatus.SUBMITTED, 1);
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.jobPipelineStage.findFirst.mockResolvedValue(null); // stage not in pipeline
    await expect(
      service.transition({
        ...base,
        toStatus: ApplicationStatus.UNDER_REVIEW,
        toStageId: 'wrong-stage-id',
        expectedVersion: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a DRAFT application to move to a pipeline stage', async () => {
    const app = makeApp(ApplicationStatus.DRAFT, 1, 'stage-1');
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.jobPipelineStage.findFirst.mockResolvedValue({
      id: 'stage-2',
      type: PipelineStageType.SCREENING,
    });
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.SCREENING,
      currentStageId: 'stage-2',
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    const result = await service.transition({
      ...base,
      toStatus: ApplicationStatus.UNDER_REVIEW,
      toStageId: 'stage-2',
    });
    expect(result.status).toBe(ApplicationStatus.SCREENING);
    expect(prisma._tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApplicationStatus.SCREENING,
          currentStageId: 'stage-2',
        }),
      }),
    );
  });

  it('derives OFFER status when moving to an Offer stage', async () => {
    const app = makeApp(ApplicationStatus.DRAFT, 1, 'stage-1');
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.jobPipelineStage.findFirst.mockResolvedValue({
      id: 'stage-4',
      type: PipelineStageType.OFFER,
    });
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.OFFER,
      currentStageId: 'stage-4',
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    const result = await service.transition({
      ...base,
      toStatus: ApplicationStatus.UNDER_REVIEW,
      toStageId: 'stage-4',
    });
    expect(result.status).toBe(ApplicationStatus.OFFER);
  });

  it('derives HIRED status and records hire time when moving to the Hired stage', async () => {
    const app = makeApp(ApplicationStatus.DRAFT, 1, 'stage-1');
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.jobPipelineStage.findFirst.mockResolvedValue({
      id: 'stage-5',
      type: PipelineStageType.HIRED,
    });
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.HIRED,
      currentStageId: 'stage-5',
      version: 2,
      hiredAt: new Date(),
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    const result = await service.transition({
      ...base,
      toStatus: ApplicationStatus.UNDER_REVIEW,
      toStageId: 'stage-5',
    });
    expect(result.status).toBe(ApplicationStatus.HIRED);
    const updateCall = prisma._tx.application.update.mock.calls[0][0];
    expect(updateCall.data.hiredAt).toBeDefined();
  });

  it('prevents stage moves from terminal statuses', async () => {
    prisma._tx.application.findFirst.mockResolvedValue(
      makeApp(ApplicationStatus.HIRED, 1, 'stage-1'),
    );
    await expect(
      service.transition({
        ...base,
        toStatus: ApplicationStatus.UNDER_REVIEW,
        toStageId: 'stage-2',
        expectedVersion: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes stage history on each transition', async () => {
    const app = makeApp(ApplicationStatus.DRAFT, 1);
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.SUBMITTED,
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    await service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED });
    expect(prisma._tx.applicationStageHistory.create).toHaveBeenCalledTimes(1);
  });

  it('WITHDRAWN is distinct from REJECTED', async () => {
    const submitted = makeApp(ApplicationStatus.SUBMITTED, 1);
    prisma._tx.application.findFirst.mockResolvedValue(submitted);
    prisma._tx.application.update.mockResolvedValue({
      ...submitted,
      status: ApplicationStatus.WITHDRAWN,
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    const result = await service.transition({ ...base, toStatus: ApplicationStatus.WITHDRAWN });
    expect(result.status).toBe(ApplicationStatus.WITHDRAWN);
  });

  it('records audit event on each transition', async () => {
    const app = makeApp(ApplicationStatus.DRAFT, 1);
    prisma._tx.application.findFirst.mockResolvedValue(app);
    prisma._tx.application.update.mockResolvedValue({
      ...app,
      status: ApplicationStatus.SUBMITTED,
      version: 2,
    });
    prisma._tx.applicationStageHistory.create.mockResolvedValue({});
    await service.transition({ ...base, toStatus: ApplicationStatus.SUBMITTED });
    expect(auditService.record).toHaveBeenCalledTimes(1);
  });
});
