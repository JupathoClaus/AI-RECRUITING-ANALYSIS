import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaClient, AiInterviewStatus } from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/database/prisma/prisma.service';

/**
 * Real-PostgreSQL proof of the per-company AI-interview concurrency cap.
 *
 * Runs against the `test` profile DB (:5433) with AI_INTERVIEW_MAX_CONCURRENT=2.
 * - A slot is claimed for A1, then two FRESH applications (A2, A3) race for the
 *   one remaining slot: exactly one is created, the other must 409 with
 *   AI_INTERVIEW_CONCURRENCY_LIMIT (the per-company advisory lock makes the
 *   count+create atomic, so both can never succeed).
 * - Replays of an already-covered application return the SAME interview at cap
 *   (dedup happens before the cap check).
 * - A terminal status (CANCELLED) releases capacity.
 * - Company B is quota-independent (own lock + own count), and neither company
 *   can create an interview for the other's application (404, resource hiding).
 */
describe('AI interview concurrency (e2e, real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let emailQueue: Queue;

  let companyIdA: string;
  let companyIdB: string;
  let membershipIdA: string;
  let membershipIdB: string;
  let tokenA: string;
  let tokenB: string;

  const appA1 = randomUUID();
  const appA2 = randomUUID();
  const appA3 = randomUUID();
  const appA4 = randomUUID();
  const appA5 = randomUUID();
  const appB1 = randomUUID();

  const emailA = `ai-ivty-con-a-${Date.now()}@e2e.com`;
  const emailB = `ai-ivty-con-b-${Date.now()}@e2e.com`;

  const TERMINAL = [
    AiInterviewStatus.CANCELLED,
    AiInterviewStatus.EXPIRED,
    AiInterviewStatus.FAILED,
    AiInterviewStatus.COMPLETED,
  ];

  async function cleanUser(email: string) {
    const norm = email.toLowerCase().trim();
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ DECLARE uid TEXT; cids TEXT[]; candidate_ids TEXT[]; BEGIN
          SELECT id INTO uid FROM "User" WHERE "normalizedEmail" = '${norm}';
          IF uid IS NULL THEN RETURN; END IF;
          SELECT ARRAY(SELECT "companyId" FROM "CompanyMembership" WHERE "userId" = uid) INTO cids;
          SELECT ARRAY(SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)) INTO candidate_ids;
          DELETE FROM "AiInterview" WHERE "companyId" = ANY(cids);
          DELETE FROM "StoredFile" WHERE "companyId" = ANY(cids);
          DELETE FROM "AiScreeningResult" WHERE "companyId" = ANY(cids);
          DELETE FROM "Application" WHERE "companyId" = ANY(cids);
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "Job" WHERE "companyId" = ANY(cids);
          DELETE FROM "Candidate" WHERE id = ANY(candidate_ids);
          DELETE FROM "CompanySettings" WHERE "companyId" = ANY(cids);
          DELETE FROM "AuthAuditEvent" WHERE "userId" = uid;
          DELETE FROM "UserSession" WHERE "userId" = uid;
          DELETE FROM "VerificationToken" WHERE "userId" = uid;
          DELETE FROM "DepartmentMembership" WHERE "companyMembershipId" IN (SELECT id FROM "CompanyMembership" WHERE "userId" = uid);
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
    const stamp = `${companyId.slice(-4)}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`.replace(
      /[^a-zA-Z0-9]/g,
      '',
    );
    const nowStr = new Date().toISOString();
    const jobId = `job-${appId}`;
    const candidateId = `cand-${appId}`;
    const ccId = `cc-${appId}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ('${jobId}', '${companyId}', 'JC-${stamp}', 'slug-${stamp}', 'Engineer', 'FULL_TIME', 'ON_SITE', 'MID', 'Test job', '${membershipId}', '${membershipId}', '${nowStr}', '${nowStr}')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ('${candidateId}', 'Cand', 'Ivty', 'cand-${appId}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ('${ccId}', '${companyId}', '${candidateId}', 'RECRUITER_CREATED', '${nowStr}')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "applicationNumber", "publicReference", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ('${appId}', '${companyId}', '${jobId}', '${candidateId}', '${ccId}', 'AIVTY-${stamp}', 'aivty-ref-${stamp}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')
    `);
  }

  function createInterview(appId: string, token: string) {
    return request(app.getHttpServer())
      .post('/api/v1/ai-interviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ applicationId: appId });
  }

  async function activeCount(companyId: string): Promise<number> {
    return prisma.aiInterview.count({
      where: { companyId, status: { notIn: TERMINAL } },
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AI_INTERVIEW_MAX_CONCURRENT = '2';
    process.env.REDIS_KEY_PREFIX = `talentai_test:ai-interviews-concurrency:${Date.now()}:`;

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

    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'AI Interview Concurrency A',
        email: emailA,
        firstName: 'Ivty',
        lastName: 'A',
        password: 'E2eStr0ng!Pass',
        passwordConfirmation: 'E2eStr0ng!Pass',
        country: 'US',
        timezone: 'America/New_York',
        acceptTerms: true,
      })
      .expect(201);
    companyIdA = regA.body.data.companyId;
    const dbUserA = await prisma.user.findUnique({
      where: { normalizedEmail: emailA.toLowerCase().trim() },
    });
    const memA = (await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${dbUserA!.id}' LIMIT 1`,
    )) as { id: string }[];
    membershipIdA = memA[0].id;
    await prisma.user.update({
      where: { id: dbUserA!.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'AI Interview Concurrency B',
        email: emailB,
        firstName: 'Ivty',
        lastName: 'B',
        password: 'E2eStr0ng!Pass',
        passwordConfirmation: 'E2eStr0ng!Pass',
        country: 'US',
        timezone: 'America/New_York',
        acceptTerms: true,
      })
      .expect(201);
    companyIdB = regB.body.data.companyId;
    const dbUserB = await prisma.user.findUnique({
      where: { normalizedEmail: emailB.toLowerCase().trim() },
    });
    const memB = (await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${dbUserB!.id}' LIMIT 1`,
    )) as { id: string }[];
    membershipIdB = memB[0].id;
    await prisma.user.update({
      where: { id: dbUserB!.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });

    await createApplication(companyIdA, membershipIdA, appA1);
    await createApplication(companyIdA, membershipIdA, appA2);
    await createApplication(companyIdA, membershipIdA, appA3);
    await createApplication(companyIdA, membershipIdA, appA4);
    await createApplication(companyIdA, membershipIdA, appA5);
    await createApplication(companyIdB, membershipIdB, appB1);

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailA, password: 'E2eStr0ng!Pass' })
      .expect(200);
    tokenA = loginA.body.data.tokens.accessToken;
    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailB, password: 'E2eStr0ng!Pass' })
      .expect(200);
    tokenB = loginB.body.data.tokens.accessToken;
  }, 60000);

  afterAll(async () => {
    await cleanUser(emailA);
    await cleanUser(emailB);
    await emailQueue.drain(true);
    await emailQueue.resume();
    await app.close();
  }, 120000);

  it('A1 creates the first interview (slot 1 of 2)', async () => {
    const res = await createInterview(appA1, tokenA);
    expect(res.status).toBe(201);
    expect(res.body.data.applicationId).toBe(appA1);
    expect(res.body.data.status).toBe('CREATED');
    expect(await activeCount(companyIdA)).toBe(1);
  });

  it('concurrent burst across two FRESH applications → exactly 1 created + 1 concurrency-limit (409)', async () => {
    // SuperTest always resolves; a 409 is a plain (non-throwing) response.
    const responses = await Promise.all([
      createInterview(appA2, tokenA),
      createInterview(appA3, tokenA),
    ]);
    const created = responses.filter((r) => r.status === 201);
    const limited = responses.filter((r) => r.status === 409);
    expect(created.length).toBe(1);
    expect(limited.length).toBe(1);
    expect(limited[0].body.statusCode).toBe(409);
    expect(limited[0].body.errorCode).toBe('AI_INTERVIEW_CONCURRENCY_LIMIT');

    // Cap is exactly respected: 2 active (A1 + one of the burst winners), and
    // the advisory lock guaranteed the loser's row was never written.
    const rows = await prisma.aiInterview.findMany({
      where: { companyId: companyIdA, applicationId: { in: [appA2, appA3] } },
    });
    expect(rows.length).toBe(1);
    expect(await activeCount(companyIdA)).toBe(2);
  });

  it('replay for an already-covered application returns the SAME interview at cap, no new row', async () => {
    const existing = await prisma.aiInterview.findFirst({
      where: { applicationId: appA1, companyId: companyIdA },
    });
    expect(existing).toBeDefined();

    const res = await createInterview(appA1, tokenA);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(existing!.id);

    // Dedup happens before the cap check: still 2 active, still 1 row for A1.
    expect(
      await prisma.aiInterview.count({ where: { applicationId: appA1, companyId: companyIdA } }),
    ).toBe(1);
    expect(await activeCount(companyIdA)).toBe(2);
  });

  it('CANCELLED (terminal) releases a slot; a previously-rejected fresh app now succeeds', async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "AiInterview" SET status = 'CANCELLED', "cancelledAt" = now() WHERE id IN (SELECT id FROM "AiInterview" WHERE "companyId" = '${companyIdA}' AND status = 'CREATED' LIMIT 1)`,
    );
    expect(await activeCount(companyIdA)).toBe(1);

    const res = await createInterview(appA4, tokenA);
    expect(res.status).toBe(201);
    expect(await activeCount(companyIdA)).toBe(2);
  });

  it('cross-company: B cannot create an interview for company A application (404 both ways)', async () => {
    const crossB = await createInterview(appA1, tokenB);
    expect(crossB.status).toBe(404);
    expect(crossB.body?.errorCode).toBe('APPLICATION_NOT_FOUND');
    const crossA = await createInterview(appB1, tokenA);
    expect(crossA.status).toBe(404);
    expect(crossA.body?.errorCode).toBe('APPLICATION_NOT_FOUND');
  });

  it('company B is quota-independent: B creates while company A sits at its cap, A rejects a fresh app', async () => {
    expect(await activeCount(companyIdA)).toBe(2);
    expect(await activeCount(companyIdB)).toBe(0);

    const burst = await Promise.all([
      createInterview(appA5, tokenA), // NEW application, company A already at cap → must 409
      createInterview(appB1, tokenB), // company B quota untouched → 201
      createInterview(appB1, tokenB), // replay for B → same id, no extra row
    ]);

    expect(burst[0].status).toBe(409);
    expect(burst[0].body.errorCode).toBe('AI_INTERVIEW_CONCURRENCY_LIMIT');
    expect(burst[1].status).toBe(201);
    expect(burst[2].status).toBe(201);
    expect(burst[1].body.data.id).toBe(burst[2].body.data.id);

    expect(await activeCount(companyIdA)).toBe(2);
    expect(await activeCount(companyIdB)).toBe(1);
  }, 30000);
});
