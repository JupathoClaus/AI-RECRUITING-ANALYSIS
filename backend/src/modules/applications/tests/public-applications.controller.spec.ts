import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PublicApplicationsController } from '../controllers/public-applications.controller';
import { PrismaService } from '@database/prisma/prisma.service';
import { CompanyCandidateService } from '../services/company-candidate.service';
import { ApplicationNumberService } from '../services/application-number.service';
import { ApplicationAuditService } from '../services/application-audit.service';
import { ScreeningAnswersService } from '../services/screening-answers.service';

const mockPrisma = {
  company: { findFirst: jest.fn() },
  job: { findFirst: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  candidate: { findFirst: jest.fn(), create: jest.fn() },
  application: { findFirst: jest.fn(), create: jest.fn() },
  applicationStageHistory: { create: jest.fn() },
  applicationScreeningAnswer: { createMany: jest.fn() },
};

const mockCompanyCandidate = { findOrCreate: jest.fn() };
const mockNumber = { generate: jest.fn() };
const mockAudit = { record: jest.fn() };
const mockScreeningAnswers = {};

describe('PublicApplicationsController', () => {
  let controller: PublicApplicationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicApplicationsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CompanyCandidateService, useValue: mockCompanyCandidate },
        { provide: ApplicationNumberService, useValue: mockNumber },
        { provide: ApplicationAuditService, useValue: mockAudit },
        { provide: ScreeningAnswersService, useValue: mockScreeningAnswers },
      ],
    }).compile();
    controller = module.get<PublicApplicationsController>(PublicApplicationsController);
  });

  const dto = {
    firstName: 'Public',
    lastName: 'Applicant',
    email: 'public-applicant@test.com',
    consentConfirmed: true,
  };

  it('accepts an application for a PUBLISHED job', async () => {
    mockPrisma.company.findFirst.mockResolvedValue({ id: 'company-1', slug: 'acme' });
    mockPrisma.job.findFirst.mockResolvedValue({
      id: 'job-1',
      title: 'Engineer',
      status: 'PUBLISHED',
      pipeline: { stages: [{ id: 'stage-1' }] },
    });
    mockPrisma.candidate.findFirst.mockResolvedValue(null);
    mockPrisma.candidate.create.mockResolvedValue({ id: 'candidate-1' });
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockCompanyCandidate.findOrCreate.mockResolvedValue({ id: 'cc-1' });
    mockNumber.generate.mockResolvedValue(1);
    mockPrisma.application.create.mockResolvedValue({
      id: 'app-1',
      publicReference: 'abc123',
      status: 'SUBMITTED',
    });

    const result = await controller.submitPublic('acme', 'engineer', dto as any);
    expect(result.status).toBe('submitted');
    // The query must only ever target PUBLISHED jobs.
    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
  });

  it('rejects an application for a CLOSED job (not found / not accepting)', async () => {
    mockPrisma.company.findFirst.mockResolvedValue({ id: 'company-1', slug: 'acme' });
    // A closed job must NOT be found by the public apply query.
    mockPrisma.job.findFirst.mockResolvedValue(null);

    await expect(controller.submitPublic('acme', 'engineer', dto as any)).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
  });

  it('rejects an application when consent is not confirmed', async () => {
    mockPrisma.company.findFirst.mockResolvedValue({ id: 'company-1', slug: 'acme' });
    mockPrisma.job.findFirst.mockResolvedValue({
      id: 'job-1',
      title: 'Engineer',
      status: 'PUBLISHED',
      pipeline: { stages: [] },
    });

    await expect(
      controller.submitPublic('acme', 'engineer', {
        firstName: 'Public',
        lastName: 'Applicant',
        email: 'public-applicant@test.com',
        consentConfirmed: false,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
