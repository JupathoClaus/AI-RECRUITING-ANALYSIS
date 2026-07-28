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

describe('Extraction concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let extractionService: ResumeExtractionService;
  let companyId: string;
  let storedFileId: string;

  const email = `ext-con-${Date.now()}@e2e.com`;
  const user = {
    companyName: 'Extraction Concurrency E2E',
    email,
    firstName: 'Extract',
    lastName: 'Test',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  async function cleanupUser(email: string) {
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
          DELETE FROM "CandidateAuditEvent" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateConsent" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateLanguage" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateCertification" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateEducation" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateEmployment" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateSkill" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "CandidateMergeRecord" WHERE "primaryCandidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids))) OR "mergedCandidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)));
          DELETE FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CompanySettings" WHERE "companyId" = ANY(cids);
          DELETE FROM "DepartmentMembership" WHERE "companyMembershipId" IN (SELECT id FROM "CompanyMembership" WHERE "userId" = uid);
          DELETE FROM "CompanyMembership" WHERE "userId" = uid;
          DELETE FROM "Company" WHERE id = ANY(cids);
          DELETE FROM "User" WHERE id = uid;
        END $$;
      `);
    } catch { /* non-fatal */ }
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    extractionService = app.get(ResumeExtractionService);

    await cleanupUser(user.email);

    // Register user and get company ID
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register-company')
      .send(user)
      .expect(201);
    companyId = registerRes.body.data.companyId;

    // Activate user via DB
    const norm = user.email.toLowerCase().trim();
    const dbUser = await prisma.user.findUnique({ where: { normalizedEmail: norm } });
    if (dbUser && dbUser.status !== 'ACTIVE') {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
    }

    // Create a stored file
    const storedFile = await prisma.storedFile.create({
      data: {
        companyId,
        uploadedByUserId: dbUser!.id,
        storageKey: `ext-con-test-${Date.now()}.pdf`,
        originalName: 'resume.pdf',
        storedName: `stored-${Date.now()}.pdf`,
        extension: '.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        category: 'RESUME',
        status: 'ACTIVE',
      },
    });
    storedFileId = storedFile.id;
  }, 60000);

  afterAll(async () => {
    await cleanupUser(user.email);
    await app.close();
  });

  it('should handle concurrent requestExtraction calls with idempotency', async () => {
    const CONCURRENCY = 5;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        extractionService.requestExtraction(storedFileId, companyId),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(rejected.length).toBeLessThan(CONCURRENCY);
    expect(fulfilled.length + rejected.length).toBe(CONCURRENCY);

    const extractionCount = await prisma.resumeTextExtraction.count({
      where: { storedFileId, companyId },
    });
    expect(extractionCount).toBe(1);

    const extraction = await prisma.resumeTextExtraction.findFirst({
      where: { storedFileId, companyId },
    });
    expect(extraction).toBeDefined();
    expect(['COMPLETED', 'PENDING', 'PROCESSING']).toContain(extraction!.status);

    const dispatchCount = await prisma.extractionDispatch.count({
      where: { extractionId: extraction!.id },
    });
    expect(dispatchCount).toBe(1);

    const dispatch = await prisma.extractionDispatch.findFirst({
      where: { extractionId: extraction!.id },
    });
    expect(dispatch).toBeDefined();
    expect(dispatch!.dispatchStatus).toBe('DISPATCHED');
  }, 30000);
});
