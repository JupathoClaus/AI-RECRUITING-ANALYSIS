import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecruiterCandidateWorkflowService } from '../recruiter-candidate-workflow.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { LocalStorageProvider } from '@modules/files/providers/local-storage.provider';
import { FilesService } from '@modules/files/services/files.service';
import { CompanyCandidateService } from '@modules/applications/services/company-candidate.service';
import { ApplicationNumberService } from '@modules/applications/services/application-number.service';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { ExtractionDispatchReconcilerService } from '@modules/resume-processing/services/extraction-dispatch-reconciler.service';
import { CandidateAuditService } from '../candidate-audit.service';
import { CandidateDeduplicationService } from '../candidate-deduplication.service';

const COMPANY_ID = 'company-1';
const JOB_ID = 'job-1';
const USER_ID = 'user-1';
const MEMBERSHIP_ID = 'member-1';

const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf body');

function makeFile(name = 'resume.pdf') {
  return { buffer: PDF_BYTES, originalName: name, mimeType: 'application/pdf' };
}

function makeDto(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+15551234567',
    totalExperienceYears: 4,
    jobId: JOB_ID,
    ...overrides,
  };
}

describe('RecruiterCandidateWorkflowService', () => {
  let service: RecruiterCandidateWorkflowService;
  let prisma: any;
  let idempotencyService: any;
  let storage: any;
  let filesService: any;
  let companyCandidateService: any;
  let numberService: any;
  let applicationAudit: any;
  let candidateAudit: any;
  let deduplication: any;
  let reconciler: any;

  beforeEach(async () => {
    prisma = {
      candidate: { findFirst: jest.fn(), create: jest.fn() },
      job: { findFirst: jest.fn() },
      application: { findFirst: jest.fn(), create: jest.fn() },
      storedFile: { create: jest.fn() },
      resumeTextExtraction: { create: jest.fn() },
      extractionDispatch: { create: jest.fn() },
    };
    idempotencyService = {
      executeTransactional: jest.fn(async ({ execute }) => {
        const result = await execute(prisma);
        return { status: 'COMPLETED', resourceType: result.resourceType, resourceId: result.resourceId, responseJson: result.responseJson };
      }),
    };
    storage = {
      generateStoredName: jest.fn().mockReturnValue('uuid-name.pdf'),
      put: jest.fn().mockResolvedValue({ storageKey: `${COMPANY_ID}/uuid-name.pdf`, checksumSha256: 'sha-file', sizeBytes: PDF_BYTES.length }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    filesService = {
      validateAndGetExtension: jest.fn().mockReturnValue('pdf'),
      sanitizeFilename: jest.fn((n: string) => n),
    };
    companyCandidateService = {
      findOrCreate: jest.fn().mockResolvedValue({ id: 'cc-1' }),
    };
    numberService = { generate: jest.fn().mockResolvedValue('APP-2026-000001') };
    applicationAudit = { record: jest.fn() };
    candidateAudit = { record: jest.fn() };
    deduplication = { calculateFingerprint: jest.fn().mockReturnValue('fp-1') };
    reconciler = { dispatchOne: jest.fn().mockResolvedValue(undefined) };

    prisma.job.findFirst.mockResolvedValue({
      id: JOB_ID,
      companyId: COMPANY_ID,
      title: 'Engineer',
      status: 'PUBLISHED',
      deletedAt: null,
      applicationDeadline: null,
      pipeline: { stages: [{ id: 'stage-1', name: 'Applied', sortOrder: 0 }] },
    });
    prisma.candidate.findFirst.mockResolvedValue(null);
    prisma.candidate.create.mockResolvedValue({ id: 'cand-new' });
    prisma.application.findFirst.mockResolvedValue(null);
    prisma.application.create.mockResolvedValue({ id: 'app-new' });
    prisma.storedFile.create.mockResolvedValue({ id: 'file-new' });
    prisma.resumeTextExtraction.create.mockResolvedValue({ id: 'ex-new' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecruiterCandidateWorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: IdempotencyService, useValue: idempotencyService },
        { provide: LocalStorageProvider, useValue: storage },
        { provide: FilesService, useValue: filesService },
        { provide: CompanyCandidateService, useValue: companyCandidateService },
        { provide: ApplicationNumberService, useValue: numberService },
        { provide: ApplicationAuditService, useValue: applicationAudit },
        { provide: CandidateAuditService, useValue: candidateAudit },
        { provide: CandidateDeduplicationService, useValue: deduplication },
        { provide: ExtractionDispatchReconcilerService, useValue: reconciler },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(10 * 1024 * 1024) } },
      ],
    }).compile();
    service = module.get<RecruiterCandidateWorkflowService>(RecruiterCandidateWorkflowService);
  });

  it('rejects a missing/empty file before touching the database', async () => {
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, undefined)).rejects.toThrow(BadRequestException);
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, { buffer: Buffer.alloc(0), originalName: '', mimeType: '' })).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('creates candidate + application + file + extraction atomically and dispatches after commit', async () => {
    const result = await service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile(), 'key-1');

    expect(result.candidateCreated).toBe(true);
    expect(result.candidateId).toBe('cand-new');
    expect(result.applicationId).toBe('app-new');
    expect(result.applicationStatus).toBe('DRAFT');
    expect(result.stageName).toBe('Applied');
    expect(result.storedFileId).toBe('file-new');
    expect(result.extraction).toEqual({ id: 'ex-new', status: 'PENDING' });

    expect(storage.put).toHaveBeenCalled();
    expect(prisma.candidate.create).toHaveBeenCalledTimes(1);
    expect(companyCandidateService.findOrCreate).toHaveBeenCalledWith(COMPANY_ID, 'cand-new', 'RECRUITER_CREATED', undefined, undefined, MEMBERSHIP_ID, USER_ID, prisma);
    expect(prisma.application.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobId: JOB_ID, currentStageId: 'stage-1', status: 'DRAFT' }) }));
    expect(prisma.extractionDispatch.create).toHaveBeenCalledWith({ data: { extractionId: 'ex-new', dispatchStatus: 'PENDING_DISPATCH' } });
    expect(candidateAudit.record).toHaveBeenCalledTimes(1);
    expect(applicationAudit.record).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing candidate by normalized email without creating a duplicate (multi-job)', async () => {
    prisma.candidate.findFirst.mockResolvedValue({ id: 'cand-existing' });
    prisma.candidate.create.mockImplementation(() => { throw new Error('must not create a duplicate candidate'); });

    const result = await service.create(
      makeDto({ email: 'Jane@Example.com ' }),
      COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile(),
    );

    expect(result.candidateCreated).toBe(false);
    expect(result.candidateId).toBe('cand-existing');
    expect(prisma.candidate.create).not.toHaveBeenCalled();
    // still creates a NEW application for the new job
    expect(prisma.application.create).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate active application for the same job with APPLICATION_DUPLICATE', async () => {
    prisma.application.findFirst.mockResolvedValue({ id: 'app-existing' });
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPLICATION_DUPLICATE' }),
    });
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('rejects jobs of other companies and non-published jobs', async () => {
    prisma.job.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile())).rejects.toThrow(NotFoundException);

    prisma.job.findFirst.mockResolvedValueOnce({ id: JOB_ID, companyId: COMPANY_ID, title: 'x', status: 'CLOSED', deletedAt: null, applicationDeadline: null, pipeline: null });
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPLICATION_JOB_NOT_ACCEPTING' }),
    });
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('deletes the stored file when the workflow fails before commit', async () => {
    prisma.application.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile())).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith(`${COMPANY_ID}/uuid-name.pdf`);
  });

  it('replays the stored idempotent response without re-executing the workflow', async () => {
    idempotencyService.executeTransactional.mockResolvedValue({
      status: 'COMPLETED',
      resourceType: 'candidate-workflow',
      resourceId: 'cand-original',
      responseJson: { candidateId: 'cand-original', applicationId: 'app-original', extraction: { id: 'ex-original', status: 'PENDING' }, candidateCreated: true, applicationNumber: 'APP-2026-000009', applicationStatus: 'DRAFT', stageId: null, stageName: null, jobId: JOB_ID, jobTitle: 'Engineer', storedFileId: 'f1' },
    });

    const result = await service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile(), 'same-key');

    expect(idempotencyService.executeTransactional).toHaveBeenCalledWith(expect.objectContaining({ key: 'same-key', operation: 'RECRUITER_CANDIDATE_WORKFLOW' }));
    expect(result.candidateId).toBe('cand-original');
    expect(reconciler.dispatchOne).toHaveBeenCalledWith('ex-original');
  });

  it('surfaces IDEMPOTENCY_IN_PROGRESS while another request holds the key', async () => {
    idempotencyService.executeTransactional.mockResolvedValue({ status: 'PROCESSING', resourceType: '', resourceId: '' });
    await expect(service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile(), 'busy-key')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_IN_PROGRESS' }),
    });
  });

  it('dispatch failure after commit does not fail the request', async () => {
    reconciler.dispatchOne.mockRejectedValue(new Error('redis down'));
    const result = await service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile(), 'key-dispatch-fail');
    expect(result.candidateId).toBe('cand-new');
  });

  it('computes different request hashes for different files', async () => {
    const keys: string[] = [];
    idempotencyService.executeTransactional.mockImplementation(async (params: any) => {
      keys.push(params.requestHash);
      return { status: 'COMPLETED', resourceId: 'x', resourceType: 'candidate-workflow', responseJson: {} as never };
    });
    await service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile('a.pdf'), 'k1');
    await service.create(makeDto(), COMPANY_ID, USER_ID, MEMBERSHIP_ID, makeFile('b.pdf'), 'k2');
    expect(keys[0]).not.toBe(keys[1]);
  });
});