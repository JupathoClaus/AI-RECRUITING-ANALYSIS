import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { AppModule } from '../src/app/app.module';

import { ExtractionDispatchReconcilerService } from '../src/modules/resume-processing/services/extraction-dispatch-reconciler.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { LocalStorageProvider } from '../src/modules/files/providers/local-storage.provider';
import {
  RESUME_EXTRACTION_QUEUE,
  RESUME_EXTRACTION_JOB,
} from '../src/modules/resume-processing/queue/resume-extraction-queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import * as dotenv from 'dotenv';
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
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p></w:body></w:document>`,
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

describe('ExtractionDispatchReconciler (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let reconciler: ExtractionDispatchReconcilerService;
  let storage: LocalStorageProvider;
  let queue: Queue;
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
    dotenv.config({ path: join(__dirname, 'env', 'test.env') });
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
    storage = app.get(LocalStorageProvider);
    queue = app.get(getQueueToken(RESUME_EXTRACTION_QUEUE));

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
    await queue.close();
    await prisma.extractionDispatch.deleteMany({ where: { extraction: { companyId } } });
    await prisma.resumeTextExtraction.deleteMany({ where: { companyId } });
    await prisma.storedFile.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── 1. Crash before queue.add ─────────────────────────────────────────

  describe('1. Crash before queue.add', () => {
    it('reclaims DISPATCHING with no job as PENDING_DISPATCH', async () => {
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
      // Simulate: extraction created, dispatch created, but crashed before queue.add
      await prisma.extractionDispatch.create({
        data: {
          extractionId: ext.id,
          dispatchStatus: 'DISPATCHING',
          dispatchToken: randomUUID(),
          leaseStartedAt: new Date(Date.now() - 60000),
        },
      });

      const outcome = await reconciler.reconcile();
      expect(outcome.reclaimed).toBeGreaterThanOrEqual(1);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('PENDING_DISPATCH');

      await reconciler.dispatchOne(ext.id);
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
  });

  // ── 2. Crash after queue.add but before DISPATCHED ────────────────────

  describe('2. Crash after queue.add', () => {
    it('reclaims DISPATCHING with existing job as DISPATCHED', async () => {
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

      // Simulate: queue.add succeeded but DB update to DISPATCHED crashed
      await queue.add(
        RESUME_EXTRACTION_JOB,
        { extractionId: ext.id, storedFileId, companyId },
        { jobId: ext.id },
      );
      await prisma.extractionDispatch.create({
        data: {
          extractionId: ext.id,
          dispatchStatus: 'DISPATCHING',
          dispatchToken: randomUUID(),
          leaseStartedAt: new Date(Date.now() - 60000),
        },
      });

      // Reconcile should detect job exists → mark DISPATCHED
      const outcome = await reconciler.reconcile();
      expect(outcome.reclaimed).toBeGreaterThanOrEqual(1);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');

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
  });

  // ── 3. DISPATCH_FAILED recovery ──────────────────────────────────────

  describe('3. DISPATCH_FAILED recovery', () => {
    it('re-dispatches when nextAttemptAt is past', async () => {
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

    it('skips DISPATCH_FAILED when nextAttemptAt is future', async () => {
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

  // ── 4. Exhaustion ────────────────────────────────────────────────────

  describe('4. Exhaustion', () => {
    it('permanently fails after max dispatch retries', async () => {
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
          dispatchAttempts: 5,
          dispatchFailedAt: new Date(),
          failureCode: 'QUEUE_FAILURE',
          lastErrorCode: 'QUEUE_FAILURE',
        },
      });

      await reconciler.reconcile();
      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCH_FAILED');
      expect(dispatch!.dispatchAttempts).toBe(5);

      // reconcile should not have touched it
      await reconciler.reconcile();
      const dispatch2 = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch2!.dispatchAttempts).toBe(5);
    });
  });

  // ── 5. Two concurrent reconcilers ────────────────────────────────────

  describe('5. Concurrent reconcilers', () => {
    it('only one wins the atomic claim for the same extraction', async () => {
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
        data: { extractionId: ext.id, dispatchStatus: 'PENDING_DISPATCH' },
      });

      const results = await Promise.allSettled([
        reconciler.dispatchOne(ext.id),
        reconciler.dispatchOne(ext.id),
      ]);

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      expect(successCount).toBe(2);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');

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
  });

  // ── 6. Autonomous recovery via reconcile (no new HTTP/service call) ──

  describe('6. Autonomous recovery via reconcile', () => {
    it('recovers a stuck extraction without any new HTTP request', async () => {
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
        data: { extractionId: ext.id, dispatchStatus: 'PENDING_DISPATCH' },
      });

      // No dispatchOne or requestExtraction call - reconcile must recover it
      const outcome = await reconciler.reconcile();
      expect(outcome.dispatched).toBeGreaterThanOrEqual(1);

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

      const job = await queue.getJob(ext.id);
      expect(job).toBeDefined();
      const jobState = await job!.getState();
      expect(['completed', 'failed']).toContain(jobState);
    }, 60000);
  });

  // ── 7. Failed BullMQ job semantics (commit 902160c) ───────────────────

  async function addMismatchedJob(extractionId: string, failReason: string) {
    // Wrong storedFileId makes the processor throw UnrecoverableError
    // without touching the extraction record - a genuine BullMQ job FAILURE.
    await queue.add(
      RESUME_EXTRACTION_JOB,
      { extractionId, storedFileId: 'wrong-file-id', companyId },
      { jobId: extractionId },
    );
    let state = 'waiting';
    for (let i = 0; i < 20; i++) {
      const job = await queue.getJob(extractionId);
      if (!job) {
        throw new Error('job disappeared before failing');
      }
      state = await job.getState();
      if (state === 'failed') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(state).toBe('failed');
  }

  describe('7. Failed-job reconciliation semantics', () => {
    it('never resurrects a terminal FAILED generation via a failed BullMQ job', async () => {
      const ext = await prisma.resumeTextExtraction.create({
        data: {
          storedFileId,
          companyId,
          initiatedByUserId: userId,
          status: 'FAILED',
          completedAt: new Date(),
          failureCode: 'TEST_TERMINAL',
          failureMessageSafe: 'Terminal test failure',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test',
          parserVersion: '1.0',
        },
      });
      await prisma.extractionDispatch.create({
        data: {
          extractionId: ext.id,
          dispatchStatus: 'DISPATCHING',
          dispatchToken: randomUUID(),
          leaseStartedAt: new Date(Date.now() - 60000),
        },
      });

      await addMismatchedJob(ext.id, 'simulated worker failure');

      // A stale dispatcher reconciles this: the generation is terminal, so the
      // failed job must be closed as DISPATCHED - never re-enqueued.
      const outcome = await reconciler.reconcile();
      expect(outcome.reclaimed).toBeGreaterThanOrEqual(1);

      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('DISPATCHED');

      const extraction = await prisma.resumeTextExtraction.findUnique({
        where: { id: ext.id },
      });
      expect(extraction!.status).toBe('FAILED');

      // No job may exist anymore, and a defensive re-dispatch must NOT enqueue.
      expect(await queue.getJob(ext.id)).toBeFalsy();
      await reconciler.dispatchOne(ext.id);
      expect(await queue.getJob(ext.id)).toBeFalsy();
      expect(await queue.getWaitingCount()).toBe(0);
    }, 60000);

    it('re-enqueues a failed job for a live PROCESSING generation and completes it', async () => {
      const ext = await prisma.resumeTextExtraction.create({
        data: {
          storedFileId,
          companyId,
          initiatedByUserId: userId,
          status: 'PROCESSING',
          startedAt: new Date(),
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sourceFileSha256: docxChecksum,
          parserName: 'test',
          parserVersion: '1.0',
        },
      });
      await prisma.extractionDispatch.create({
        data: {
          extractionId: ext.id,
          dispatchStatus: 'DISPATCHING',
          dispatchToken: randomUUID(),
          leaseStartedAt: new Date(Date.now() - 60000),
        },
      });

      await addMismatchedJob(ext.id, 'simulated worker failure');

      // Same-generation retry: the dispatch goes back to PENDING_DISPATCH.
      await reconciler.reconcile();
      const dispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(dispatch!.dispatchStatus).toBe('PENDING_DISPATCH');
      expect(dispatch!.dispatchAttempts).toBe(1);

      // Explicit re-dispatch must succeed: failed job removed, correct job added.
      await reconciler.dispatchOne(ext.id);

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

      const finalDispatch = await prisma.extractionDispatch.findUnique({
        where: { extractionId: ext.id },
      });
      expect(finalDispatch!.dispatchStatus).toBe('DISPATCHED');
    }, 60000);
  });
});
