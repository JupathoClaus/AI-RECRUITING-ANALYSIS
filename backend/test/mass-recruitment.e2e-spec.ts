import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/database/prisma/prisma.service';

/**
 * Mass-recruitment load proof (gated: run with MASS_RECRUITMENT=1).
 * 1000 real applications → bulk assignment (500/request) → the queue must
 * report truthful counts (assigned/skipped/failed), deduplicate a re-run
 * completely, persist exactly one assignment + session per application,
 * produce unique access codes, and fan out one email job per assignment.
 */
const RUN_MASS = process.env.MASS_RECRUITMENT === '1';

const describeGuard = RUN_MASS ? describe : describe.skip;

describeGuard('Mass recruitment (gated, MASS_RECRUITMENT=1)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let emailQueue: Queue;

  let tokenA: string;
  let companyIdA: string;
  let membershipIdA: string;

  const emailA = `mass-a-${Date.now()}@e2e.com`;
  const TOTAL = 1000;
  const applicationIds = Array.from({ length: TOTAL }, () => randomUUID());

  async function createApplicationsRaw() {
    const nowStr = new Date().toISOString();
    const stamps = applicationIds.map((_, i) => `M${Date.now()}${i}`);
    const jobs = applicationIds
      .map((id, i) => {
        const stamp = stamps[i];
        return (
          `('JOB-${stamp}', '${companyIdA}', 'JC-${stamp}', 'mass-slug-${stamp}', 'Systems Administrator', 'FULL_TIME', 'ON_SITE', 'MID', 'x', '${membershipIdA}', '${membershipIdA}', '${nowStr}', '${nowStr}'),`
        );
      })
      .join('\n');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ${jobs.slice(0, -1)}`);

    const candidates = applicationIds
      .map((id, i) => `('cand-${id}', 'Mass', 'Load', 'cand-${id}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')`)
      .join(',');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ${candidates}`);

    const ccs = applicationIds.map((id) => `('cc-${id}', '${companyIdA}', 'cand-${id}', 'RECRUITER_CREATED', '${nowStr}')`).join(',');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ${ccs}`);

    const apps = applicationIds
      .map((id, i) => {
        const stamp = stamps[i];
        return `('${id}', '${companyIdA}', 'JOB-${stamp}', 'cand-${id}', 'cc-${id}', 'REF-${stamp}', 'REF-${stamp}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')`;
      })
      .join(',');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "publicReference", "applicationNumber", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ${apps}`);
  }

  async function cleanMass() {
    try {
      await prisma.applicationAuditEvent.deleteMany({ where: { companyId: companyIdA } });
      await prisma.applicationAssignment.deleteMany({ where: { applicationId: { in: applicationIds } } });
      await prisma.userNotification.deleteMany({
        where: { companyId: companyIdA },
      });
      await prisma.assessmentResponse.deleteMany({
        where: { sessionId: { in: (await prisma.assessmentSession.findMany({ where: { companyId: companyIdA }, select: { id: true } })).map((s) => s.id) } },
      });
      await prisma.assessmentSession.deleteMany({ where: { companyId: companyIdA } });
      await prisma.assessmentEvaluation.deleteMany({ where: { companyId: companyIdA } });
      await prisma.assessmentResult.deleteMany({ where: { companyId: companyIdA } });
      await prisma.assessmentAssignment.deleteMany({ where: { companyId: companyIdA } });
      const versions = await prisma.assessmentVersion.findMany({
        where: { assessmentId: { in: (await prisma.assessment.findMany({ where: { companyId: companyIdA }, select: { id: true } })).map((a) => a.id) } },
        select: { id: true },
      });
      const versionIds = versions.map((v) => v.id);
      const questionIds = (
        await prisma.assessmentQuestion.findMany({
          where: { versionId: { in: versionIds } },
          select: { id: true },
        })
      ).map((q) => q.id);
      await prisma.assessmentRubricCriterion.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.assessmentQuestion.deleteMany({ where: { versionId: { in: versionIds } } });
      await prisma.assessmentVersion.deleteMany({ where: { id: { in: versionIds } } });
      await prisma.assessment.deleteMany({ where: { companyId: companyIdA } });
      await prisma.application.deleteMany({ where: { companyId: companyIdA } });
      await prisma.companyCandidate.deleteMany({ where: { companyId: companyIdA } });
      await prisma.candidate.deleteMany({
        where: { id: { in: applicationIds.map((id) => `cand-${id}`) } },
      });
    } catch {}
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ASSESSMENT_ACCESS_TOKEN_SECRET = 'e2e-mass-secret-min-32-chars!!';
    process.env.ASSESSMENT_AI_PROVIDER = 'mock';
    process.env.REDIS_KEY_PREFIX = `talentai_test:mass:${Date.now()}:`;

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

    prisma = app.get(PrismaService);
    emailQueue = app.get(getQueueToken('email'));
    await emailQueue.pause();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Mass Load Corp',
        email: emailA,
        firstName: 'Mass',
        lastName: 'Admin',
        password: 'E2eStr0ng!Pass',
        passwordConfirmation: 'E2eStr0ng!Pass',
        country: 'US',
        timezone: 'America/New_York',
        acceptTerms: true,
      })
      .expect(201);
    companyIdA = reg.body.data.companyId as string;
    const dbUser = await prisma.user.findUnique({
      where: { normalizedEmail: emailA.toLowerCase().trim() },
    });
    await prisma.user.update({
      where: { id: dbUser!.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailA, password: 'E2eStr0ng!Pass' })
      .expect(200);
    tokenA = login.body.data.tokens.accessToken as string;
    const mem = (await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${dbUser!.id}' LIMIT 1`,
    )) as { id: string }[];
    membershipIdA = mem[0].id;

    await createApplicationsRaw();
  }, 180000);

  afterAll(async () => {
    await cleanMass();
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function postBulk(versionId: string, appIds: string[]): Promise<request.Response> {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/assessments/versions/${versionId}/bulk-assignments`)
          .set(auth(tokenA))
          .send({ applicationIds: appIds });
        if (res.status === 201) return res;
        // Any non-transient non-201 is a hard failure — surface it.
        return res;
      } catch (error) {
        const isReset = (error as { code?: string })?.code === 'ECONNRESET';
        if (!isReset || attempt >= 3) throw error;
        // Connection dropped; the request may or may not have enqueued.
        // Re-sending is safe: assignOneForBulk deduplicates on the
        // (applicationId, versionId) unique key and reports skipped.
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  async function pollBulkJob(jobId: string): Promise<{ assigned: number; skipped: number; failed: number }> {
    let summary: { assigned: number; skipped: number; failed: number } | null = null;
    for (let i = 0; i < 180 && !summary; i++) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assessments/bulk-jobs/${encodeURIComponent(jobId)}`)
        .set(auth(tokenA));
      if (res.body.data?.state === 'completed') {
        summary = res.body.data.result as { assigned: number; skipped: number; failed: number };
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    expect(summary).toBeTruthy();
    return summary!;
  }

  it('assigns 1000 applications through the queue with truthful counts', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set(auth(tokenA))
      .send({ name: 'Mass Assessment', durationMinutes: 30, passingScore: 70 })
      .expect(201);
    const versionId = created.body.data.versions[0].id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/assessments/versions/${versionId}/questions`)
      .set(auth(tokenA))
      .send({
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Disc usage?',
            sortOrder: 0,
            required: true,
            points: 10,
            competency: 'Linux',
            options: [
              { label: 'yes', sortOrder: 0, isCorrect: true },
              { label: 'no', sortOrder: 1, isCorrect: false },
            ],
          },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/assessments/versions/${versionId}/publish`)
      .set(auth(tokenA))
      .expect(200);

    const startedAt = Date.now();
    const half = Math.floor(TOTAL / 2);
    const [r1, r2] = await Promise.all([
      postBulk(versionId, applicationIds.slice(0, half)),
      postBulk(versionId, applicationIds.slice(half)),
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const el1 = Date.now();
    const [sum1, sum2] = await Promise.all([
      pollBulkJob(r1.body.data.jobId as string),
      pollBulkJob(r2.body.data.jobId as string),
    ]);
    const elapsedMs = Date.now() - el1;

    expect(sum1.assigned).toBe(half);
    expect(sum2.assigned).toBe(TOTAL - half);
    expect(sum1.failed + sum2.failed).toBe(0);

    const assignments = await prisma.assessmentAssignment.count({
      where: { companyId: companyIdA },
    });
    expect(assignments).toBe(TOTAL);
    const sessions = await prisma.assessmentSession.count({
      where: { companyId: companyIdA },
    });
    expect(sessions).toBe(TOTAL);
    const codes = await prisma.assessmentSession.findMany({
      where: { companyId: companyIdA },
      select: { codeHash: true },
    });
    expect(new Set(codes.map((c) => c.codeHash)).size).toBe(TOTAL);

    const emailsWaiting = await emailQueue.getWaitingCount();
    expect(emailsWaiting).toBeGreaterThanOrEqual(TOTAL);

    console.log(
      `[mass] ${TOTAL} applications bulk-assigned in ${elapsedMs}ms ` +
        `(${Math.round((TOTAL / elapsedMs) * 1000)}/s), codes unique: 100%, email jobs: ${emailsWaiting}`,
    );
  }, 300000);

  it('deduplicates identical re-runs at the queue level and skips duplicate rows', async () => {
    const created = await prisma.assessment.findFirstOrThrow({ where: { companyId: companyIdA } });
    const version = await prisma.assessmentVersion.findFirstOrThrow({
      where: { assessmentId: created.id, status: 'PUBLISHED' },
    });
    const half = Math.floor(TOTAL / 2);

    // 1) An identical re-run is content-addressed to the SAME BullMQ jobs
    // (bulk-assign-<sha256 of versionId+ids>), so nothing is re-processed
    // and no rows are duplicated.
    const [r1, r2] = await Promise.all([
      postBulk(version.id, applicationIds.slice(0, half)),
      postBulk(version.id, applicationIds.slice(half)),
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.data.deduplicated).toBe(true);
    expect(r2.body.data.deduplicated).toBe(true);
    const [sum1, sum2] = await Promise.all([
      pollBulkJob(r1.body.data.jobId as string),
      pollBulkJob(r2.body.data.jobId as string),
    ]);
    // Original counts, not a fresh reconciliation pass.
    expect(sum1.assigned).toBe(half);
    expect(sum2.assigned).toBe(TOTAL - half);

    // 2) A different id set (shifted slice) bypasses the content-address and
    // runs the real per-row path: every already-assigned application must be
    // reported skipped (ALREADY_ASSIGNED), never assigned again.
    const shifted = applicationIds.slice(TOTAL / 4, (TOTAL / 4) + 100);
    const [r3] = await Promise.all([postBulk(version.id, shifted)]);
    expect(r3.status).toBe(201);
    expect(r3.body.data.deduplicated).toBe(false);
    const sum3 = await pollBulkJob(r3.body.data.jobId as string);
    expect(sum3.assigned).toBe(0);
    expect(sum3.skipped).toBe(100);
    expect(sum3.failed).toBe(0);

    const assignments = await prisma.assessmentAssignment.count({
      where: { companyId: companyIdA },
    });
    // Still exactly one assignment per application — nothing duplicated.
    expect(assignments).toBe(TOTAL);
  }, 300000);
});