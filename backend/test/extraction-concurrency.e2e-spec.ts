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
import { createHash, randomUUID } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
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
  let extractionService: ResumeExtractionService;

  let companyIdA: string;
  let userIdA: string;
  let companyIdB: string;
  let userIdB: string;
  let storedFileIdA: string;
  let filePathA: string;
  let storedFileIdB: string;
  let filePathB: string;

  const emailA = `ext-con-a-${Date.now()}@e2e.com`;
  const emailB = `ext-con-b-${Date.now()}@e2e.com`;

  const testDocxText = 'Hello World Extraction Test ' + Date.now();
  let docxBuffer: Buffer;
  let docxChecksum: string;

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
    extractionService = app.get(ResumeExtractionService);

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

    // Create stored files (one for concurrency, one for cross-company)
    const fileA = await createStoredFile(companyIdA, userIdA);
    storedFileIdA = fileA.id;
    filePathA = fileA.filePath;

    const fileB = await createStoredFile(companyIdB, userIdB);
    storedFileIdB = fileB.id;
    filePathB = fileB.filePath;
  }, 60000);

  afterAll(async () => {
    cleanupFile(filePathA);
    cleanupFile(filePathB);
    await queue.close();
    await cleanUser(emailA);
    await cleanUser(emailB);
    await prisma.$disconnect();
    await app.close();
  });

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

  // ── 4. HTTP security — auth guards at HTTP layer ─────────────────

  describe('4. HTTP security — auth guards at HTTP layer', () => {
    let tokenA: string;

    beforeAll(async () => {
      const loginA = await request(app.getHttpServer())
        .post('/api/v1/auth/login').send({ email: emailA, password: 'E2eStr0ng!Pass' }).expect(200);
      tokenA = loginA.body.data.tokens.accessToken;
    });

    it('returns 401 on protected endpoint without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('returns 401 on retry-extraction without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications/00000000-0000-0000-0000-000000000000/ai-screenings/retry-extraction')
        .expect(401);
    });

    it('accepts valid access token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200);
    });

    it('rejects invalid token with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', 'Bearer invalid').expect(401);
    });
  });
});
