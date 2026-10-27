import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AppModule } from '../src/app/app.module';
import { AI_SCREENING_QUEUE, AI_SCREENING_JOB } from '../src/modules/ai-screening/queue/ai-screening-queue.constants';
import { AI_SCREENING_PROVIDER } from '../src/modules/ai-screening/providers/ai-screening-provider.token';
import { MockScreeningProvider } from '../src/modules/ai-screening/providers/mock-screening.provider';
import { computeScreeningFingerprint } from '../src/modules/ai-screening/utils/screening-input-fingerprint';

describe('AI Screening Queue Integration (e2e)', () => {
  let app: INestApplication;
  let queue: Queue;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AI_SCREENING_PROVIDER)
      .useValue(new MockScreeningProvider())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    queue = app.get<Queue>(getQueueToken(AI_SCREENING_QUEUE));
    prisma = app.get<PrismaService>(PrismaService);
  }, 60000);

  afterAll(async () => {
    try {
      await queue?.close();
    } catch {}
    try {
      await prisma?.$disconnect();
    } catch {}
    try {
      await app?.close();
    } catch {}
  });

  it('should enqueue a screening job to the ai-screening queue', async () => {
    const job = await queue.add(AI_SCREENING_JOB, {
      screeningId: '00000000-0000-0000-0000-000000000001',
      applicationId: '00000000-0000-0000-0000-000000000002',
      companyId: '00000000-0000-0000-0000-000000000003',
      initiatedByUserId: '00000000-0000-0000-0000-000000000004',
      inputFingerprint: computeScreeningFingerprint({
        applicationId: '00000000-0000-0000-0000-000000000002',
        input: {
          applicationId: '00000000-0000-0000-0000-000000000002',
          candidateId: '00000000-0000-0000-0000-000000000005',
          jobId: '00000000-0000-0000-0000-000000000006',
          companyId: '00000000-0000-0000-0000-000000000003',
          jobTitle: 'Test',
          jobDescription: 'Test job description',
          jobResponsibilities: '',
          jobQualifications: '',
          experienceLevel: 'Mid',
          requiredSkills: ['JavaScript'],
          preferredSkills: [],
          requiredExperience: 'Mid',
          preferredExperience: '',
          requiredEducation: '',
          preferredEducation: '',
          requiredCertifications: [],
          preferredCertifications: [],
          resumeText: 'Test resume',
          screeningQuestions: [],
          promptVersion: 'v1',
        } as any,
        jobUpdatedAt: new Date().toISOString(),
        resumeChecksumSha256: 'test',
        resumeUpdatedAt: new Date().toISOString(),
        provider: 'mock',
        model: '',
        promptVersion: 'v1',
        schemaVersion: 'v1',
      }),
    } as any);
    expect(job).toBeDefined();
    expect(job.name).toBe(AI_SCREENING_JOB);
    await job.remove();
  }, 30000);
});
