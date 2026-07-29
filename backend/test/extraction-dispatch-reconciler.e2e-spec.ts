import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app/app.module';
import { ResumeExtractionService } from '../src/modules/resume-processing/services/resume-extraction.service';
import { ExtractionDispatchReconcilerService } from '../src/modules/resume-processing/services/extraction-dispatch-reconciler.service';
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

describe('ExtractionDispatchReconciler (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let reconciler: ExtractionDispatchReconcilerService;
  let extractionService: ResumeExtractionService;
  let storage: LocalStorageProvider;
  let companyId: string;
  let userId: string;
  let storedFileId: string;
  let filePath: string;
  const testDocxText = 'Dispatch Reconciler Test ' + Date.now();
  let docxBuffer: Buffer;
  let docxChecksum: string;

  async function createTestStoredFile(): Promise<{ storedFileId: string; filePath: string }> {
    const storedName = storage.generateStoredName('docx');
    const putResult = await storage.put(
      companyId,
      storedName,
      docxBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const absolutePath = join(storage['basePath'], putResult.storageKey);
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
    return { storedFileId: sf.id, filePath: absolutePath };
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
    await app.init();

    prisma = app.get(PrismaService);
    reconciler = app.get(ExtractionDispatchReconcilerService);
    extractionService = app.get(ResumeExtractionService);
    storage = app.get(LocalStorageProvider);

    docxBuffer = await createTestDocxBuffer(testDocxText);
    docxChecksum = createHash('sha256').update(docxBuffer).digest('hex');

    companyId = randomUUID();
    userId = randomUUID();
    await prisma.company.create({
      data: {
        id: companyId,
        name: 'ReconcilerTest',
        slug: `reconciler-${Date.now()}`,
        country: 'US',
        timezone: 'UTC',
      },
    });

    const fileInfo = await createTestStoredFile();
    storedFileId = fileInfo.storedFileId;
    filePath = fileInfo.filePath;
  }, 60000);

  afterAll(async () => {
    cleanupFile(filePath);
    await prisma.extractionDispatch.deleteMany({
      where: { extraction: { companyId } },
    });
    await prisma.resumeTextExtraction.deleteMany({ where: { companyId } });
    await prisma.storedFile.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await app.close();
  });

  // ── 1. Stale DISPATCHING lease → job exists → DISPATCHED ───────────────

  describe('1. Stale DISPATCHING recovery', () => {
    it('reclaims stale DISPATCHING → DISPATCHED when job exists in BullMQ', async () => {
      const result = await extractionService.requestExtraction(storedFileId, companyId, userId);
      expect(result.action).toBe('CREATED');
      const extractionId = result.extraction.id;

      await prisma.extractionDispatch.update({
        where: { extractionId },
        data: {
          dispatchStatus: 'DISPATCHING',
          leaseStartedAt: new Date(Date.now() - 60000),
        },
      });

      const outcome = await reconciler.reconcile();

      expect(outcome.reclaimed).toBeGreaterThanOrEqual(1);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');
    }, 30000);
  });

  // ── 2. PENDING_DISPATCH dispatch ──────────────────────────────────────

  describe('2. PENDING_DISPATCH dispatch', () => {
    it('dispatches a PENDING_DISPATCH extraction via reconcile', async () => {
      const ext = await prisma.resumeTextExtraction.create({
        data: {
          storedFileId,
          companyId,
          initiatedByUserId: userId,
          status: 'PENDING',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test',
          parserVersion: '1.0',
        },
      });

      const dispatchId = randomUUID();
      await prisma.extractionDispatch.create({
        data: {
          id: dispatchId,
          extractionId: ext.id,
          dispatchStatus: 'PENDING_DISPATCH',
        },
      });

      await reconciler.dispatchOne(ext.id);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');
      expect(dispatch!.jobId).toBe(ext.id);

      const extraction = await prisma.resumeTextExtraction.findUnique({
        where: { id: ext.id },
      });
      let completed = false;
      for (let i = 0; i < 30; i++) {
        const current = await prisma.resumeTextExtraction.findUnique({
          where: { id: ext.id },
          select: { status: true },
        });
        if (current?.status === 'COMPLETED') {
          completed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(completed).toBe(true);
    }, 60000);

    it('reconcile processes multiple pending dispatches', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const ext = await prisma.resumeTextExtraction.create({
          data: {
            storedFileId,
            companyId,
            initiatedByUserId: userId,
            status: 'PENDING',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sourceFileSha256: docxChecksum,
            parserName: 'test',
            parserVersion: '1.0',
          },
        });
        await prisma.extractionDispatch.create({
          data: {
            extractionId: ext.id,
            dispatchStatus: 'PENDING_DISPATCH',
          },
        });
        ids.push(ext.id);
      }

      const outcome = await reconciler.reconcile();

      expect(outcome.dispatched).toBeGreaterThanOrEqual(1);

      const dispatchedCount = await prisma.extractionDispatch.count({
        where: { extractionId: { in: ids }, dispatchStatus: 'DISPATCHED' },
      });
      expect(dispatchedCount).toBeGreaterThanOrEqual(1);
    }, 30000);
  });

  // ── 3. DISPATCH_FAILED → retry ────────────────────────────────────────

  describe('3. DISPATCH_FAILED retry', () => {
    it('re-dispatches a DISPATCH_FAILED extraction when nextAttemptAt is past', async () => {
      const ext = await prisma.resumeTextExtraction.create({
        data: {
          storedFileId,
          companyId,
          initiatedByUserId: userId,
          status: 'PENDING',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test',
          parserVersion: '1.0',
        },
      });

      await prisma.extractionDispatch.create({
        data: {
          extractionId: ext.id,
          dispatchStatus: 'DISPATCH_FAILED',
          dispatchAttempts: 1,
          nextAttemptAt: new Date(Date.now() - 1000),
          failureCode: 'QUEUE_FAILURE',
          lastErrorCode: 'QUEUE_FAILURE',
        },
      });

      await reconciler.dispatchOne(ext.id);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');
    }, 15000);

    it('skips DISPATCH_FAILED when nextAttemptAt is in the future', async () => {
      const ext = await prisma.resumeTextExtraction.create({
        data: {
          storedFileId,
          companyId,
          initiatedByUserId: userId,
          status: 'PENDING',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test',
          parserVersion: '1.0',
        },
      });

      await prisma.extractionDispatch.create({
        data: {
          extractionId: ext.id,
          dispatchStatus: 'DISPATCH_FAILED',
          dispatchAttempts: 1,
          nextAttemptAt: new Date(Date.now() + 60000),
          failureCode: 'QUEUE_FAILURE',
          lastErrorCode: 'QUEUE_FAILURE',
        },
      });

      await reconciler.dispatchOne(ext.id);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCH_FAILED');
    });
  });
});
