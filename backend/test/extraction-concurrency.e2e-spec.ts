import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ResumeExtractionService } from '../src/modules/resume-processing/services/resume-extraction.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { LocalStorageProvider } from '../src/modules/files/providers/local-storage.provider';
import { randomUUID, createHash } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import Redis from 'ioredis';
import { flushTestRedis } from './helpers/redis-cleanup';
import * as JSZip from 'jszip';

function createTestDocxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`,
  );
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  return zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('Extraction concurrency & security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let extractionService: ResumeExtractionService;
  let storage: LocalStorageProvider;

  // Company A
  let accessTokenA: string;
  let companyIdA: string;
  let userIdA: string;
  let storedFileIdA: string;
  let filePathA: string;
  let storageKeyA: string;

  // Company B
  let accessTokenB: string;
  let companyIdB: string;
  let userIdB: string;
  let storedFileIdB: string;
  let filePathB: string;
  let storageKeyB: string;

  const emailA = `ext-con-a-${Date.now()}@e2e.com`;
  const emailB = `ext-con-b-${Date.now()}@e2e.com`;

  const userA = {
    companyName: 'Extraction Concurrency A',
    email: emailA,
    firstName: 'Extract',
    lastName: 'A',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  const userB = {
    companyName: 'Extraction Concurrency B',
    email: emailB,
    firstName: 'Extract',
    lastName: 'B',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  const testDocxText = 'Hello World Resume Extraction Test ' + Date.now();
  let docxBuffer: Buffer;
  let docxChecksum: string;

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function cleanUser(email: string) {
    const norm = email.toLowerCase().trim();
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ DECLARE uid TEXT; cids TEXT[]; BEGIN
          SELECT id INTO uid FROM "User" WHERE "normalizedEmail" = '${norm}';
          IF uid IS NULL THEN RETURN; END IF;
          SELECT ARRAY(SELECT "companyId" FROM "CompanyMembership" WHERE "userId" = uid) INTO cids;
          DELETE FROM "ExtractionDispatch" WHERE "extractionId" IN (SELECT id FROM "ResumeTextExtraction" WHERE "companyId" = ANY(cids));
          DELETE FROM "ResumeTextExtraction" WHERE "companyId" = ANY(cids);
          DELETE FROM "AiScreeningResult" WHERE "companyId" = ANY(cids);
          DELETE FROM "ApplicationScreeningAnswer" WHERE "applicationId" IN (SELECT id FROM "Application" WHERE "companyId" = ANY(cids));
          DELETE FROM "Application" WHERE "companyId" = ANY(cids);
          DELETE FROM "ApplicationCounter" WHERE "companyId" = ANY(cids);
          DELETE FROM "JobAccessibilityConfiguration" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "JobScreeningConfiguration" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "JobScreeningQuestion" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "JobPipelineStage" WHERE "pipelineId" IN (SELECT id FROM "JobPipeline" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids)));
          DELETE FROM "JobPipeline" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "Job" WHERE "companyId" = ANY(cids);
          DELETE FROM "CandidateMergeRecord" WHERE "primaryCandidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids))) OR "mergedCandidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)));
          DELETE FROM "CandidateSkill" WHERE "candidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)));
          DELETE FROM "CandidateAuditEvent" WHERE "candidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)));
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "StoredFile" WHERE "companyId" = ANY(cids);
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

  async function registerAndLogin(
    user: typeof userA,
  ): Promise<{ accessToken: string; companyId: string; userId: string }> {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send(user)
      .expect(201);

    const norm = user.email.toLowerCase().trim();
    const dbUser = await prisma.user.findUnique({ where: { normalizedEmail: norm } });
    if (dbUser && dbUser.status !== 'ACTIVE') {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    return {
      accessToken: loginRes.body.data.tokens.accessToken,
      companyId: regRes.body.data.companyId,
      userId: dbUser!.id,
    };
  }

  async function createStoredFile(
    companyId: string,
    userId: string,
    buffer: Buffer,
    checksum: string,
  ): Promise<{ storedFileId: string; filePath: string; storageKey: string }> {
    const storedName = storage.generateStoredName('docx');
    const putResult = await storage.put(
      companyId,
      storedName,
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const absolutePath = join(storage['basePath'], putResult.storageKey);
    expect(await storage.exists(putResult.storageKey)).toBe(true);

    const storedFile = await prisma.storedFile.create({
      data: {
        companyId,
        uploadedByUserId: userId,
        storageKey: putResult.storageKey,
        originalName: 'resume.docx',
        storedName,
        extension: '.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: buffer.length,
        checksumSha256: checksum,
        category: 'RESUME',
        status: 'ACTIVE',
      },
    });
    return {
      storedFileId: storedFile.id,
      filePath: absolutePath,
      storageKey: putResult.storageKey,
    };
  }

  // ── Setup / Teardown ──────────────────────────────────────────────────────

  beforeAll(async () => {
    const dotenv = require('dotenv');
    dotenv.config({ path: require('path').join(__dirname, 'env', 'test.env') });
    process.env.NODE_ENV = 'test';

    const redisPort = parseInt(process.env.REDIS_PORT || '6380', 10);
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: redisPort,
      db: 0,
    });
    await flushTestRedis(redis);
    await redis.quit();

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
    extractionService = app.get(ResumeExtractionService);
    storage = app.get(LocalStorageProvider);

    docxBuffer = await createTestDocxBuffer(testDocxText);
    docxChecksum = createHash('sha256').update(docxBuffer).digest('hex');

    await cleanUser(userA.email);
    await cleanUser(userB.email);

    // Register + Login Company A
    const authA = await registerAndLogin(userA);
    accessTokenA = authA.accessToken;
    companyIdA = authA.companyId;
    userIdA = authA.userId;

    // Register + Login Company B
    const authB = await registerAndLogin(userB);
    accessTokenB = authB.accessToken;
    companyIdB = authB.companyId;
    userIdB = authB.userId;

    // Create stored files
    const fileA = await createStoredFile(companyIdA, userIdA, docxBuffer, docxChecksum);
    storedFileIdA = fileA.storedFileId;
    filePathA = fileA.filePath;
    storageKeyA = fileA.storageKey;

    const fileB = await createStoredFile(companyIdB, userIdB, docxBuffer, docxChecksum);
    storedFileIdB = fileB.storedFileId;
    filePathB = fileB.filePath;
    storageKeyB = fileB.storageKey;
  }, 60000);

  afterAll(async () => {
    cleanupFile(filePathA);
    cleanupFile(filePathB);
    await cleanUser(userA.email);
    await cleanUser(userB.email);
    await app.close();
  });

  // ── 1. Auth guard — HTTP endpoints require authentication ────────────────

  describe('1. Auth guard — HTTP layer', () => {
    it('returns 401 on health endpoint without token (JwtAuthGuard active)', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('accepts valid access token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);
    });

    it('rejects expired or invalid token with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.invalid')
        .expect(401);
    });
  });

  // ── 2. Same-actor concurrency ───────────────────────────────────────────

  describe('2. Five-way concurrency — stable outcome', () => {
    let commonExtractionId: string;

    it('1 CREATED + 4 REUSED with the same extraction ID', async () => {
      const CONCURRENCY = 5;
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () =>
          extractionService.requestExtraction(storedFileIdA, companyIdA),
        ),
      );

      type ExtractionResult = { action: string; extraction: { id: string; status: string } };

      for (let i = 0; i < CONCURRENCY; i++) {
        const r = results[i];
        expect(r.status).toBe('fulfilled');
        const val = (r as PromiseFulfilledResult<ExtractionResult>).value;
        expect(['CREATED', 'REUSED']).toContain(val.action);
        expect(val.extraction.id).toBeTruthy();
      }

      const extractionIds = new Set(
        results.map((r) => (r as PromiseFulfilledResult<ExtractionResult>).value.extraction.id),
      );
      expect(extractionIds.size).toBe(1);
      commonExtractionId = extractionIds.values().next().value;

      // DB proof: exactly one extraction row
      const extractionCount = await prisma.resumeTextExtraction.count({
        where: { id: commonExtractionId, storedFileId: storedFileIdA, companyId: companyIdA },
      });
      expect(extractionCount).toBe(1);
    }, 30000);

    it('worker processes the extraction to COMPLETED', async () => {
      let extraction: {
        status: string;
        extractedText: string | null;
        extractedTextSha256: string | null;
      } | null = null;
      for (let i = 0; i < 30; i++) {
        extraction = await prisma.resumeTextExtraction.findUnique({
          where: { id: commonExtractionId },
          select: { status: true, extractedText: true, extractedTextSha256: true },
        });
        if (extraction && extraction.status === 'COMPLETED') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(extraction).toBeDefined();
      expect(extraction!.status).toBe('COMPLETED');

      // BullMQ proof: text matches
      expect(extraction!.extractedText).toBeDefined();
      expect(extraction!.extractedText).toContain(testDocxText);
      expect(extraction!.extractedTextSha256).toBeDefined();

      // Dispatch proof: exactly one dispatch record, DISPATCHED
      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: commonExtractionId },
      });
      expect(dispatch).toBeDefined();
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');
      expect(dispatch!.jobId).toBe(commonExtractionId);
    }, 60000);

    it('replay returns REUSED with same extraction ID', async () => {
      const replayResult = await extractionService.requestExtraction(storedFileIdA, companyIdA);
      expect(replayResult.action).toBe('REUSED');
      expect(replayResult.extraction.id).toBe(commonExtractionId);

      // No new dispatch record
      const dispatchCountAfter = await prisma.extractionDispatch.count({
        where: { extractionId: commonExtractionId },
      });
      expect(dispatchCountAfter).toBe(1);
    });
  });

  // ── 3. Dispatch crash recovery — stale lease reclamation ──────────────

  describe('3. Dispatch crash recovery — stale lease reclamation', () => {
    let storedFileId: string;
    let filePath: string;
    let extractionId: string;

    beforeAll(async () => {
      const storedName = storage.generateStoredName('docx');
      const putResult = await storage.put(
        companyIdA,
        storedName,
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      filePath = join(storage['basePath'], putResult.storageKey);
      const sf = await prisma.storedFile.create({
        data: {
          companyId: companyIdA,
          uploadedByUserId: userIdA,
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
      storedFileId = sf.id;
    });

    afterAll(() => {
      cleanupFile(filePath);
    });

    it('simulates crash by leaving dispatch in DISPATCHING then reclaims', async () => {
      const result = await extractionService.requestExtraction(storedFileId, companyIdA);
      expect(result.action).toBe('CREATED');
      extractionId = result.extraction.id;

      await prisma.extractionDispatch.updateMany({
        where: { extractionId },
        data: {
          dispatchStatus: 'DISPATCHING',
          leaseStartedAt: new Date(Date.now() - 60000),
        },
      });

      const replay = await extractionService.requestExtraction(storedFileId, companyIdA);
      expect(replay.action).toBe('REUSED');

      let extraction: { status: string } | null = null;
      for (let i = 0; i < 30; i++) {
        extraction = await prisma.resumeTextExtraction.findUnique({
          where: { id: extractionId },
          select: { status: true },
        });
        if (extraction && extraction.status === 'COMPLETED') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(extraction).toBeDefined();
      expect(extraction!.status).toBe('COMPLETED');
    }, 60000);
  });

  // ── 4. Retry generation — DB-backed identity ──────────────────────────

  describe('4. Retry generation — DB-backed identity', () => {
    let storedFileId: string;
    let filePath: string;

    beforeAll(async () => {
      const storedName = storage.generateStoredName('docx');
      const putResult = await storage.put(
        companyIdA,
        storedName,
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      filePath = join(storage['basePath'], putResult.storageKey);
      const sf = await prisma.storedFile.create({
        data: {
          companyId: companyIdA,
          uploadedByUserId: userIdA,
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
      storedFileId = sf.id;
    });

    afterAll(() => {
      cleanupFile(filePath);
    });

    async function createFailedExtraction(): Promise<string> {
      const ext = await prisma.resumeTextExtraction.create({
        data: {
          storedFileId,
          companyId: companyIdA,
          initiatedByUserId: userIdA,
          status: 'FAILED',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test-parser',
          parserVersion: '1.0.0',
          failureCode: 'MANUAL_FAIL',
          completedAt: new Date(),
        },
      });
      return ext.id;
    }

    it('creates retry with incremented retryGeneration', async () => {
      // Create one FAILED extraction via DB (avoids worker race)
      await createFailedExtraction();

      const retryResult = await extractionService.retryExtraction(
        storedFileId,
        companyIdA,
        userIdA,
      );
      expect(retryResult.action).toBe('CREATED');

      const retryExtraction = await prisma.resumeTextExtraction.findUnique({
        where: { id: retryResult.extraction.id },
        select: { retryGeneration: true, status: true },
      });
      expect(retryExtraction).toBeDefined();
      // failedCount = 1 (one manually-created FAILED extraction)
      // retryGeneration = failedCount + 1 = 2
      expect(retryExtraction!.retryGeneration).toBe(2);
    }, 15000);

    it('enforces retry limit', async () => {
      // Count existing FAILED extractions for this file
      await prisma.resumeTextExtraction.updateMany({
        where: { storedFileId, companyId: companyIdA, status: { not: 'FAILED' } },
        data: { status: 'FAILED', failureCode: 'MANUAL_FAIL', completedAt: new Date() },
      });

      const existing = await prisma.resumeTextExtraction.findMany({
        where: { storedFileId, companyId: companyIdA },
        select: { id: true },
      });
      await prisma.extractionDispatch.deleteMany({
        where: { extractionId: { in: existing.map((e) => e.id) } },
      });

      const failedCount = await prisma.resumeTextExtraction.count({
        where: {
          storedFileId,
          companyId: companyIdA,
          sourceFileSha256: docxChecksum,
          status: 'FAILED',
        },
      });

      // Fill remaining retry slots with DB-created FAILED records (no worker involvement)
      for (let i = failedCount; i < 3; i++) {
        await createFailedExtraction();
      }

      // Now all retry attempts are exhausted -> should throw
      await expect(
        extractionService.retryExtraction(storedFileId, companyIdA, userIdA),
      ).rejects.toThrow('Resume extraction has failed after maximum retry attempts');
    }, 15000);
  });

  // ── 5. Cross-company isolation ─────────────────────────────────────────

  describe('5. Cross-company isolation', () => {
    it('Company B gets error when using Company A stored file ID', async () => {
      await expect(extractionService.requestExtraction(storedFileIdA, companyIdB)).rejects.toThrow(
        'Resume file not found',
      );
    });

    it('Company A gets error when using Company B stored file ID', async () => {
      await expect(extractionService.requestExtraction(storedFileIdB, companyIdA)).rejects.toThrow(
        'Resume file not found',
      );
    });

    it('Company B cannot retry Company A extraction', async () => {
      await expect(
        extractionService.retryExtraction(storedFileIdA, companyIdB, userIdB),
      ).rejects.toThrow('Resume file not found');
    });
  });
});
