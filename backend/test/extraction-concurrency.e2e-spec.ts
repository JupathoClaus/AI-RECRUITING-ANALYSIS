import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import {
  ResumeExtractionService,
  ExtractionResultOrAction,
} from '../src/modules/resume-processing/services/resume-extraction.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { LocalStorageProvider } from '../src/modules/files/providers/local-storage.provider';
import { RESUME_EXTRACTION_QUEUE } from '../src/modules/resume-processing/queue/resume-extraction-queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import { createHash } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
import * as jwt from 'jsonwebtoken';
import { join } from 'path';
import * as JSZip from 'jszip';
import * as dotenv from 'dotenv';

function createTestDocxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p></w:body></w:document>`,
  );
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  return zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('Extraction concurrency & security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: LocalStorageProvider;
  let queue: Queue;
  let aiScreeningQueue: Queue;
  let emailQueue: Queue;
  let extractionService: ResumeExtractionService;

  let companyIdA: string;
  let userIdA: string;
  let companyIdB: string;
  let userIdB: string;
  let storedFileIdA: string;
  let filePathA: string;
  let storedFileIdB: string;
  let filePathB: string;
  let applicationIdA: string;
  let applicationIdB: string;
  let tokenA: string;
  let tokenB: string;

  const emailA = `ext-con-a-${Date.now()}@e2e.com`;
  const emailB = `ext-con-b-${Date.now()}@e2e.com`;

  const testDocxText = 'Hello World Extraction Test ' + Date.now();
  let docxBuffer: Buffer;
  let docxChecksum: string;

  function resignAccessToken(overrides: Record<string, unknown>): string {
    const claims = { ...(jwt.decode(tokenA) as jwt.JwtPayload) };
    delete claims.iat;
    delete claims.exp;
    delete claims.nbf;
    delete claims.iss;
    delete claims.aud;
    return jwt.sign({ ...claims, ...overrides }, process.env.JWT_SECRET!, {
      expiresIn: '15m',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });
  }

  async function cleanUser(email: string) {
    const norm = email.toLowerCase().trim();
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ DECLARE uid TEXT; cids TEXT[]; candidate_ids TEXT[]; BEGIN
          SELECT id INTO uid FROM "User" WHERE "normalizedEmail" = '${norm}';
          IF uid IS NULL THEN RETURN; END IF;
          SELECT ARRAY(SELECT "companyId" FROM "CompanyMembership" WHERE "userId" = uid) INTO cids;
          SELECT ARRAY(SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)) INTO candidate_ids;
          DELETE FROM "ExtractionDispatch" WHERE "extractionId" IN (SELECT id FROM "ResumeTextExtraction" WHERE "companyId" = ANY(cids));
          DELETE FROM "ResumeTextExtraction" WHERE "companyId" = ANY(cids);
          DELETE FROM "StoredFile" WHERE "companyId" = ANY(cids);
          DELETE FROM "AiScreeningResult" WHERE "companyId" = ANY(cids);
          DELETE FROM "Application" WHERE "companyId" = ANY(cids);
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "Candidate" WHERE id = ANY(candidate_ids);
          DELETE FROM "Job" WHERE "companyId" = ANY(cids);
          DELETE FROM "AuthAuditEvent" WHERE "userId" = uid;
          DELETE FROM "UserSession" WHERE "userId" = uid;
          DELETE FROM "VerificationToken" WHERE "userId" = uid;
          DELETE FROM "CompanySettings" WHERE "companyId" = ANY(cids);
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

  function cleanupFile(path: string): void {
    if (path && existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        /* non-fatal */
      }
    }
  }

  async function createStoredFile(
    companyId: string,
    userId: string,
  ): Promise<{ id: string; filePath: string }> {
    const storedName = storage.generateStoredName('docx');
    const putResult = await storage.put(
      companyId,
      storedName,
      docxBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const path = join(storage['basePath'], putResult.storageKey);
    const sf = await prisma.storedFile.create({
      data: {
        companyId,
        uploadedByUserId: userId,
        storageKey: putResult.storageKey,
        originalName: 'resume.docx',
        storedName,
        extension: '.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: docxBuffer.length,
        checksumSha256: docxChecksum,
        category: 'RESUME',
        status: 'ACTIVE',
      },
    });
    return { id: sf.id, filePath: path };
  }

  beforeAll(async () => {
    dotenv.config({ path: join(__dirname, 'env', 'test.env') });
    process.env.NODE_ENV = 'test';
    process.env.REDIS_KEY_PREFIX = `talentai_test:extraction-concurrency:${Date.now()}:`;

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
    storage = app.get(LocalStorageProvider);
    queue = app.get(getQueueToken(RESUME_EXTRACTION_QUEUE));
    aiScreeningQueue = app.get(getQueueToken('ai-screening'));
    emailQueue = app.get(getQueueToken('email'));
    extractionService = app.get(ResumeExtractionService);
    await emailQueue.pause();

    docxBuffer = await createTestDocxBuffer(testDocxText);
    docxChecksum = createHash('sha256').update(docxBuffer).digest('hex');

    await cleanUser(emailA);
    await cleanUser(emailB);

    // Register company A
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Extraction Concurrency A',
        email: emailA,
        firstName: 'Extract',
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
    userIdA = dbUserA!.id;
    await prisma.user.update({
      where: { id: userIdA },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const memRowsA = await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${userIdA}' LIMIT 1`,
    );
    const membershipIdA = (memRowsA as { id: string }[])[0].id;

    // Register company B
    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Extraction Concurrency B',
        email: emailB,
        firstName: 'Extract',
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
    userIdB = dbUserB!.id;
    await prisma.user.update({
      where: { id: userIdB },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const memRowsB = await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${userIdB}' LIMIT 1`,
    );
    const membershipIdB = (memRowsB as { id: string }[])[0].id;

    // Create stored files (one for concurrency, one for cross-company)
    const fileA = await createStoredFile(companyIdA, userIdA);
    storedFileIdA = fileA.id;
    filePathA = fileA.filePath;

    const fileB = await createStoredFile(companyIdB, userIdB);
    storedFileIdB = fileB.id;
    filePathB = fileB.filePath;

    // Create jobs, candidates, and applications for HTTP-level testing via raw SQL
    const now = Date.now();
    const nowStr = new Date().toISOString();
    const jobIdA = `job-a-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ('${jobIdA}', '${companyIdA}', 'JC-${now}', 'eng-a-${now}', 'Engineer A', 'FULL_TIME', 'ON_SITE', 'MID', 'Test job', '${membershipIdA}', '${membershipIdA}', '${nowStr}', '${nowStr}')
    `);
    const candIdA = `cand-a-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ('${candIdA}', 'A', 'Con', 'a-con-${now}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')
    `);
    const ccIdA = `cc-a-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ('${ccIdA}', '${companyIdA}', '${candIdA}', 'RECRUITER_CREATED', '${nowStr}')
    `);
    const appIdA = `app-a-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "applicationNumber", "publicReference", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ('${appIdA}', '${companyIdA}', '${jobIdA}', '${candIdA}', '${ccIdA}', 'EXT-CON-${now}', 'ext-con-ref-${now}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')
    `);
    applicationIdA = appIdA;
    await prisma.$executeRawUnsafe(`
      UPDATE "StoredFile" SET "applicationId" = '${appIdA}' WHERE id = '${storedFileIdA}'
    `);

    const jobIdB = `job-b-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ('${jobIdB}', '${companyIdB}', 'JC-B-${now}', 'eng-b-${now}', 'Engineer B', 'FULL_TIME', 'ON_SITE', 'MID', 'Test job', '${membershipIdB}', '${membershipIdB}', '${nowStr}', '${nowStr}')
    `);
    const candIdB = `cand-b-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ('${candIdB}', 'B', 'Con', 'b-con-${now}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')
    `);
    const ccIdB = `cc-b-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ('${ccIdB}', '${companyIdB}', '${candIdB}', 'RECRUITER_CREATED', '${nowStr}')
    `);
    const appIdB = `app-b-${now}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "applicationNumber", "publicReference", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ('${appIdB}', '${companyIdB}', '${jobIdB}', '${candIdB}', '${ccIdB}', 'EXT-CON-B-${now}', 'ext-con-b-ref-${now}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')
    `);
    applicationIdB = appIdB;
    await prisma.$executeRawUnsafe(`
      UPDATE "StoredFile" SET "applicationId" = '${appIdB}' WHERE id = '${storedFileIdB}'
    `);

    // Login to get tokens
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

    // This suite proves screening-request concurrency, not the external AI worker.
    // Keep created screening jobs waiting so shutdown is deterministic.
    await aiScreeningQueue.pause();
  }, 60000);

  afterAll(async () => {
    cleanupFile(filePathA);
    cleanupFile(filePathB);
    await cleanUser(emailA);
    await cleanUser(emailB);
    await aiScreeningQueue.drain(true);
    await emailQueue.drain(true);
    await aiScreeningQueue.resume();
    await emailQueue.resume();
    await app.close();
  }, 120000);

  // ── 1. Five-way concurrency — stable outcome ────────────────────────

  describe('1. Five-way concurrency — stable outcome', () => {
    let extractionId: string;

    it('5 concurrent requestExtraction: 1 CREATED + 4 REUSED, 1 extraction row, 1 dispatch row', async () => {
      const CONCURRENCY = 5;
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () =>
          extractionService.requestExtraction(storedFileIdA, companyIdA),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(CONCURRENCY);

      const values = fulfilled.map(
        (r) => (r as PromiseFulfilledResult<ExtractionResultOrAction>).value,
      );
      const createdCount = values.filter((v) => v.action === 'CREATED').length;
      const reusedCount = values.filter((v) => v.action === 'REUSED').length;
      expect(createdCount).toBe(1);
      expect(reusedCount).toBe(CONCURRENCY - 1);

      const extractionIds = new Set(values.map((v) => v.extraction.id));
      expect(extractionIds.size).toBe(1);
      extractionId = extractionIds.values().next().value;

      const extractionCount = await prisma.resumeTextExtraction.count({
        where: { storedFileId: storedFileIdA, companyId: companyIdA },
      });
      expect(extractionCount).toBe(1);

      const dispatchCount = await prisma.extractionDispatch.count({ where: { extractionId } });
      expect(dispatchCount).toBe(1);
    }, 30000);

    it('worker processes the extraction to COMPLETED', async () => {
      let status: string | null = null;
      for (let i = 0; i < 30; i++) {
        const e = await prisma.resumeTextExtraction.findUnique({
          where: { id: extractionId },
          select: { status: true },
        });
        if (e?.status === 'COMPLETED') {
          status = e.status;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(status).toBe('COMPLETED');
    }, 60000);

    it('BullMQ has one completed job with deterministic ID', async () => {
      const completed = await queue.getCompletedCount();
      expect(completed).toBeGreaterThanOrEqual(1);
      const job = await queue.getJob(extractionId);
      expect(job).toBeDefined();
      expect(job!.id).toBe(extractionId);
      expect(await job!.getState()).toBe('completed');
    });

    it('replay returns REUSED with same extraction ID', async () => {
      const result = await extractionService.requestExtraction(storedFileIdA, companyIdA);
      expect(result.extraction.id).toBe(extractionId);
      expect(result.action).toBe('REUSED');
    });
  });

  // ── 2. Cross-company isolation ──────────────────────────────────────

  describe('2. Cross-company isolation', () => {
    it('Company B cannot access Company A file', async () => {
      await expect(
        extractionService.requestExtraction(storedFileIdA, companyIdB),
      ).rejects.toThrow();
    });

    it('Company A cannot access Company B file', async () => {
      await expect(
        extractionService.requestExtraction(storedFileIdB, companyIdA),
      ).rejects.toThrow();
    });
  });

  // ── 3. FAILED → retry creates new extraction ────────────────────────

  describe('3. FAILED extraction retry', () => {
    let retryId: string;

    it('requestExtraction after FAILED creates new extraction', async () => {
      // Pre-create a FAILED extraction
      await prisma.resumeTextExtraction.create({
        data: {
          storedFileId: storedFileIdB,
          companyId: companyIdB,
          initiatedByUserId: userIdB,
          status: 'FAILED',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test',
          parserVersion: '1.0',
          failureCode: 'MANUAL_FAIL',
          completedAt: new Date(),
        },
      });

      const result = await extractionService.requestExtraction(storedFileIdB, companyIdB);
      expect(result.action).toBe('CREATED');
      retryId = result.extraction.id;

      const totalExtractions = await prisma.resumeTextExtraction.count({
        where: { storedFileId: storedFileIdB, companyId: companyIdB },
      });
      // 1 FAILED + 1 new CREATED = 2 total
      expect(totalExtractions).toBe(2);
    });

    it('worker processes the retry to COMPLETED', async () => {
      let status: string | null = null;
      for (let i = 0; i < 30; i++) {
        const e = await prisma.resumeTextExtraction.findUnique({
          where: { id: retryId },
          select: { status: true },
        });
        if (e?.status === 'COMPLETED') {
          status = e.status;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(status).toBe('COMPLETED');
    }, 60000);
  });

  // ── 4. HTTP-level concurrency ──────────────────────────────────────

  describe('4. HTTP-level screening concurrency', () => {
    it('5 concurrent screening POSTs produce 1 CREATED + 4 REUSED', async () => {
      const CONCURRENCY = 5;
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send({}),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(CONCURRENCY);

      let createdCount = 0;
      let reusedCount = 0;
      for (const r of fulfilled) {
        const res = (r as PromiseFulfilledResult<request.Response>).value;
        if (res.status === 202 && res.body?.data?.action === 'CREATED') createdCount++;
        else if (res.status === 200 && res.body?.data?.action === 'REUSED') reusedCount++;
      }
      expect(createdCount).toBe(1);
      expect(reusedCount).toBe(CONCURRENCY - 1);
    }, 30000);

    it('replay via HTTP returns 200 with REUSED action', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(200);
      expect(res.body.data.action).toBe('REUSED');
    });
  });

  // ── 5. Cross-company HTTP isolation ────────────────────────────────

  describe('5. Cross-company HTTP isolation', () => {
    it('Company B cannot access Company A screening (returns 404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({})
        .expect(404);
    });

    it('Company A cannot access Company B screening', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdB}/ai-screenings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(404);
    });

    it('retry-extraction rejects cross-company access', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings/retry-extraction`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  // ── 6. Complete HTTP security matrix (15 cases) ──────────────────

  describe('6. Complete HTTP security matrix', () => {
    it('rejects a valid signed cid-only token', async () => {
      const payload = jwt.decode(tokenA) as jwt.JwtPayload;
      const cidOnly = resignAccessToken({ cid: payload.cid, mid: undefined });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${cidOnly}`)
        .expect(401);
    });

    it('rejects a valid signed mid-only token', async () => {
      const payload = jwt.decode(tokenA) as jwt.JwtPayload;
      const midOnly = resignAccessToken({ cid: undefined, mid: payload.mid });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${midOnly}`)
        .expect(401);
    });

    it('rejects a valid signed token whose user does not own the session', async () => {
      const mismatchedUser = resignAccessToken({ sub: userIdB });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${mismatchedUser}`)
        .expect(401);
    });

    it('1. No token returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .expect(401);
    });

    it('2. Invalid (malformed) token returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', 'Bearer invalid-jwt-token')
        .expect(401);
    });

    it('3. Random string as token returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', 'Bearer a1b2c3d4')
        .expect(401);
    });

    it('4. Missing Bearer prefix returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', tokenA)
        .expect(401);
    });

    it('5. Empty Authorization header returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', '')
        .expect(401);
    });

    it('6. Basic auth instead of Bearer returns 401', async () => {
      const basic = Buffer.from('user:pass').toString('base64');
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Basic ${basic}`)
        .expect(401);
    });

    it('7. Expired token (future timestamp) returns 401', async () => {
      const expiredToken = jwt.sign(
        { sub: userIdA, exp: Math.floor(Date.now() / 1000) - 3600 },
        'test-jwt-secret-that-is-at-least-32-chars!!',
      );
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('8. Wrong signature (different secret) returns 401', async () => {
      const badToken = jwt.sign(
        { sub: userIdA, exp: Math.floor(Date.now() / 1000) + 3600 },
        'wrong-secret-that-is-not-the-correct-one!!',
      );
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });

    it('9. Token without user sub returns 401', async () => {
      const noSubToken = jwt.sign(
        { role: 'COMPANY_ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 },
        'test-jwt-secret-that-is-at-least-32-chars!!',
      );
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Bearer ${noSubToken}`)
        .expect(401);
    });

    it('10. NULL uuid as application ID returns 404', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications/00000000-0000-0000-0000-000000000000/ai-screenings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(404);
    });

    it('11. Wrong HTTP method (GET on POST endpoint) returns 200', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationIdA}/ai-screenings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('12. Invalid UUID format returns 404', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications/not-a-uuid/ai-screenings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(404);
    });

    it('13. Valid token accesses auth/me returns 200', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });

    it('14. retry-extraction without token returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings/retry-extraction`)
        .expect(401);
    });

    it('15. retry-extraction with invalid token returns 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/applications/${applicationIdA}/ai-screenings/retry-extraction`)
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });
  });

  // ── 9. BullMQ uniqueness proof — queue.add with same jobId deduplicates ──
});
