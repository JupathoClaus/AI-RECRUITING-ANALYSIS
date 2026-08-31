import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicApplicationSubmissionService } from '../services/public-application-submission.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { LocalStorageProvider } from '@modules/files/providers/local-storage.provider';
import { CompanyCandidateService } from '../services/company-candidate.service';
import { ApplicationNumberService } from '../services/application-number.service';
import { ApplicationAuditService } from '../services/application-audit.service';

const COMPANY_ID = 'company-1';
const JOB_ID = 'job-1';

const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf body');

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: '3f2b8a5e-1c4d-4e5f-8a9b-0c1d2e3f4a5b',
    firstName: 'Public',
    lastName: 'Applicant',
    email: 'public-applicant@test.com',
    consentConfirmed: true,
    ...overrides,
  };
}

function publishedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    title: 'Engineer',
    pipeline: { stages: [{ id: 'stage-1', name: 'Applied', type: 'APPLIED', sortOrder: 0 }] },
    screeningQuestions: [{ id: 'q-1' }, { id: 'q-2' }],
    ...overrides,
  };
}

function makeJobWithPipeline(
  stages: Array<{ id: string; name: string; type: string; sortOrder: number }>,
) {
  return {
    id: JOB_ID,
    title: 'Engineer',
    pipeline: { stages },
    screeningQuestions: [{ id: 'q-1' }, { id: 'q-2' }],
  };
}

describe('PublicApplicationSubmissionService', () => {
  let service: PublicApplicationSubmissionService;
  let prisma: any;
  let storage: any;
  let companyCandidateService: any;
  let numberService: any;
  let auditService: any;

  beforeEach(async () => {
    type JobWithPipeline = {
      id: string;
      title: string;
      pipeline?: { stages: Array<{ id: string; name: string; type: string; sortOrder: number }> };
      screeningQuestions: Array<{ id: string }>;
    };

    prisma = {
      company: { findFirst: jest.fn().mockResolvedValue({ id: COMPANY_ID }) },
      job: {
        findFirst: jest.fn().mockResolvedValue(publishedJob()) as jest.Mock<
          Promise<JobWithPipeline>
        >,
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cand-new' }),
      },
      application: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'app-new' }),
      },
      applicationStageHistory: { create: jest.fn() },
      applicationScreeningAnswer: { createMany: jest.fn() },
      storedFile: {
        create: jest.fn().mockResolvedValue({ id: 'file-new', checksumSha256: 'sha-cv' }),
      },
      resumeTextExtraction: { create: jest.fn().mockResolvedValue({ id: 'ex-new' }) },
      extractionDispatch: { create: jest.fn() },
    };
    storage = {
      put: jest.fn().mockResolvedValue({
        storageKey: `${COMPANY_ID}/cv.pdf`,
        checksumSha256: 'sha-cv',
        sizeBytes: PDF_BYTES.length,
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    companyCandidateService = { findOrCreate: jest.fn().mockResolvedValue({ id: 'cc-1' }) };
    numberService = { generate: jest.fn().mockResolvedValue('APP-2026-000042') };
    auditService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicApplicationSubmissionService,
        { provide: PrismaService, useValue: prisma },
        { provide: LocalStorageProvider, useValue: storage },
        { provide: CompanyCandidateService, useValue: companyCandidateService },
        { provide: ApplicationNumberService, useValue: numberService },
        { provide: ApplicationAuditService, useValue: auditService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(10 * 1024 * 1024) } },
      ],
    }).compile();
    service = module.get<PublicApplicationSubmissionService>(PublicApplicationSubmissionService);
  });

  it('creates candidate + SUBMITTED application + CV + extraction atomically', async () => {
    const result = await service.submit('acme', 'engineer', baseInput(), {
      buffer: PDF_BYTES,
      originalName: 'my cv.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.status).toBe('submitted');
    expect(result.resumeAttached).toBe(true);
    expect(result.applicationNumber).toBe('APP-2026-000042');
    expect(result.publicReference).toHaveLength(32);

    expect(prisma.candidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'CAREERS_PAGE',
          normalizedEmail: 'public-applicant@test.com',
        }),
      }),
    );
    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUBMITTED',
          jobId: JOB_ID,
          currentStageId: 'stage-1',
          consentConfirmed: true,
        }),
      }),
    );
    expect(prisma.storedFile.create).toHaveBeenCalled();
    // pending extraction + dispatch queued in the same transaction
    expect(prisma.resumeTextExtraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', storedFileId: 'file-new' }),
      }),
    );
    expect(prisma.extractionDispatch.create).toHaveBeenCalledWith({
      data: { extractionId: 'ex-new', dispatchStatus: 'PENDING_DISPATCH' },
    });
    expect(auditService.record).toHaveBeenCalled();
  });

  it('reuses an existing candidate by normalized email for a NEW job', async () => {
    prisma.candidate.findFirst.mockResolvedValue({ id: 'cand-existing' });
    prisma.candidate.create.mockImplementation(() => {
      throw new Error('must not duplicate the candidate');
    });

    const result = await service.submit('acme', 'engineer', baseInput());

    expect(prisma.candidate.create).not.toHaveBeenCalled();
    expect(companyCandidateService.findOrCreate).toHaveBeenCalledWith(
      COMPANY_ID,
      'cand-existing',
      'CAREERS_PAGE',
      undefined,
      undefined,
      undefined,
      undefined,
      prisma,
    );
    expect(prisma.application.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('submitted');
  });

  it('returns the existing reference without creating anything on duplicate submission', async () => {
    prisma.application.findFirst.mockResolvedValue({
      publicReference: 'existing-ref',
      applicationNumber: 'APP-2026-000001',
    });

    const result = await service.submit('acme', 'engineer', baseInput(), {
      buffer: PDF_BYTES,
      originalName: 'cv.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.status).toBe('pending_review');
    expect(result.publicReference).toBe('existing-ref');
    expect(prisma.application.create).not.toHaveBeenCalled();
    expect(prisma.storedFile.create).not.toHaveBeenCalled();
  });

  it('only queries PUBLISHED jobs — closed/deleted jobs are not applicable', async () => {
    prisma.job.findFirst.mockResolvedValue(null);

    await expect(service.submit('acme', 'closed-role', baseInput())).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED', deletedAt: null, archivedAt: null }),
      }),
    );
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('rejects applications against another company through forged slugs', async () => {
    prisma.job.findFirst.mockImplementation(async ({ where }: any) => {
      if (!where.companyId) throw new Error('tenant scoping missing');
      return null;
    });

    await expect(service.submit('acme', 'other-companies-job', baseInput())).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: COMPANY_ID }),
      }),
    );
  });

  it('requires consent', async () => {
    await expect(
      service.submit('acme', 'engineer', baseInput({ consentConfirmed: false })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPLICATION_CONSENT_REQUIRED' }),
    });
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('silently accepts (and ignores) honeypot submissions without touching the database', async () => {
    const result = await service.submit(
      'acme',
      'engineer',
      baseInput({ websiteUrl: 'http://spam.example' }),
    );

    expect(result.status).toBe('submitted');
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('stores ONLY answers that belong to this job (forged question ids are dropped)', async () => {
    await service.submit(
      'acme',
      'engineer',
      baseInput({
        screeningAnswers: [
          { questionId: 'q-1', textAnswer: 'Yes' },
          { questionId: 'q-forged-other-job', textAnswer: 'injected' },
        ],
      }),
    );

    expect(prisma.applicationScreeningAnswer.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ questionId: 'q-1' })],
      }),
    );
  });

  it('cleans up the stored CV when the transaction fails (no orphan bytes)', async () => {
    prisma.application.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.submit('acme', 'engineer', baseInput(), {
        buffer: PDF_BYTES,
        originalName: 'cv.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('db down');

    expect(storage.delete).toHaveBeenCalledWith(`${COMPANY_ID}/cv.pdf`);
  });

  it('rejects a fake PDF before any database write', async () => {
    await expect(
      service.submit('acme', 'engineer', baseInput(), {
        buffer: Buffer.from('<html>not a pdf</html>'),
        originalName: 'fake.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.candidate.create).not.toHaveBeenCalled();
  });

  it('assigns first pipeline stage to new public application', async () => {
    const jobWithPipeline = makeJobWithPipeline([
      { id: 'stage-applied', name: 'Applied', type: 'APPLIED', sortOrder: 0 },
      { id: 'stage-screening', name: 'Screening', type: 'SCREENING', sortOrder: 1 },
    ]);
    prisma.job.findFirst.mockResolvedValue(jobWithPipeline);

    const result = await service.submit('acme', 'engineer', baseInput(), {
      buffer: PDF_BYTES,
      originalName: 'my cv.pdf',
      mimeType: 'application/pdf',
    });

    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStageId: 'stage-applied',
          status: 'SUBMITTED',
        }),
      }),
    );
    expect(prisma.applicationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStageId: 'stage-applied' }),
      }),
    );
  });

  it('assigns first pipeline stage by sortOrder even if not first in array', async () => {
    const jobWithUnorderedStages = makeJobWithPipeline([
      { id: 'stage-screening', name: 'Screening', type: 'SCREENING', sortOrder: 1 },
      { id: 'stage-applied', name: 'Applied', type: 'APPLIED', sortOrder: 0 },
    ]);
    prisma.job.findFirst.mockResolvedValue(jobWithUnorderedStages);

    const result = await service.submit('acme', 'engineer', baseInput(), {
      buffer: PDF_BYTES,
      originalName: 'cv.pdf',
      mimeType: 'application/pdf',
    });

    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStageId: 'stage-applied',
        }),
      }),
    );
  });
});
