import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { isPathInside, resolveTestUploadDir } from './env/test-upload-dir';

const prisma = new PrismaClient();
const PDF_BYTES = Buffer.from('%PDF-1.4\n% synthetic e2e resume\n1 0 obj\n<<>>\nendobj\n');
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const COMPANY_SLUG = `public-e2e-${SUFFIX}`;
const VALID_EMAIL = `public.e2e.${SUFFIX}@example.test`;
const EXPIRED_EMAIL = `expired.e2e.${SUFFIX}@example.test`;
const INVALID_EMAIL = `invalid.e2e.${SUFFIX}@example.test`;

function unwrap<T>(body: any): T {
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

describe('Public candidate application journey (e2e)', () => {
  let app: INestApplication;
  let uploadDir: string;
  let companyId: string;
  let userId: string;
  let membershipId: string;
  let jobId: string;
  let expiredJobId: string;
  let stageId: string;
  let screeningQuestionId: string;
  let publicReference: string;

  beforeAll(async () => {
    const configuredUploadDir = process.env.UPLOAD_DIR;
    if (!configuredUploadDir) {
      throw new Error('UPLOAD_DIR must be set to an isolated test directory');
    }
    uploadDir = configuredUploadDir;

    const role = await prisma.role.findFirstOrThrow({ where: { code: 'COMPANY_ADMIN' } });
    const company = await prisma.company.create({
      data: { name: `Public E2E ${SUFFIX}`, slug: COMPANY_SLUG, status: 'ACTIVE' },
    });
    companyId = company.id;

    const user = await prisma.user.create({
      data: {
        email: `owner.${SUFFIX}@example.test`,
        normalizedEmail: `owner.${SUFFIX}@example.test`,
        passwordHash: 'synthetic-not-a-real-hash',
        firstName: 'Public',
        lastName: 'Owner',
      },
    });
    userId = user.id;

    const membership = await prisma.companyMembership.create({
      data: { userId, companyId, roleId: role.id, status: 'ACTIVE' },
    });
    membershipId = membership.id;

    const job = await prisma.job.create({
      data: {
        companyId,
        jobCode: `PUB-${SUFFIX}`,
        slug: `public-job-${SUFFIX}`,
        title: 'Public E2E Engineer',
        employmentType: 'FULL_TIME',
        workplaceType: 'REMOTE',
        experienceLevel: 'MID',
        description: 'Synthetic public application e2e job',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        publicationStatus: 'PUBLISHED',
        approvalStatus: 'NOT_REQUIRED',
        publishedAt: new Date(),
        createdByMembershipId: membershipId,
        ownerMembershipId: membershipId,
      },
    });
    jobId = job.id;

    const pipeline = await prisma.jobPipeline.create({
      data: { jobId, name: 'Public E2E Pipeline', createdByMembershipId: membershipId },
    });
    const stage = await prisma.jobPipelineStage.create({
      data: { pipelineId: pipeline.id, name: 'Applied', type: 'APPLIED', sortOrder: 0 },
    });
    stageId = stage.id;

    const question = await prisma.jobScreeningQuestion.create({
      data: {
        jobId,
        question: 'Are you authorized to work in this location?',
        type: 'YES_NO',
        sortOrder: 0,
      },
    });
    screeningQuestionId = question.id;

    const expiredJob = await prisma.job.create({
      data: {
        companyId,
        jobCode: `EXP-${SUFFIX}`,
        slug: `expired-job-${SUFFIX}`,
        title: 'Expired Public E2E Job',
        employmentType: 'FULL_TIME',
        workplaceType: 'REMOTE',
        experienceLevel: 'MID',
        description: 'Synthetic expired public application e2e job',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        publicationStatus: 'PUBLISHED',
        approvalStatus: 'NOT_REQUIRED',
        publishedAt: new Date(Date.now() - 86_400_000),
        applicationDeadline: new Date(Date.now() - 60_000),
        createdByMembershipId: membershipId,
        ownerMembershipId: membershipId,
      },
    });
    expiredJobId = expiredJob.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 120000);

  it('uses an isolated upload directory outside backend/uploads', () => {
    const configuredUploadDir = app.get(ConfigService).get<string>('app.uploadDir');
    const effectiveUploadDir = path.resolve(configuredUploadDir || '');
    const developmentUploadDir = path.resolve(__dirname, '..', 'uploads');

    expect(effectiveUploadDir).toBe(path.resolve(uploadDir));
    expect(isPathInside(developmentUploadDir, effectiveUploadDir)).toBe(false);
  });

  it('creates unique default upload directories outside backend/uploads', () => {
    const developmentUploadDir = path.resolve(__dirname, '..', 'uploads');
    const first = resolveTestUploadDir(undefined, developmentUploadDir);
    const second = resolveTestUploadDir(undefined, developmentUploadDir);

    try {
      expect(first).not.toBe(second);
      expect(fs.existsSync(first)).toBe(true);
      expect(fs.existsSync(second)).toBe(true);
      expect(path.dirname(first)).toBe(path.resolve(tmpdir()));
      expect(path.dirname(second)).toBe(path.resolve(tmpdir()));
      expect(isPathInside(developmentUploadDir, first)).toBe(false);
      expect(isPathInside(developmentUploadDir, second)).toBe(false);
    } finally {
      fs.rmSync(first, { recursive: true, force: true });
      fs.rmSync(second, { recursive: true, force: true });
    }
  });

  it('replaces a caller-supplied upload directory inside backend/uploads', () => {
    const developmentUploadDir = path.resolve(__dirname, '..', 'uploads');
    const unsafeUploadDir = path.join(developmentUploadDir, 'parallel-run');
    const isolatedUploadDir = resolveTestUploadDir(unsafeUploadDir, developmentUploadDir);

    try {
      expect(isolatedUploadDir).not.toBe(unsafeUploadDir);
      expect(isPathInside(developmentUploadDir, isolatedUploadDir)).toBe(false);
      expect(fs.existsSync(isolatedUploadDir)).toBe(true);
    } finally {
      fs.rmSync(isolatedUploadDir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    const applications = await prisma.application.findMany({
      where: { companyId },
      select: { id: true },
    });
    const applicationIds = applications.map((item) => item.id);

    const extractions = await prisma.resumeTextExtraction.findMany({
      where: { companyId },
      select: { id: true },
    });
    const extractionIds = extractions.map((item) => item.id);
    if (extractionIds.length > 0) {
      await prisma.extractionDispatch.deleteMany({
        where: { extractionId: { in: extractionIds } },
      });
    }

    await prisma.resumeTextExtraction.deleteMany({ where: { companyId } });
    await prisma.storedFile.deleteMany({ where: { companyId } });
    if (applicationIds.length > 0) {
      await prisma.applicationAuditEvent.deleteMany({
        where: { applicationId: { in: applicationIds } },
      });
      await prisma.applicationStageHistory.deleteMany({
        where: { applicationId: { in: applicationIds } },
      });
      await prisma.applicationScreeningAnswer.deleteMany({
        where: { applicationId: { in: applicationIds } },
      });
    }
    await prisma.application.deleteMany({ where: { companyId } });
    await prisma.applicationAuditEvent.deleteMany({ where: { companyId } });
    await prisma.applicationCounter.deleteMany({ where: { companyId } });
    await prisma.companyCandidate.deleteMany({ where: { companyId } });

    const jobIds = [jobId, expiredJobId].filter(Boolean) as string[];
    if (jobIds.length > 0) {
      await prisma.jobScreeningQuestion.deleteMany({ where: { jobId: { in: jobIds } } });
      const pipelines = await prisma.jobPipeline.findMany({
        where: { jobId: { in: jobIds } },
        select: { id: true },
      });
      const pipelineIds = pipelines.map((item) => item.id);
      if (pipelineIds.length > 0) {
        await prisma.jobPipelineStage.deleteMany({
          where: { pipelineId: { in: pipelineIds } },
        });
        await prisma.jobPipeline.deleteMany({ where: { id: { in: pipelineIds } } });
      }
      await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    }

    await prisma.candidate.deleteMany({
      where: { normalizedEmail: { in: [VALID_EMAIL, EXPIRED_EMAIL, INVALID_EMAIL] } },
    });
    if (membershipId) {
      await prisma.companyMembership.deleteMany({ where: { id: membershipId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (companyId) {
      await prisma.company.deleteMany({ where: { id: companyId } });
      fs.rmSync(path.join(uploadDir, companyId), { recursive: true, force: true });
    }

    await prisma.$disconnect();
  }, 120000);

  it('accepts a valid application with a CV and persists application, file, extraction and audit', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/companies/${COMPANY_SLUG}/jobs/public-job-${SUFFIX}/applications`)
      .field('idempotencyKey', randomUUID())
      .field('firstName', 'Synthetic')
      .field('lastName', 'Applicant')
      .field('email', VALID_EMAIL)
      .field('consentConfirmed', 'true')
      .field(
        'screeningAnswers',
        JSON.stringify([
          { questionId: screeningQuestionId, textAnswer: 'Yes' },
          { questionId: randomUUID(), textAnswer: 'injected' },
        ]),
      )
      .attach('file', PDF_BYTES, { filename: 'synthetic-cv.pdf', contentType: 'application/pdf' });

    if (response.status !== 201) {
      throw new Error(`Expected 201 but got ${response.status}: ${JSON.stringify(response.body)}`);
    }

    const payload = unwrap<{
      publicReference: string;
      applicationNumber: string;
      status: string;
      resumeAttached: boolean;
    }>(response.body);

    expect(payload.status).toBe('submitted');
    expect(payload.resumeAttached).toBe(true);
    expect(payload.publicReference).toMatch(/^[a-f0-9]{32}$/);
    expect(payload.applicationNumber).toMatch(/^APP-\d{4}-\d{6}$/);
    publicReference = payload.publicReference;

    const application = await prisma.application.findUniqueOrThrow({
      where: { publicReference },
    });
    expect(application.companyId).toBe(companyId);
    expect(application.jobId).toBe(jobId);
    expect(application.status).toBe('SUBMITTED');
    expect(application.currentStageId).toBe(stageId);
    expect(application.consentConfirmed).toBe(true);

    const storedFile = await prisma.storedFile.findFirstOrThrow({
      where: { applicationId: application.id },
    });
    expect(storedFile.category).toBe('RESUME');
    expect(storedFile.mimeType).toBe('application/pdf');
    expect(storedFile.sizeBytes).toBe(PDF_BYTES.length);
    expect(fs.existsSync(path.join(uploadDir, storedFile.storageKey))).toBe(true);

    const extraction = await prisma.resumeTextExtraction.findFirst({
      where: { storedFileId: storedFile.id },
      select: { status: true },
    });
    expect(extraction).not.toBeNull();
    expect(['PENDING', 'PROCESSING', 'COMPLETED']).toContain(extraction?.status);

    const audit = await prisma.applicationAuditEvent.findFirst({
      where: { applicationId: application.id, eventType: 'APPLICATION_SUBMITTED' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.companyId).toBe(companyId);
    expect(audit?.actorType).toBe('CANDIDATE');

    const answers = await prisma.applicationScreeningAnswer.findMany({
      where: { applicationId: application.id },
      select: { questionId: true },
    });
    expect(answers).toHaveLength(1);
    expect(answers[0].questionId).toBe(screeningQuestionId);

    const statusResponse = await request(app.getHttpServer())
      .get(`/api/v1/public/applications/${publicReference}/status`)
      .expect(200);
    const statusPayload = unwrap<Record<string, unknown>>(statusResponse.body);
    expect(statusPayload.status).toBe('received');
    expect(Object.keys(statusPayload).sort()).toEqual(['status', 'submittedAt']);
  }, 60000);

  it('returns the existing reference on duplicate submission without creating a second application', async () => {
    const before = fs.existsSync(path.join(uploadDir, companyId))
      ? fs.readdirSync(path.join(uploadDir, companyId)).length
      : 0;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/companies/${COMPANY_SLUG}/jobs/public-job-${SUFFIX}/applications`)
      .field('idempotencyKey', randomUUID())
      .field('firstName', 'Synthetic')
      .field('lastName', 'Applicant')
      .field('email', VALID_EMAIL)
      .field('consentConfirmed', 'true')
      .attach('file', PDF_BYTES, { filename: 'synthetic-cv.pdf', contentType: 'application/pdf' })
      .expect(201);

    const payload = unwrap<{ publicReference: string; status: string }>(response.body);
    expect(payload.status).toBe('pending_review');
    expect(payload.publicReference).toBe(publicReference);

    const count = await prisma.application.count({ where: { companyId } });
    expect(count).toBe(1);

    const after = fs.existsSync(path.join(uploadDir, companyId))
      ? fs.readdirSync(path.join(uploadDir, companyId)).length
      : 0;
    expect(after).toBe(before);
  }, 60000);

  it('rejects an expired job with a safe not-accepting error', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/companies/${COMPANY_SLUG}/jobs/expired-job-${SUFFIX}/applications`)
      .field('idempotencyKey', randomUUID())
      .field('firstName', 'Expired')
      .field('lastName', 'Applicant')
      .field('email', EXPIRED_EMAIL)
      .field('consentConfirmed', 'true')
      .expect(404);

    expect(response.body.errorCode).toBe('APPLICATION_JOB_NOT_ACCEPTING');

    const application = await prisma.application.findFirst({
      where: { candidate: { normalizedEmail: EXPIRED_EMAIL } },
    });
    expect(application).toBeNull();
  }, 60000);

  it('rejects a spoofed CV signature before persistence or storage', async () => {
    const before = fs.existsSync(path.join(uploadDir, companyId))
      ? fs.readdirSync(path.join(uploadDir, companyId)).length
      : 0;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/companies/${COMPANY_SLUG}/jobs/public-job-${SUFFIX}/applications`)
      .field('idempotencyKey', randomUUID())
      .field('firstName', 'Invalid')
      .field('lastName', 'Applicant')
      .field('email', INVALID_EMAIL)
      .field('consentConfirmed', 'true')
      .attach('file', Buffer.from('<html>not a pdf</html>'), {
        filename: 'spoofed.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(response.body.message).toContain('FILE_SIGNATURE_MISMATCH');

    const application = await prisma.application.findFirst({
      where: { candidate: { normalizedEmail: INVALID_EMAIL } },
    });
    expect(application).toBeNull();

    const after = fs.existsSync(path.join(uploadDir, companyId))
      ? fs.readdirSync(path.join(uploadDir, companyId)).length
      : 0;
    expect(after).toBe(before);
  }, 60000);
});
