/* eslint-disable no-console */
/**
 * REAL Qwen3.5-9B external verification (Hugging Face hosted, OpenAI /v1).
 *
 * Execute:  npx ts-node test/qwen-hf-verify.ts
 *
 * NOT matched by jest (testRegex is `*.spec.ts` / `*.e2e-spec.ts`) so it never
 * runs in regression. It performs a small, controlled real screening through
 * the TalentAI qwen provider against the HF router
 * (https://router.huggingface.co/v1, token from the local HF cache; the token
 * is read at runtime and never printed, logged, or committed).
 *
 * Exit code 0 = PASS, 1 = FAIL.
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import * as JSZip from 'jszip';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ResumeExtractionService } from '../src/modules/resume-processing/services/resume-extraction.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { LocalStorageProvider } from '../src/modules/files/providers/local-storage.provider';
import { RESUME_EXTRACTION_QUEUE } from '../src/modules/resume-processing/queue/resume-extraction-queue.constants';

const HF_TOKEN_FILE = join(process.env.USERPROFILE ?? '', '.cache', 'huggingface', 'token');
const HF_MODEL = 'Qwen/Qwen3.5-9B';
const HF_BASE_URL = 'https://router.huggingface.co/v1';

function readHfToken(): string {
  if (!existsSync(HF_TOKEN_FILE)) {
    throw new Error(`HF token not found at ${HF_TOKEN_FILE}`);
  }
  const tok = readFileSync(HF_TOKEN_FILE, 'utf8').trim();
  if (!tok || tok.length < 16) throw new Error('HF token missing or too short');
  return tok;
}

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

// Synthetic, non-sensitive Systems Administrator resume with a structured mix
// of VERBATIM (fulfilled) evidence and one PREFERRED skill with NO evidence.
const RESUME_TEXT = `ALEX MORGAN
Bachelor of Science in Information Systems, 2018

Systems Administrator — Northwind Logistics (March 2021 – Present, 5 years)
- Administered 120 Windows Server 2019 and 2022 hosts and a VMware vSphere cluster.
- Managed Linux servers running CentOS 8 and Ubuntu 22.04 in production web and database tiers.
- Configured LAN and WAN networking: VLANs, DNS and DHCP across the corporate network.
- Built Grafana and Prometheus monitoring dashboards covering server, network and service health.
- Resolved escalated incidents, performed root cause analysis and remote troubleshooting for 400+ users.

IT Support Specialist — Acme Consulting (July 2018 – February 2021)
- Provided help desk troubleshooting, workstation imaging and peripheral support.
- Assisted the network team with switch replacements and access-point rollouts.

Key skills: Windows Server, Linux, networking, system monitoring, incident response, troubleshooting.`;

let app: INestApplication;
let prisma: PrismaClient;
let storage: LocalStorageProvider;
let extractionService: ResumeExtractionService;
let aiScreeningQueue: Queue;
let emailQueue: Queue;

const email = `qwen-hf-${Date.now()}@e2e.com`;
const now = Date.now();
const runId = now.toString();

let companyId: string;
let userId: string;
let membershipId: string;
let storedFileId: string;
let filePath: string;
let applicationId: string;
let token: string;

async function cleanUser(prismaClient: PrismaClient, norm: string) {
  try {
    await prismaClient.$executeRawUnsafe(`
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
        DELETE FROM "JobSkill" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
        DELETE FROM "JobExperienceRequirement" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
        DELETE FROM "JobEducationRequirement" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
        DELETE FROM "Skill" WHERE "companyId" = ANY(cids);
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

async function waitFor<T>(
  probe: () => Promise<T | null | undefined>,
  predicate: (v: T) => boolean,
  timeoutMs: number,
  stepMs = 2000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null | undefined;
  for (;;) {
    last = await probe();
    if (last && predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor timed out after ${timeoutMs}ms; last=${JSON.stringify(last ?? null)}`,
      );
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
}

async function main() {
  const hfToken = readHfToken();

  dotenv.config({ path: join(__dirname, 'env', 'test.env') });
  process.env.NODE_ENV = 'test';
  process.env.REDIS_KEY_PREFIX = `talentai_test:qwenhf:${runId}:`;
  process.env.AI_SCREENING_PROVIDER = 'qwen';
  process.env.QWEN_BASE_URL = HF_BASE_URL;
  process.env.QWEN_MODEL = HF_MODEL;
  process.env.QWEN_API_KEY = hfToken;
  process.env.AI_SCREENING_TIMEOUT_MS = '300000';
  process.env.AI_SCREENING_MAX_RESUME_CHARS = '15000';

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
  extractionService = app.get(ResumeExtractionService);
  aiScreeningQueue = app.get(getQueueToken('ai-screening'));
  emailQueue = app.get(getQueueToken('email'));
  await emailQueue.pause();

  const summary: Record<string, unknown> = { runId, model: HF_MODEL, baseUrl: HF_BASE_URL };

  try {
    await cleanUser(prisma, email.toLowerCase().trim());

    // 1. Register company (HTTP)
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send({
        companyName: `HF Qwen Verification ${runId}`,
        email,
        firstName: 'Qwen',
        lastName: 'Verify',
        password: 'E2eStr0ng!Pass',
        passwordConfirmation: 'E2eStr0ng!Pass',
        country: 'US',
        timezone: 'America/New_York',
        acceptTerms: true,
      })
      .expect(201);
    companyId = reg.body.data.companyId;
    const dbUser = await prisma.user.findUnique({
      where: { normalizedEmail: email.toLowerCase().trim() },
    });
    userId = dbUser!.id;
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    const memRows = await prisma.$queryRawUnsafe(
      `SELECT id FROM "CompanyMembership" WHERE "userId" = '${userId}' LIMIT 1`,
    );
    membershipId = (memRows as { id: string }[])[0].id;

    // 2. Login (HTTP)
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'E2eStr0ng!Pass' })
      .expect(200);
    token = login.body.data.tokens.accessToken;

    // 3. Seed Job with structured criteria (Systems Administrator)
    const jobId = `job-qhf-${runId}`;
    const nowStr = new Date().toISOString();
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, "employmentType", "workplaceType", "experienceLevel", description, qualifications, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
      VALUES ('${jobId}', '${companyId}', 'JC-QHF-${runId}', 'systems-admin-${runId}', 'Systems Administrator', 'FULL_TIME', 'ON_SITE', 'MID', 'Administer and support the companys server fleet, network and monitoring systems.', 'Windows and Linux administration, networking, troubleshooting, system monitoring.', '${membershipId}', '${membershipId}', '${nowStr}', '${nowStr}')
    `);

    const skills: Array<[string, string]> = [
      ['Windows Server Administration', 'REQUIRED'],
      ['Linux Administration', 'REQUIRED'],
      ['Network Administration', 'REQUIRED'],
      ['IT Troubleshooting', 'REQUIRED'],
      ['System Monitoring', 'REQUIRED'],
      ['Security Hardening', 'PREFERRED'],
    ];
    for (let i = 0; i < skills.length; i++) {
      const [displayName, importance] = skills[i];
      const normalized = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const skillId = `skill-qhf-${runId}-${i}`;
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Skill" (id, "normalizedName", "displayName", type, "isGlobal", "companyId", "createdAt", "updatedAt")
        VALUES ('${skillId}', '${normalized}', '${displayName}', 'TECHNICAL', false, '${companyId}', '${nowStr}', '${nowStr}')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "JobSkill" (id, "jobId", "skillId", importance, "createdAt")
        VALUES ('jsk-${skillId}', '${jobId}', '${skillId}', '${importance}', '${nowStr}')
      `);
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO "JobExperienceRequirement" (id, "jobId", title, domain, "minimumYears", importance, description, "createdAt", "updatedAt")
      VALUES ('jexp-qhf-${runId}', '${jobId}', 'Systems Administrator', 'IT infrastructure', 4, 'REQUIRED', 'Minimum four years administering servers and infrastructure.', '${nowStr}', '${nowStr}')
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "JobEducationRequirement" (id, "jobId", level, "fieldOfStudy", importance, "createdAt", "updatedAt")
      VALUES ('jedu-qhf-${runId}', '${jobId}', 'ASSOCIATE', 'Information Systems', 'REQUIRED', '${nowStr}', '${nowStr}')
    `);

    // 4. Candidate + application
    const candId = `cand-qhf-${runId}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
      VALUES ('${candId}', 'Alex', 'Morgan', 'alex-morgan-${runId}@e2e.com', 'RECRUITER_CREATED', '${nowStr}', '${nowStr}')
    `);
    const ccId = `cc-qhf-${runId}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
      VALUES ('${ccId}', '${companyId}', '${candId}', 'RECRUITER_CREATED', '${nowStr}')
    `);
    applicationId = `app-qhf-${runId}`;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "applicationNumber", "publicReference", source, status, "consentConfirmed", "createdAt", "updatedAt")
      VALUES ('${applicationId}', '${companyId}', '${jobId}', '${candId}', '${ccId}', 'QHF-${runId}', 'qhf-ref-${runId}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr}', '${nowStr}')
    `);

    // 5. Resume doc + stored file
    const docxBuffer = await createTestDocxBuffer(RESUME_TEXT);
    const docxChecksum = createHash('sha256').update(docxBuffer).digest('hex');
    const storedName = storage.generateStoredName('docx');
    const putResult = await storage.put(
      companyId,
      storedName,
      docxBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    filePath = join(storage['basePath'], putResult.storageKey);
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
    storedFileId = sf.id;
    await prisma.$executeRawUnsafe(`
      UPDATE "StoredFile" SET "applicationId" = '${applicationId}' WHERE id = '${storedFileId}'
    `);

    // 6. Extraction (local worker) → COMPLETED
    const extractionStart = Date.now();
    const extraction = await extractionService.requestExtraction(storedFileId, companyId);
    const completedExtraction = await waitFor(
      () => prisma.resumeTextExtraction.findUnique({ where: { id: extraction.extraction.id } }),
      (e) => e?.status === 'COMPLETED',
      120000,
      2000,
    );
    summary['extractionMs'] = Date.now() - extractionStart;
    summary['extractionStatus'] = completedExtraction!.status;
    summary['parsedChars'] = completedExtraction!.extractedText?.length ?? 0;

    // 7. Real screening request via HTTP (qwen provider → HF hosted Qwen3.5-9B)
    const screeningStart = Date.now();
    const sres = await request(app.getHttpServer())
      .post(`/api/v1/applications/${applicationId}/ai-screenings`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(202);
    assert(sres.body.data.action === 'CREATED', 'screening action should be CREATED');

    const screening = await waitFor(
      () =>
        prisma.aiScreeningResult.findFirst({
          where: { applicationId, companyId },
          orderBy: { createdAt: 'desc' },
        }),
      (s) => s?.status === 'COMPLETED' || s?.status === 'FAILED',
      420000,
      4000,
    );
    summary['screeningDurationMs'] = Date.now() - screeningStart;
    summary['screeningId'] = screening!.id;

    assert(screening!.status === 'COMPLETED', `expected COMPLETED, got ${screening!.status}`);
    assert(screening!.provider === 'qwen', `expected provider=qwen, got ${screening!.provider}`);
    assert(screening!.model === HF_MODEL, `expected model ${HF_MODEL}, got ${screening!.model}`);
    assert(!!screening!.providerResponseId, 'providerResponseId must be present');
    assert(!!screening!.startedAt && !!screening!.completedAt, 'startedAt/completedAt must be set');
    assert(
      screening!.overallScore !== null &&
        screening!.overallScore >= 0 &&
        screening!.overallScore <= 100,
      'overallScore must be 0..100',
    );
    assert(!!screening!.recommendation, 'recommendation must be set');
    const rawEvals = screening!.criterionEvaluations as unknown;
    assert(
      Array.isArray(rawEvals) && rawEvals.length > 0,
      'criterionEvaluations must be populated (qwen)',
    );
    assert(
      Array.isArray(screening!.matchedQualifications) &&
        (screening!.matchedQualifications as string[]).length > 0,
      'matchedQualifications must be populated',
    );

    const evaluations = screening!.criterionEvaluations as Array<{
      criterion: string;
      criterionId: string;
      status: string;
      confidence: string;
      reason: string;
      evidence: Array<{ sourceText: string; sourceCategory: string }>;
      evidenceUnverified: boolean;
    }>;
    const statuses = evaluations.map((e) => e.status);
    const anyUnverified = evaluations.some((e) => e.evidenceUnverified);
    const preferred = evaluations.find((e) => e.criterion.includes('Security Hardening'));

    summary['criterionCount'] = evaluations.length;
    summary['criterionStatuses'] = statuses;
    summary['evidenceUnverifiedCount'] = evaluations.filter((e) => e.evidenceUnverified).length;
    summary['providerMetadata'] = {
      provider: screening!.provider,
      model: screening!.model,
      promptVersion: screening!.promptVersion,
      responseId: screening!.providerResponseId,
      fingerprintHash: screening!.inputFingerprint
        ? `${screening!.inputFingerprint.slice(0, 8)}…`
        : null,
    };
    summary['result'] = {
      status: screening!.status,
      overallScore: screening!.overallScore,
      recommendation: screening!.recommendation,
      confidence: screening!.confidence,
      preferredSecurityHardening: preferred
        ? { status: preferred.status, evidenceUnverified: preferred.evidenceUnverified }
        : null,
    };

    assert(
      !anyUnverified,
      'expected all required evidence quotes to be found verbatim in resume (resume is designed satisfied)',
    );

    console.log('QWEEN_HF_VERIFY_PASS ' + JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('QWEEN_HF_VERIFY_FAIL ' + ((err as Error).message ?? err));
    console.error(err);
    process.exitCode = 1;
  } finally {
    try {
      if (filePath && existsSync(filePath)) {
        const { unlinkSync } = await import('fs');
        unlinkSync(filePath);
      }
    } catch {
      /* non-fatal */
    }
    try {
      await aiScreeningQueue.drain(true);
      await emailQueue.drain(true);
      await aiScreeningQueue.resume();
      await emailQueue.resume();
    } catch {
      /* non-fatal */
    }
    try {
      await cleanUser(prisma, email.toLowerCase().trim());
    } catch {
      /* non-fatal */
    }
    try {
      await app.close();
    } catch {
      /* non-fatal */
    }
  }
}

main().then(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200));
