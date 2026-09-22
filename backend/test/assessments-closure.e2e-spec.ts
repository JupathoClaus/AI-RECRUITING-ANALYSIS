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
 * Phase 2 closure e2e (real PostgreSQL + real BullMQ, mock AI):
 * adversarial candidate-surface security, expiry enforcement, autosave
 * stale-write guardrails, parallel double-submit, Idempotency-Key dedup,
 * truthfulness of bulk partial failure + job isolation, fabricated-evidence
 * deterministic floor with re-evaluation, notification emission, and a full
 * audit-trail completeness check for the assessment lifecycle.
 */
describe('Assessments closure (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let emailQueue: Queue;

  let tokenA: string;
  let companyIdA: string;
  let membershipIdA: string;
  let tokenB: string;
  let companyIdB: string;

  const emailA = `closure-a-${Date.now()}@e2e.com`;
  const emailB = `closure-b-${Date.now()}@e2e.com`;

  const appId = {
    a1: randomUUID(),
    a2: randomUUID(),
    a3: randomUUID(),
    a4: randomUUID(),
    a5: randomUUID(),
    a6: randomUUID(),
    a7: randomUUID(),
    a8: randomUUID(),
    a9: randomUUID(),
    a10: randomUUID(),
  };

  let assessmentId: string;
  let version1Id: string;
  let version2Id: string;

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
          DELETE FROM "ApplicationAssignment" WHERE "applicationId" IN (SELECT id FROM "Application" WHERE "companyId" = ANY(cids));
          DELETE FROM "UserNotification" WHERE "userId" IN (SELECT "userId" FROM "CompanyMembership" WHERE "companyId" = ANY(cids));
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

  async function createApplication(companyId: string, membershipId: string, appIdStr: string) {
    const stamp = `${appIdStr.slice(0, 8)}${Date.now() % 100000}`;
    const jobId = `job-${appIdStr}`;
    const candidateId = `cand-${appIdStr}`;
    const ccId = `cc-${appIdStr}`;
    const nowStr = new Date().toISOString();
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ('${jobId}', '${companyId}', 'JC-${stamp}', 'slug-${stamp}', 'Systems Administrator', 'FULL_TIME', 'ON_SITE', 'MID', 'Keep the servers running.', '${membershipId}', '${membershipId}', '${nowStr}', '${nowStr}')`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ('${candidateId}', 'Cand', 'Closure', 'cand-${appIdStr}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ('${ccId}', '${companyId}', '${candidateId}', 'RECRUITER_CREATED', '${nowStr}')`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "applicationNumber", "publicReference", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ('${appIdStr}', '${companyId}', '${jobId}', '${candidateId}', '${ccId}', 'ASMT-${stamp}', 'asmt-ref-${stamp}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')`);
  }

  async function registerCompany(email: string, companyName: string) {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName,
        email,
        firstName: 'Closure',
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
    process.env.ASSESSMENT_ACCESS_TOKEN_SECRET = 'e2e-closure-secret-min-32-chars!!';
    process.env.ASSESSMENT_AI_PROVIDER = 'mock';
    process.env.REDIS_KEY_PREFIX = `talentai_test:closure:${Date.now()}:`;

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

    const a = await registerCompany(emailA, 'Closure E2E Corp A');
    companyIdA = a.companyId;
    membershipIdA = a.membershipId;
    tokenA = a.token;
    const b = await registerCompany(emailB, 'Closure E2E Corp B');
    companyIdB = b.companyId;
    tokenB = b.token;

    for (const key of Object.keys(appId) as (keyof typeof appId)[]) {
      await createApplication(companyIdA, membershipIdA, appId[key]);
    }
  }, 120000);

  afterAll(async () => {
    await cleanUser(emailA);
    await cleanUser(emailB);
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  type CandidateSession = {
    appIdStr: string;
    code: string;
    token: string;
    sessionId: string;
    qSingle: string;
    qMulti: string;
    qLong: string;
    correctSingle: string;
    correctMulti: string[];
  };

  async function newCandidateSession(
    appIdStr: string,
    longAnswer = 'I verified DNS with dig, then checked routing and firewall rules.',
  ): Promise<CandidateSession> {
    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/assessments/versions/${version1Id}/assignments`)
      .set(auth(tokenA))
      .send({ applicationId: appIdStr })
      .expect(201);
    const code = assigned.body.data.code as string;

    const verified = await request(app.getHttpServer())
      .post('/api/v1/public/assessments/verify-code')
      .send({ code })
      .expect(200);
    const token = verified.body.data.token as string;
    const sessionId = verified.body.data.session.sessionId as string;

    const got = await request(app.getHttpServer())
      .get('/api/v1/public/assessments/session')
      .set(auth(token))
      .expect(200);
    const qSingle = got.body.data.questions.find((q: any) => q.type === 'SINGLE_CHOICE').id as string;
    const qMulti = got.body.data.questions.find((q: any) => q.type === 'MULTIPLE_CHOICE').id as string;
    const qLong = got.body.data.questions.find((q: any) => q.type === 'LONG_TEXT').id as string;

    await request(app.getHttpServer())
      .post('/api/v1/public/assessments/start')
      .set(auth(token))
      .expect(200);

    const single = await prisma.assessmentQuestion.findUnique({
      where: { id: qSingle },
      include: { options: true },
    });
    const correctSingle = single!.options.find((o) => o.isCorrect)!.id;
    const multi = await prisma.assessmentQuestion.findUnique({
      where: { id: qMulti },
      include: { options: true },
    });
    const correctMulti = multi!.options.filter((o) => o.isCorrect).map((o) => o.id);

    await request(app.getHttpServer())
      .put('/api/v1/public/assessments/responses')
      .set(auth(token))
      .send({ questionId: qSingle, selectedOptionIds: [correctSingle] })
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/public/assessments/responses')
      .set(auth(token))
      .send({ questionId: qMulti, selectedOptionIds: [correctMulti[0]] })
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/public/assessments/responses')
      .set(auth(token))
      .send({ questionId: qLong, textAnswer: longAnswer })
      .expect(200);

    return {
      appIdStr,
      code,
      token,
      sessionId,
      qSingle,
      qMulti,
      qLong,
      correctSingle,
      correctMulti,
    };
  }

  async function waitForEvaluated(sessionId: string, statuses: (string | undefined)[] = []) {
    let result: Record<string, unknown> | null = null;
    for (let i = 0; i < 40 && !result; i++) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assessments/sessions/${sessionId}/result`)
        .set(auth(tokenA));
      if (res.body.data?.result) {
        result = res.body.data.result as Record<string, unknown>;
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    expect(result).toBeTruthy();
    return result;
  }

  describe('recruiter lifecycle (builds v1 + v2)', () => {
    it('creates the assessment and publishes v1', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set(auth(tokenA))
        .send({ name: 'Closure Assessment', durationMinutes: 30, passingScore: 70 })
        .expect(201);
      assessmentId = created.body.data.id;
      version1Id = created.body.data.versions[0].id;
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/questions`)
        .set(auth(tokenA))
        .send({ questions: QUESTIONS })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/validate`)
        .set(auth(tokenA))
        .expect(200)
        .expect((res) => expect(res.body.data.valid).toBe(true));
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/publish`)
        .set(auth(tokenA))
        .expect(200);
    });

    it('keeps a second draft version for cross-version question tests', async () => {
      const draft = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assessmentId}/draft-version`)
        .set(auth(tokenA))
        .expect(200);
      version2Id = draft.body.data.id;
      const extraQ = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version2Id}/questions`)
        .set(auth(tokenA))
        .send({
          questions: [
            {
              type: 'LONG_TEXT',
              prompt: 'Different question from another version.',
              sortOrder: 0,
              required: false,
              points: 0,
              competency: 'Other',
              aiEvaluated: true,
              rubricCriteria: [{ name: 'Other', maxScore: 3, weight: 1, sortOrder: 0 }],
            },
          ],
        })
        .expect(200);
      expect(extraQ.body.data.questions).toHaveLength(1);
    });
  });

  describe('candidate-surface isolation (adversarial)', () => {
    let cs: CandidateSession;
    let v2QuestionId: string;

    it('creates a working candidate session', async () => {
      cs = await newCandidateSession(appId.a1);
      const v2 = await request(app.getHttpServer())
        .get(`/api/v1/assessments/versions/${version2Id}`)
        .set(auth(tokenA))
        .expect(200);
      v2QuestionId = v2.body.data.questions[0].id;
    });

    it('rejects candidate token on every recruiter-scoped endpoint', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/sessions/${cs.sessionId}/result`)
        .set(auth(cs.token))
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/assessments/assignments')
        .set(auth(cs.token))
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/applications/${cs.appIdStr}/state`)
        .set(auth(cs.token))
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/assignments`)
        .set(auth(cs.token))
        .send({ applicationId: appId.a2 })
        .expect(401);
    });

    it('still serves the candidate endpoints for the same token', async () => {
      const status = await request(app.getHttpServer())
        .get('/api/v1/public/assessments/status')
        .set(auth(cs.token))
        .expect(200);
      expect(status.body.data.status).toBe('IN_PROGRESS');
    });

    it('rejects question ids that are not on the session version', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: randomUUID() })
        .expect(404);
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: v2QuestionId })
        .expect(404);
      // Sanity: own version question still writable.
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: cs.qLong, textAnswer: 'still in progress' })
        .expect(200);
    });

    it('never exposes correct answers, scores, or grading state to the candidate', async () => {
      cs = await newCandidateSession(appId.a2);
      await request(app.getHttpServer())
        .post('/api/v1/public/assessments/submit')
        .set(auth(cs.token))
        .expect(200);
      const result = await waitForEvaluated(cs.sessionId);
      const publicPayload = await request(app.getHttpServer())
        .get('/api/v1/public/assessments/session')
        .set(auth(cs.token))
        .expect(200);
      const statusPayload = await request(app.getHttpServer())
        .get('/api/v1/public/assessments/status')
        .set(auth(cs.token))
        .expect(200);
      const publicJson = JSON.stringify(publicPayload.body.data);
      const statusJson = JSON.stringify(statusPayload.body.data);
      for (const forbidden of [
        'isCorrect',
        'rubricCriteria',
        'competency',
        'overallScore',
        'totalScore',
        'deterministicScore',
        'aiScore',
        'strengths',
        'gaps',
      ]) {
        expect(publicJson).not.toContain(forbidden);
        expect(statusJson).not.toContain(forbidden);
      }
      // The recruit-side result genuinely exists for the same session.
      expect(result!.deterministicScore).toBe(15);
      expect(result!.totalScore).toBeTruthy();
    });
  });

  describe('expiry is time-enforced end-to-end', () => {
    let cs: CandidateSession;

    it('starts a session then forces an imminent deadline', async () => {
      cs = await newCandidateSession(appId.a3);
      await prisma.assessmentSession.update({
        where: { id: cs.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    });

    it('rejects writes, restarts, and submits after expiry', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/public/assessments/start')
        .set(auth(cs.token))
        .expect(409);
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: cs.qLong, textAnswer: 'too late' })
        .expect(409);
      await request(app.getHttpServer())
        .post('/api/v1/public/assessments/submit')
        .set(auth(cs.token))
        .expect(409);
      const status = await request(app.getHttpServer())
        .get('/api/v1/public/assessments/status')
        .set(auth(cs.token))
        .expect(200);
      expect(status.body.data.status).toBe('EXPIRED');
      expect(status.body.data).not.toHaveProperty('totalScore');
    });

    it('races writes against expiry without corrupting state', async () => {
      const mid = await newCandidateSession(appId.a4);
      await prisma.assessmentSession.update({
        where: { id: mid.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const results = await Promise.all([
        request(app.getHttpServer())
          .put('/api/v1/public/assessments/responses')
          .set(auth(mid.token))
          .send({ questionId: mid.qLong, textAnswer: 'race A' }),
        request(app.getHttpServer())
          .post('/api/v1/public/assessments/submit')
          .set(auth(mid.token)),
      ]);
      for (const r of results) expect([200, 409]).toContain(r.status);
      const fresh = await prisma.assessmentSession.findUnique({
        where: { id: mid.sessionId },
      });
      expect(fresh!.status).toBe('EXPIRED');
    });
  });

  describe('autosave stale-write guardrails', () => {
    let cs: CandidateSession;

    it('accepts fresh writes and returns updatedAt from the server', async () => {
      cs = await newCandidateSession(appId.a5);
      const saved = await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: cs.qLong, textAnswer: 'state one' })
        .expect(200);
      expect(saved.body.data.saved).toBe(true);
      expect(saved.body.data.response.updatedAt).toBeTruthy();
      // Fresh write carries the server's own base → accepted.
      await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({
          questionId: cs.qLong,
          textAnswer: 'state two',
          baseUpdatedAt: saved.body.data.response.updatedAt,
        })
        .expect(200);
    });

    it('rejects a stale base older than the tolerance window', async () => {
      const saved = await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: cs.qLong, textAnswer: 'state three' })
        .expect(200);
      const base = new Date(saved.body.data.response.updatedAt);
      base.setSeconds(base.getSeconds() - 6);
      const stale = await request(app.getHttpServer())
        .put('/api/v1/public/assessments/responses')
        .set(auth(cs.token))
        .send({ questionId: cs.qLong, textAnswer: 'stale beat', baseUpdatedAt: base.toISOString() })
        .expect(409);
      expect(stale.body.errorCode).toBe('STALE_WRITE');
    });

    it('upserts single row per question regardless of write volume', async () => {
      const count = await prisma.assessmentResponse.count({
        where: { sessionId: cs.sessionId, questionId: cs.qLong },
      });
      expect(count).toBe(1);
    });
  });

  describe('parallel double-submit dedupe', () => {
    it('accepts 4 concurrent submits and produces exactly one evaluation', async () => {
      const cs = await newCandidateSession(appId.a6);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app.getHttpServer())
            .post('/api/v1/public/assessments/submit')
            .set(auth(cs.token))
            .set('Idempotency-Key', `submit-${cs.sessionId}`),
        ),
      );
      for (const r of results) expect(r.status).toBe(200);

      const evals = await prisma.assessmentEvaluation.findMany({
        where: { sessionId: cs.sessionId },
      });
      expect(evals).toHaveLength(1);
      expect(evals[0].attempt).toBe(1);
      const result = await waitForEvaluated(cs.sessionId);
      expect(result!.deterministicScore).toBe(15);
    });
  });

  describe('Idempotency-Key dedup', () => {
    it('deduplicates assessment creation and publishing', async () => {
      const key = randomUUID();
      const first = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set(auth(tokenA))
        .set('Idempotency-Key', key)
        .send({ name: 'Dedup Assessment', durationMinutes: 30, passingScore: 70 })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set(auth(tokenA))
        .set('Idempotency-Key', key)
        .send({ name: 'Dedup Assessment', durationMinutes: 30, passingScore: 70 });
      expect(second.body.data.id).toBe(first.body.data.id);

      const dedupAssessmentId = first.body.data.id as string;
      const dedupVersionId = first.body.data.versions[0].id as string;
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${dedupVersionId}/questions`)
        .set(auth(tokenA))
        .send({ questions: QUESTIONS.slice(0, 1) })
        .expect(200);

      const pkey = randomUUID();
      const p1 = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${dedupVersionId}/publish`)
        .set(auth(tokenA))
        .set('Idempotency-Key', pkey)
        .expect(200);
      const p2 = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${dedupVersionId}/publish`)
        .set(auth(tokenA))
        .set('Idempotency-Key', pkey);
      expect(p2.body.data.id).toBe(p1.body.data.id);

      const versions = await prisma.assessmentVersion.findMany({
        where: { assessmentId: dedupAssessmentId },
      });
      expect(versions).toHaveLength(1);
    });
  });

  describe('bulk partial failure truthfulness + job isolation', () => {
    it('reports per-row failures with reasons and never hides them', async () => {
      const queued = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/bulk-assignments`)
        .set(auth(tokenA))
        .send({ applicationIds: [appId.a9, appId.a10, randomUUID()] })
        .expect(201);
      const jobId = queued.body.data.jobId as string;

      let summary: any = null;
      for (let i = 0; i < 40 && !summary; i++) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/assessments/bulk-jobs/${encodeURIComponent(jobId)}`)
          .set(auth(tokenA));
        if (res.body.data?.state === 'completed') {
          summary = res.body.data.result as any;
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      expect(summary).toBeTruthy();
      expect(summary.assigned).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.failures).toHaveLength(1);
      expect(summary.failures[0].reason).toBe('APPLICATION_NOT_FOUND');

      const assignedRows = await prisma.assessmentAssignment.count({
        where: { companyId: companyIdA, applicationId: { in: [appId.a9, appId.a10] } },
      });
      expect(assignedRows).toBe(2);
    });

    it('hides company A bulk jobs from company B', async () => {
      const failed = await request(app.getHttpServer())
        .post(`/api/v1/assessments/versions/${version1Id}/bulk-assignments`)
        .set(auth(tokenA))
        .send({ applicationIds: [randomUUID()] })
        .expect(201);
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/bulk-jobs/${encodeURIComponent(failed.body.data.jobId)}`)
        .set(auth(tokenB))
        .expect(404);
    });
  });

  describe('fabricated evidence floors and re-evaluation composes', () => {
    it('locks a fabricated run to deterministic-only and retries cleanly', async () => {
      const cs = await newCandidateSession(
        appId.a7,
        'I verified DNS with dig and restarted services. __MOCK_SCENARIO:FABRICATED_EVIDENCE',
      );

      await request(app.getHttpServer())
        .post('/api/v1/public/assessments/submit')
        .set(auth(cs.token))
        .expect(200);

      let evals: any[] = [];
      for (let i = 0; i < 40 && evals.length === 0; i++) {
        evals = await prisma.assessmentEvaluation.findMany({
          where: { sessionId: cs.sessionId },
        });
        if (evals.length === 0) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(evals).toHaveLength(1);

      let latest: any = null;
      for (let i = 0; i < 20 && !latest; i++) {
        latest = await prisma.assessmentEvaluation.findFirst({
          where: { sessionId: cs.sessionId, status: 'FAILED' },
          orderBy: { attempt: 'desc' },
        });
        if (!latest) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(latest).toBeTruthy();
      expect(latest.failureCode).toBe('FABRICATED_EVIDENCE');

      const result = await waitForEvaluated(cs.sessionId);
      // Deterministic floor still stands; nothing AI-derived leaks.
      expect(result!.deterministicScore).toBe(15);
      expect(result!.deterministicMax).toBe(20);
      // No AI scoring contributed for a fabricated run — only the
      // deterministic fraction surfaces as the percentage (15/20 = 75).
      expect(result!.aiScore).toBeNull();
      expect(result!.aiMax).toBeNull();
      expect(result!.totalScore).toBe(75);
      expect(JSON.stringify(result)).not.toContain('isCorrect');

      // Re-evaluation composes without duplicating the evaluation row set.
      const retry = await request(app.getHttpServer())
        .post(`/api/v1/assessments/sessions/${cs.sessionId}/retry-evaluation`)
        .set(auth(tokenA))
        .expect(200);
      expect(retry.body.data.attempt).toBe(2);

      let evalsAfter: any[] = [];
      for (let i = 0; i < 40; i++) {
        evalsAfter = await prisma.assessmentEvaluation.findMany({
          where: { sessionId: cs.sessionId },
          orderBy: { attempt: 'asc' },
        });
        const last = evalsAfter[evalsAfter.length - 1];
        if (last?.status === 'FAILED' || last?.status === 'COMPLETED') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(evalsAfter).toHaveLength(2);
      expect(evalsAfter[1].status).toBe('FAILED');
      expect(evalsAfter[1].failureCode).toBe('FABRICATED_EVIDENCE');

      const stable = await request(app.getHttpServer())
        .get(`/api/v1/assessments/sessions/${cs.sessionId}/result`)
        .set(auth(tokenA))
        .expect(200);
      expect(stable.body.data.result.deterministicScore).toBe(15);
    }, 60000);
  });

  describe('notification emission', () => {
    it('emits an assessment notification to the application assignee', async () => {
      const freshApp = randomUUID();
      await createApplication(companyIdA, membershipIdA, freshApp);
      const user = await prisma.user.findUniqueOrThrow({
        where: { normalizedEmail: emailA.toLowerCase().trim() },
      });
      await prisma.applicationAssignment.create({
        data: {
          applicationId: freshApp,
          membershipId: membershipIdA,
          type: 'RECRUITER',
          assignedByMembershipId: membershipIdA,
        },
      });
      const cs = await newCandidateSession(freshApp);
      await request(app.getHttpServer())
        .post('/api/v1/public/assessments/submit')
        .set(auth(cs.token))
        .expect(200);
      await waitForEvaluated(cs.sessionId);

      // The in-app notification is written after the result commit; poll
      // (bounded) so a benign ordering gap never flakes the assertion.
      let notifications: any[] = [];
      for (let i = 0; i < 20; i++) {
        notifications = await prisma.userNotification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
        });
        if (notifications.some((n) => String(n.type).startsWith('ASSESSMENT_'))) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(notifications.some((n) => String(n.type).startsWith('ASSESSMENT_'))).toBe(true);
    });
  });

  describe('audit-trail completeness', () => {
    it('records every lifecycle event through review and re-evaluation', async () => {
      const events = (await prisma.applicationAuditEvent.findMany({
        where: { companyId: companyIdA },
      })).filter((e) => String(e.eventType).startsWith('ASSESSMENT_'));
      const types = new Set(events.map((e) => e.eventType));
      for (const expected of [
        'ASSESSMENT_CREATED',
        'ASSESSMENT_UPDATED',
        'ASSESSMENT_PUBLISHED',
        'ASSESSMENT_ASSIGNED',
        'ASSESSMENT_STARTED',
        'ASSESSMENT_SUBMITTED',
        'ASSESSMENT_EXPIRED',
        'ASSESSMENT_EVALUATED',
        'ASSESSMENT_REVIEWED',
      ]) {
        expect((types as Set<string>).has(expected)).toBe(true);
      }
      // Descriptions carry metadata only — never answers or grading internals.
      for (const e of events.filter((x) => typeof x.description === 'string')) {
        expect(e.description).not.toContain('isCorrect');
        expect(e.description).not.toContain('__MOCK_SCENARIO');
        expect(e.description).not.toContain('FABRICATED_EVIDENCE');
      }
    });
  });
});