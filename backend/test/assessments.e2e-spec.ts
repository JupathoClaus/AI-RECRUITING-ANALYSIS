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
 * Phase 2 assessment engine (e2e, real PostgreSQL + real BullMQ):
 * recruiter create → draft → publish → assign → candidate code → start →
 * autosave → submit-once → deterministic + mock-AI evaluation → review,
 * plus versioning immutability, tenant isolation, and bulk assignment.
 */
describe('Assessments (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let emailQueue: Queue;

  let tokenA: string;
  let companyIdA: string;
  let membershipIdA: string;
  let tokenB: string;
  let companyIdB: string;

  const emailA = `assess-e2e-a-${Date.now()}@e2e.com`;
  const emailB = `assess-e2e-b-${Date.now()}@e2e.com`;

  const appIdA1 = randomUUID();
  const appIdA2 = randomUUID();
  const appIdA3 = randomUUID();
  const appIdB1 = randomUUID();

  let assessmentId: string;
  let version1Id: string;
  let version2Id: string;
  let assignmentId: string;
  let sessionCode: string;
  let sessionId: string;

  async function cleanUser(email: string) {
    const norm = email.toLowerCase().trim();
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ DECLARE uid TEXT; cids TEXT[]; candidate_ids TEXT[]; BEGIN
          SELECT id INTO uid FROM "User" WHERE "normalizedEmail" = '${norm}';
          IF uid IS NULL THEN RETURN; END IF;
          SELECT ARRAY(SELECT "companyId" FROM "CompanyMembership" WHERE "userId" = uid) INTO cids;
          SELECT ARRAY(SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)) INTO candidate_ids;
          DELETE FROM "AssessmentResult" WHERE "companyId" = ANY(cids);
          DELETE FROM "AssessmentEvaluation" WHERE "companyId" = ANY(cids);
          DELETE FROM "AssessmentResponse" WHERE "sessionId" IN (SELECT id FROM "AssessmentSession" WHERE "companyId" = ANY(cids));
          DELETE FROM "AssessmentSession" WHERE "companyId" = ANY(cids);
          DELETE FROM "AssessmentAssignment" WHERE "companyId" = ANY(cids);
          DELETE FROM "AssessmentRubricCriterion" WHERE "questionId" IN (
            SELECT q.id FROM "AssessmentQuestion" q JOIN "AssessmentVersion" v ON v.id = q."versionId"
            JOIN "Assessment" a ON a.id = v."assessmentId" WHERE a."companyId" = ANY(cids));
          DELETE FROM "AssessmentQuestionOption" WHERE "questionId" IN (
            SELECT q.id FROM "AssessmentQuestion" q JOIN "AssessmentVersion" v ON v.id = q."versionId"
            JOIN "Assessment" a ON a.id = v."assessmentId" WHERE a."companyId" = ANY(cids));
          DELETE FROM "AssessmentQuestion" WHERE "versionId" IN (
            SELECT v.id FROM "AssessmentVersion" v JOIN "Assessment" a ON a.id = v."assessmentId" WHERE a."companyId" = ANY(cids));
          DELETE FROM "AssessmentVersion" WHERE "assessmentId" IN (SELECT id FROM "Assessment" WHERE "companyId" = ANY(cids));
          DELETE FROM "Assessment" WHERE "companyId" = ANY(cids);
          DELETE FROM "IdempotencyKey" WHERE "companyId" = ANY(cids);
          DELETE FROM "ApplicationAuditEvent" WHERE "companyId" = ANY(cids);
          DELETE FROM "Application" WHERE "companyId" = ANY(cids);
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "Job" WHERE "companyId" = ANY(cids);
          DELETE FROM "Candidate" WHERE id = ANY(candidate_ids);
          DELETE FROM "CompanySettings" WHERE "companyId" = ANY(cids);
          DELETE FROM "AuthAuditEvent" WHERE "userId" = uid;
          DELETE FROM "UserSession" WHERE "userId" = uid;
          DELETE FROM "VerificationToken" WHERE "userId" = uid;
          DELETE FROM "CompanyMembership" WHERE "userId" = uid;
          DELETE FROM "Company" WHERE id = ANY(cids);
          DELETE FROM "User" WHERE id = uid;
        END $$;
      `);
    } catch {
      /* non-fatal */
    }
  }

  async function createApplication(companyId: string, membershipId: string, appId: string) {
    const stamp = `${appId.slice(0, 8)}${Date.now() % 100000}`;
    const jobId = `job-${appId}`;
    const candidateId = `cand-${appId}`;
    const ccId = `cc-${appId}`;
    const nowStr = new Date().toISOString();
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ('${jobId}', '${companyId}', 'JC-${stamp}', 'slug-${stamp}', 'Systems Administrator', 'FULL_TIME', 'ON_SITE', 'MID', 'Keep the servers running.', '${membershipId}', '${membershipId}', '${nowStr}', '${nowStr}')`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ('${candidateId}', 'Cand', 'Assess', 'cand-${appId}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ('${ccId}', '${companyId}', '${candidateId}', 'RECRUITER_CREATED', '${nowStr}')`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "applicationNumber", "publicReference", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ('${appId}', '${companyId}', '${jobId}', '${candidateId}', '${ccId}', 'ASMT-${stamp}', 'asmt-ref-${stamp}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')`);
  }

  async function registerCompany(email: string, companyName: string) {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName,
        email,
        firstName: 'Assess',
        lastName: 'Admin',
        password: 'E2eStr0ng!Pass',
        passwordConfirmation: 'E2eStr0ng!Pass',
        country: 'US',
        timezone: 'America/New_York',
        acceptTerms: true,
      })
      .expect(201);
    const companyId: string = reg.body.data.companyId;
    const dbUser = await prisma.user.findUnique({
      where: { normalizedEmail: email.toLowerCase().trim() },
    });
    await prisma.user.update({
      where: { id: dbUser!.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'E2eStr0ng!Pass' })
      .expect(200);
    const mem = (await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${dbUser!.id}' LIMIT 1`,
    )) as { id: string }[];
    return {
      companyId,
      membershipId: mem[0].id,
      token: login.body.data.tokens.accessToken as string,
    };
  }

  const QUESTIONS = [
    {
      type: 'SINGLE_CHOICE',
      prompt: 'What command shows disk usage on Linux?',
      sortOrder: 0,
      required: true,
      points: 10,
      competency: 'Linux',
      options: [
        { label: 'df -h', sortOrder: 0, isCorrect: true },
        { label: 'ls -la', sortOrder: 1, isCorrect: false },
      ],
    },
    {
      type: 'MULTIPLE_CHOICE',
      prompt: 'Select valid backup tools.',
      sortOrder: 1,
      required: true,
      points: 10,
      competency: 'Backup',
      options: [
        { label: 'rsync', sortOrder: 0, isCorrect: true },
        { label: 'borg', sortOrder: 1, isCorrect: true },
        { label: 'solitaire', sortOrder: 2, isCorrect: false },
      ],
    },
    {
      type: 'LONG_TEXT',
      prompt: 'Describe a production outage you resolved.',
      sortOrder: 2,
      required: true,
      points: 0,
      competency: 'Troubleshooting',
      aiEvaluated: true,
      rubricCriteria: [{ name: 'Troubleshooting', maxScore: 4, weight: 1, sortOrder: 0 }],
    },
  ];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ASSESSMENT_ACCESS_TOKEN_SECRET = 'e2e-assessment-secret-min-32-chars!!';
    process.env.ASSESSMENT_AI_PROVIDER = 'mock';
    process.env.REDIS_KEY_PREFIX = `talentai_test:assessments:${Date.now()}:`;

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

    await cleanUser(emailA);
    await cleanUser(emailB);

    const a = await registerCompany(emailA, 'Assessment E2E Corp A');
    companyIdA = a.companyId;
    membershipIdA = a.membershipId;
    tokenA = a.token;
    const b = await registerCompany(emailB, 'Assessment E2E Corp B');
    companyIdB = b.companyId;
    tokenB = b.token;

    await createApplication(companyIdA, membershipIdA, appIdA1);
    await createApplication(companyIdA, membershipIdA, appIdA2);
    await createApplication(companyIdA, membershipIdA, appIdA3);
    await createApplication(
      companyIdB,
      (
        (await prisma.$queryRawUnsafe(
          `SELECT id FROM "CompanyMembership" WHERE "companyId" = '${companyIdB}' LIMIT 1`,
        )) as { id: string }[]
      )[0].id,
      appIdB1,
    );
  }, 120000);

  afterAll(async () => {
    await cleanUser(emailA);
    await cleanUser(emailB);
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  describe('recruiter lifecycle', () => {
    it('creates an assessment with a v1 draft', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set(auth(tokenA))
        .send({ name: 'Sysadmin Technical Assessment', durationMinutes: 30, passingScore: 70 })
        .expect(201);
      assessmentId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.versions).toHaveLength(1);
      version1Id = res.body.data.versions[0].id;
    });

    it('saves draft questions', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/questions`)
        .set(auth(tokenA))
        .send({ questions: QUESTIONS })
        .expect(200);
      expect(res.body.data.questions).toHaveLength(3);
    });

    it('validates and publishes v1 (immutable thereafter)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/validate`)
        .set(auth(tokenA))
        .expect(200)
        .expect((res) => expect(res.body.data.valid).toBe(true));
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/publish`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.body.data.status).toBe('PUBLISHED');
    });

    it('rejects edits to the published version', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/questions`)
        .set(auth(tokenA))
        .send({ questions: QUESTIONS })
        .expect(409);
    });

    it('assigns v1 to an application and returns the code once', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/assignments`)
        .set(auth(tokenA))
        .send({ applicationId: appIdA1 })
        .expect(201);
      assignmentId = res.body.data.id;
      sessionCode = res.body.data.code;
      expect(sessionCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    });

    it('treats duplicate assignment as the same assignment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/assignments`)
        .set(auth(tokenA))
        .send({ applicationId: appIdA1 })
        .expect(201);
      expect(res.body.data.id).toBe(assignmentId);
      expect(res.body.data.code).toBeUndefined();
    });
  });

  describe('candidate flow', () => {
    let candidateToken: string;
    let qSingle: string;
    let qMulti: string;
    let qLong: string;

    it('verifies the code and issues a bound token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/public/assessments/verify-code')
        .send({ code: sessionCode })
        .expect(200);
      candidateToken = res.body.data.token;
      sessionId = res.body.data.session.sessionId;
      expect(candidateToken).toBeTruthy();
    });

    it('rejects invalid codes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/public/assessments/verify-code')
        .send({ code: 'ZZZZ-ZZZZ' })
        .expect(401);
    });

    it('exposes a candidate-safe session (no correct answers, no rubrics)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/assessments/session')
        .set(auth(candidateToken))
        .expect(200);
      const body = JSON.stringify(res.body.data);
      expect(body).not.toContain('isCorrect');
      expect(body).not.toContain('rubricCriteria');
      expect(body).not.toContain('competency');
      for (const q of res.body.data.questions) {
        if (q.type === 'SINGLE_CHOICE') qSingle = q.id;
        if (q.type === 'MULTIPLE_CHOICE') qMulti = q.id;
        if (q.type === 'LONG_TEXT') qLong = q.id;
      }
      expect(qSingle && qMulti && qLong).toBeTruthy();
    });

    it('starts the session with server-derived timing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/public/assessments/start')
        .set(auth(candidateToken))
        .expect(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.expiresAt).toBeTruthy();
      expect(res.body.data.remainingSeconds).toBeGreaterThan(1700);
    });

    it('autosaves responses (upsert, last-write-wins)', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(candidateToken))
        .send({ questionId: qSingle, selectedOptionIds: [] })
        .expect(200);
      const single = await prisma.assessmentQuestion.findUnique({
        where: { id: qSingle },
        include: { options: true },
      });
      const correctId = single!.options.find((o) => o.isCorrect)!.id;
      const multi = await prisma.assessmentQuestion.findUnique({
        where: { id: qMulti },
        include: { options: true },
      });
      const oneCorrect = multi!.options
        .filter((o) => o.isCorrect)
        .slice(0, 1)
        .map((o) => o.id);

      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(candidateToken))
        .send({ questionId: qSingle, selectedOptionIds: [correctId] })
        .expect(200);
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(candidateToken))
        .send({ questionId: qMulti, selectedOptionIds: oneCorrect })
        .expect(200);
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(candidateToken))
        .send({
          questionId: qLong,
          textAnswer: 'I verified DNS with dig, then checked routing and firewall rules.',
        })
        .expect(200);
    });

    it('rejects options that do not belong to the question', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(candidateToken))
        .send({ questionId: qSingle, selectedOptionIds: [randomUUID()] })
        .expect(400);
    });

    it('submits exactly once (double submit deduplicates)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/public/assessments/submit')
        .set(auth(candidateToken))
        .expect(200);
      expect(first.body.data.submitted).toBe(true);
      const second = await request(app.getHttpServer())
        .post('/api/v1/public/assessments/submit')
        .set(auth(candidateToken))
        .expect(200);
      expect(second.body.data.session.id).toBe(first.body.data.session.id);
    });

    it('locks the session after submission', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(candidateToken))
        .send({ questionId: qLong, textAnswer: 'late edit' })
        .expect(409);
      const status = await request(app.getHttpServer())
        .get('/api/v1/public/assessments/status')
        .set(auth(candidateToken))
        .expect(200);
      expect(status.body.data.status).toMatch(/SUBMITTED|EVALUATING|EVALUATED/);
      expect(status.body.data).not.toHaveProperty('totalScore');
    });

    it('produces a backend-computed result (deterministic + mock AI)', async () => {
      let result: Record<string, unknown> | null = null;
      for (let i = 0; i < 40; i++) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/assessments/sessions/${sessionId}/result`)
          .set(auth(tokenA));
        if (res.body.data?.result) {
          result = res.body.data.result as Record<string, unknown>;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(result).toBeTruthy();
      // Deterministic: 10 (single) + 5 (multi partial 1/2) = 15/20.
      expect(result!.deterministicScore).toBe(15);
      expect(result!.deterministicMax).toBe(20);
      // Mock AI: ratio 0.5 → floor(4*0.5)=2, max 4. Total 17/24 → 70.83.
      expect(result!.aiScore).toBe(2);
      expect(result!.totalScore).toBeCloseTo(70.83, 2);
    }, 60000);

    it('exposes assessment state on the application', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assessments/applications/${appIdA1}/state`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.body.data.assignments).toHaveLength(1);
      expect(res.body.data.assignments[0].latestSession.result.totalScore).toBeCloseTo(70.83, 2);
    });
  });

  describe('versioning', () => {
    it('creates an immutable v1 snapshot: v2 edits do not affect v1 candidates', async () => {
      const draft = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assessmentId}/draft-version`)
        .set(auth(tokenA))
        .expect(200);
      version2Id = draft.body.data.id;
      expect(draft.body.data.versionNumber).toBe(2);

      const extended = [
        ...QUESTIONS,
        { ...QUESTIONS[0], sortOrder: 3, prompt: 'Second Linux question?' },
      ];
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version2Id}/questions`)
        .set(auth(tokenA))
        .send({ questions: extended })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version2Id}/publish`)
        .set(auth(tokenA))
        .expect(200);

      const v1 = await request(app.getHttpServer())
        .get(`/api/v1/assessments/versions/${version1Id}`)
        .set(auth(tokenA))
        .expect(200);
      expect(v1.body.data.questions).toHaveLength(3);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version2Id}/assignments`)
        .set(auth(tokenA))
        .send({ applicationId: appIdA2 })
        .expect(201);

      const state1 = await request(app.getHttpServer())
        .get(`/api/v1/assessments/applications/${appIdA1}/state`)
        .set(auth(tokenA))
        .expect(200);
      expect(state1.body.data.assignments[0].assessment.versionNumber).toBe(1);
      const state2 = await request(app.getHttpServer())
        .get(`/api/v1/assessments/applications/${appIdA2}/state`)
        .set(auth(tokenA))
        .expect(200);
      expect(state2.body.data.assignments[0].assessment.versionNumber).toBe(2);
    });
  });

  describe('tenant isolation', () => {
    it('hides company A assessments from company B', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/${assessmentId}`)
        .set(auth(tokenB))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/versions/${version1Id}`)
        .set(auth(tokenB))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/sessions/${sessionId}/result`)
        .set(auth(tokenB))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/applications/${appIdA1}/state`)
        .set(auth(tokenB))
        .expect(404);
    });

    it('rejects cross-company assignment and publishing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/assignments`)
        .set(auth(tokenB))
        .send({ applicationId: appIdB1 })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/publish`)
        .set(auth(tokenB))
        .expect(404);
    });

    it('rejects recruiter endpoints without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/assessments').expect(401);
    });
  });

  describe('bulk assignment', () => {
    it('queues bulk work and reports truthful partial success', async () => {
      const queued = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version2Id}/bulk-assignments`)
        .set(auth(tokenA))
        .send({ applicationIds: [appIdA1, appIdA2, appIdA3] })
        .expect(201);
      const jobId = queued.body.data.jobId as string;
      expect(jobId).toBeTruthy();

      let summary: { assigned: number; skipped: number; failed: number } | null = null;
      for (let i = 0; i < 40; i++) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/assessments/bulk-jobs/${encodeURIComponent(jobId)}`)
          .set(auth(tokenA));
        if (res.body.data?.state === 'completed') {
          summary = res.body.data.result as { assigned: number; skipped: number; failed: number };
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(summary).toBeTruthy();
      // appIdA1 is new to v2 → assigned; appIdA2 already on v2 → skipped.
      expect(summary!.assigned).toBe(2);
      expect(summary!.skipped).toBe(1);
      expect(summary!.failed).toBe(0);
    }, 60000);
  });
});
