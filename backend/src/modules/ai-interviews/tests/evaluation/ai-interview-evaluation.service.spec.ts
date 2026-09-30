import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiInterviewEvaluationStatus,
  AiInterviewEvaluationRecommendation,
  ApplicationAuditEventType,
} from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { InAppNotificationsService } from '@modules/notifications/services/in-app-notifications.service';
import { AiInterviewEvaluationService } from '../../evaluation/ai-interview-evaluation.service';
import { AiInterviewTranscriptService } from '../../evaluation/ai-interview-transcript.service';
import { AiInterviewEvidenceService } from '../../evaluation/ai-interview-evidence.service';
import { AiInterviewScoringService } from '../../evaluation/ai-interview-scoring.service';
import { AI_INTERVIEW_EVALUATION_AI_PROVIDER } from '../../evaluation/ai-interview-ai-provider.token';
import {
  AI_INTERVIEW_EVALUATION_QUEUE,
  AI_INTERVIEW_EVALUATE_JOB,
} from '../../evaluation/queue/ai-interview-evaluation-queue.constants';

const READY_INTERVIEW = {
  id: 'interview-1',
  companyId: 'company-1',
  applicationId: 'app-1',
  status: 'COMPLETED',
  transcriptStatus: 'READY',
  evaluationStatus: 'NOT_REQUESTED',
  transcript: [{ role: 'user', content: 'I led a Kubernetes migration.' }],
};

const TRANSCRIPT_FIXTURE = {
  transcriptId: 'transcript-1',
  candidateResponseText: 'I led a Kubernetes migration at my last job.',
  transcriptInput: [],
  segments: [
    {
      segmentIndex: 1,
      segmentType: 'USER',
      speakerRole: 'user',
      startSeconds: 10,
      endSeconds: 20,
      durationSeconds: 10,
      textRaw: 'I led a Kubernetes migration at my last job.',
      textNormalized: 'i led a kubernetes migration at my last job.',
      characterCount: 40,
      hidden: false,
    },
  ],
};

const INPUT_FIXTURE = {
  jobTitle: 'DevOps Engineer',
  jobDescription: 'Run infrastructure.',
  competencies: [
    { competency: 'Kubernetes', description: null, guidance: null, maxScore: 100, weight: 1 },
  ],
  transcript: [{ role: 'user', content: 'I led a Kubernetes migration.' }],
  candidateResponseText: 'I led a Kubernetes migration at my last job.',
};

const PROVIDER_RESULT = {
  output: {
    schemaVersion: 'v1' as const,
    competencyEvaluations: [
      {
        competency: 'Kubernetes',
        status: 'MET',
        score: 80,
        maxScore: 100,
        evidence: [{ quote: 'I led a Kubernetes migration', location: 'candidate_response' }],
        rationale: 'Consistent with the transcript.',
        confidence: 'HIGH',
      },
    ],
    summary: 'Solid performance.',
    strengths: ['Clear'],
    gaps: ['Depth'],
    uncertainties: [],
  },
  metadata: {
    provider: 'mock',
    model: 'mock-model',
    promptVersion: 'v1',
    schemaVersion: 'v1' as const,
    latencyMs: 12,
    responseId: 'r1',
  },
};

const SCORE_RESULT = {
  totalScore: 80,
  maximumScore: 100,
  recommendation: AiInterviewEvaluationRecommendation.PASS,
  evidenceTotals: { VERBATIM: 1, SUPPORTED: 0, INFERRED: 0, UNVERIFIED: 0 },
};

const VERBATIM_CHECK = {
  quote: 'I led a Kubernetes migration',
  verification: 'VERBATIM',
  excerpt: 'I led a Kubernetes migration at my last job.',
  transcriptId: 'transcript-1',
  segmentIndexes: [1],
  startSeconds: 10,
  endSeconds: 20,
};

function makeEvaluationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eval-1',
    aiInterviewId: 'interview-1',
    companyId: 'company-1',
    applicationId: 'app-1',
    candidateId: 'cand-1',
    jobId: 'job-1',
    attempt: 1,
    status: AiInterviewEvaluationStatus.PENDING,
    startedAt: null,
    maximumScore: 100,
    inputFingerprint: null,
    ...overrides,
  };
}

describe('AiInterviewEvaluationService', () => {
  let service: AiInterviewEvaluationService;
  let prisma: any;
  let transcriptService: any;
  let evidence: any;
  let scoring: any;
  let audit: any;
  let notifications: any;
  let provider: any;
  let queue: any;
  let configService: any;

  const mockPrisma = () => ({
    aiInterview: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    application: { findUnique: jest.fn() },
    aiInterviewEvaluation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    aiInterviewEvaluationAttempt: { create: jest.fn(), updateMany: jest.fn() },
    aiInterviewCompetencyEvaluation: { deleteMany: jest.fn(), create: jest.fn() },
    aiInterviewEvidence: { deleteMany: jest.fn(), create: jest.fn() },
    applicationAssignment: { findMany: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: any) => unknown) => cb(prisma)),
  });

  beforeEach(async () => {
    prisma = mockPrisma();
    transcriptService = { buildEvaluationInput: jest.fn() };
    evidence = { verifyAgainstSegments: jest.fn(), hasFabricatedEvidence: jest.fn() };
    scoring = { score: jest.fn() };
    audit = { record: jest.fn() };
    notifications = { create: jest.fn() };
    provider = { providerName: 'mock', evaluate: jest.fn() };
    queue = { getJob: jest.fn(), add: jest.fn() };
    configService = { get: jest.fn(() => 60000) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiInterviewEvaluationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: AiInterviewTranscriptService, useValue: transcriptService },
        { provide: AiInterviewEvidenceService, useValue: evidence },
        { provide: AiInterviewScoringService, useValue: scoring },
        { provide: ApplicationAuditService, useValue: audit },
        { provide: InAppNotificationsService, useValue: notifications },
        { provide: AI_INTERVIEW_EVALUATION_AI_PROVIDER, useValue: provider },
        { provide: getQueueToken(AI_INTERVIEW_EVALUATION_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(AiInterviewEvaluationService);
  });

  describe('scheduleEvaluation', () => {
    it('creates an evaluation AND a PENDING attempt before the provider is ever called, then enqueues', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(null);
      prisma.aiInterviewEvaluation.create.mockResolvedValue({ id: 'eval-1', attempt: 1 });
      prisma.aiInterviewEvaluationAttempt.create.mockResolvedValue({ id: 'attempt-1' });
      prisma.aiInterview.update.mockResolvedValue({});
      queue.getJob.mockResolvedValue(null);

      const result = await service.scheduleEvaluation('interview-1', 'company-1');
      expect(result).toEqual({
        evaluationId: 'eval-1',
        status: AiInterviewEvaluationStatus.PENDING,
      });
      expect(prisma.aiInterviewEvaluationAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evaluationId: 'eval-1',
            aiInterviewId: 'interview-1',
            companyId: 'company-1',
            attempt: 1,
            status: AiInterviewEvaluationStatus.PENDING,
          }),
        }),
      );
      expect(provider.evaluate).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        AI_INTERVIEW_EVALUATE_JOB,
        { evaluationId: 'eval-1', aiInterviewId: 'interview-1', companyId: 'company-1' },
        expect.objectContaining({ jobId: 'eval-1-1' }),
      );
    });

    it('throws NOT_READY when the interview has no transcript (unless forced)', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({
        ...READY_INTERVIEW,
        transcriptStatus: 'NOT_REQUESTED',
        transcript: null,
      });
      await expect(service.scheduleEvaluation('interview-1', 'company-1')).rejects.toThrow(
        ConflictException,
      );

      prisma.aiInterview.findFirst.mockResolvedValue({ ...READY_INTERVIEW, transcript: null });
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(null);
      prisma.aiInterviewEvaluation.create.mockResolvedValue({ id: 'eval-1', attempt: 1 });
      await expect(
        service.scheduleEvaluation('interview-1', 'company-1', { force: true }),
      ).resolves.toMatchObject({ evaluationId: 'eval-1' });
    });

    it('returns an existing COMPLETED evaluation idempotently without re-enqueueing', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.COMPLETED, attempt: 2 }),
      );
      const result = await service.scheduleEvaluation('interview-1', 'company-1');
      expect(result.status).toBe(AiInterviewEvaluationStatus.COMPLETED);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('re-enqueues an existing PENDING evaluation without creating a new one', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.PENDING }),
      );
      queue.getJob.mockResolvedValue(null);
      await service.scheduleEvaluation('interview-1', 'company-1');
      expect(prisma.aiInterviewEvaluation.create).not.toHaveBeenCalled();
      expect(prisma.aiInterviewEvaluationAttempt.create).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('resets the existing evaluation row and creates a fresh PENDING attempt on force', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.COMPLETED, attempt: 2 }),
      );
      prisma.aiInterviewEvaluation.update.mockResolvedValue({ id: 'eval-1', attempt: 3 });
      prisma.aiInterviewEvaluationAttempt.create.mockResolvedValue({ id: 'attempt-3' });
      prisma.aiInterviewEvidence.deleteMany.mockResolvedValue({ count: 0 });
      prisma.aiInterviewCompetencyEvaluation.deleteMany.mockResolvedValue({ count: 0 });
      prisma.aiInterview.update.mockResolvedValue({});
      queue.getJob.mockResolvedValue(null);

      const result = await service.scheduleEvaluation('interview-1', 'company-1', { force: true });
      expect(result.status).toBe(AiInterviewEvaluationStatus.PENDING);
      expect(prisma.aiInterviewEvaluation.create).not.toHaveBeenCalled();
      expect(prisma.aiInterviewEvaluation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempt: 3,
            status: AiInterviewEvaluationStatus.PENDING,
          }),
        }),
      );
      expect(prisma.aiInterviewEvaluationAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempt: 3,
            status: AiInterviewEvaluationStatus.PENDING,
          }),
        }),
      );
      expect(prisma.aiInterviewCompetencyEvaluation.deleteMany).toHaveBeenCalled();
    });

    it('re-enqueues under an attempt-scoped job id and clears a stale finished job', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.COMPLETED, attempt: 1 }),
      );
      prisma.aiInterviewEvaluation.update.mockResolvedValue({ id: 'eval-1', attempt: 2 });
      prisma.aiInterviewEvaluationAttempt.create.mockResolvedValue({ id: 'attempt-2' });
      prisma.aiInterviewEvidence.deleteMany.mockResolvedValue({ count: 0 });
      prisma.aiInterviewCompetencyEvaluation.deleteMany.mockResolvedValue({ count: 0 });
      prisma.aiInterview.update.mockResolvedValue({});
      const staleJob = {
        getState: jest.fn().mockResolvedValue('completed'),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      queue.getJob.mockResolvedValue(staleJob);

      await service.scheduleEvaluation('interview-1', 'company-1', { force: true });
      expect(queue.getJob).toHaveBeenCalledWith('eval-1-2');
      expect(staleJob.remove).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        AI_INTERVIEW_EVALUATE_JOB,
        expect.anything(),
        expect.objectContaining({ jobId: 'eval-1-2' }),
      );
    });
  });

  describe('evaluateAttempt', () => {
    beforeEach(() => {
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(makeEvaluationRow());
      prisma.aiInterviewEvaluation.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterviewEvaluationAttempt.updateMany.mockResolvedValue({ count: 1 });
      transcriptService.buildEvaluationInput.mockResolvedValue({
        transcript: TRANSCRIPT_FIXTURE,
        input: INPUT_FIXTURE,
      });
      evidence.verifyAgainstSegments.mockReturnValue([VERBATIM_CHECK]);
      evidence.hasFabricatedEvidence.mockReturnValue(false);
      scoring.score.mockReturnValue(SCORE_RESULT);
      provider.evaluate.mockResolvedValue(PROVIDER_RESULT);
      prisma.aiInterviewEvaluationAttempt.create.mockResolvedValue({ id: 'attempt-1' });
      prisma.aiInterviewCompetencyEvaluation.create.mockResolvedValue({ id: 'comp-1' });
      prisma.aiInterviewEvidence.create.mockResolvedValue({ id: 'ev-1' });
      audit.record.mockResolvedValue({});
      prisma.applicationAssignment.findMany.mockResolvedValue([
        { membership: { userId: 'user-1' } },
        { membership: { userId: 'user-2' } },
      ]);
    });

    it('writes a COMPLETED evaluation, attempt, competencies, evidence, audit, and notifications', async () => {
      await service.evaluateAttempt('eval-1');
      expect(prisma.aiInterviewEvaluation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AiInterviewEvaluationStatus.COMPLETED,
            totalScore: 80,
            recommendation: AiInterviewEvaluationRecommendation.PASS,
          }),
        }),
      );
      expect(prisma.aiInterviewEvaluationAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AiInterviewEvaluationStatus.COMPLETED,
            output: expect.anything(),
          }),
        }),
      );
      expect(prisma.aiInterviewCompetencyEvaluation.create).toHaveBeenCalledTimes(1);
      expect(prisma.aiInterviewEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quote: 'I led a Kubernetes migration',
            verification: 'VERBATIM',
            excerpt: 'I led a Kubernetes migration at my last job.',
            transcriptId: 'transcript-1',
            segmentIndexes: [1],
            startSeconds: 10,
            endSeconds: 20,
            sourceSegmentIndex: 1,
            sourceSeconds: 10,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: ApplicationAuditEventType.AI_INTERVIEW_EVALUATED }),
      );
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', relatedEntityId: 'interview-1' }),
      );
    });

    it('claims the PENDING attempt before invoking the provider', async () => {
      await service.evaluateAttempt('eval-1');
      expect(prisma.aiInterviewEvaluationAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ evaluationId: 'eval-1', attempt: 1 }),
          data: expect.objectContaining({ status: AiInterviewEvaluationStatus.RUNNING }),
        }),
      );
    });

    it('fails the evaluation on fabricated evidence without recording any score', async () => {
      evidence.hasFabricatedEvidence.mockReturnValue(true);
      await service.evaluateAttempt('eval-1');
      expect(prisma.aiInterviewEvaluation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AiInterviewEvaluationStatus.FAILED,
            failureCode: 'FABRICATED_EVIDENCE',
          }),
        }),
      );
      const finalizeCall = prisma.aiInterviewEvaluation.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === AiInterviewEvaluationStatus.FAILED,
      );
      expect(finalizeCall).toBeDefined();
      expect(scoring.score).not.toHaveBeenCalled();
    });

    it('fails the evaluation as malformed when the provider yields no competency evaluations', async () => {
      provider.evaluate.mockResolvedValue({
        output: {
          schemaVersion: 'v1',
          competencyEvaluations: [],
          summary: '',
          strengths: [],
          gaps: [],
          uncertainties: [],
        },
        metadata: { provider: 'mock', promptVersion: 'v1', schemaVersion: 'v1' },
      });
      await service.evaluateAttempt('eval-1');
      expect(prisma.aiInterviewEvaluation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failureCode: 'MALFORMED_RESPONSE' }),
        }),
      );
      expect(scoring.score).not.toHaveBeenCalled();
    });

    it('returns early when the evaluation is already COMPLETED', async () => {
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.COMPLETED }),
      );
      await service.evaluateAttempt('eval-1');
      expect(prisma.aiInterviewEvaluation.updateMany).not.toHaveBeenCalled();
    });

    it('propagates provider errors for the processor to classify', async () => {
      provider.evaluate.mockRejectedValue(new Error('provider down'));
      await expect(service.evaluateAttempt('eval-1')).rejects.toThrow('provider down');
    });
  });

  describe('failTerminal', () => {
    it('records the failure on the evaluation, its attempt, and the interview', async () => {
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.RUNNING }),
      );
      prisma.aiInterviewEvaluation.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterviewEvaluationAttempt.updateMany.mockResolvedValue({ count: 1 });
      prisma.aiInterview.update.mockResolvedValue({});

      await service.failTerminal('eval-1', 'PROVIDER_UNAVAILABLE', 'Qwen endpoint unreachable.');

      expect(prisma.aiInterviewEvaluation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'eval-1',
            status: {
              in: [AiInterviewEvaluationStatus.PENDING, AiInterviewEvaluationStatus.RUNNING],
            },
          },
          data: expect.objectContaining({
            status: AiInterviewEvaluationStatus.FAILED,
            failureCode: 'PROVIDER_UNAVAILABLE',
          }),
        }),
      );
      expect(prisma.aiInterviewEvaluationAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { evaluationId: 'eval-1', attempt: 1 },
          data: expect.objectContaining({
            status: AiInterviewEvaluationStatus.FAILED,
            failureCode: 'PROVIDER_UNAVAILABLE',
            failureMessageSafe: expect.stringContaining('Qwen endpoint unreachable'),
          }),
        }),
      );
      expect(prisma.aiInterview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { evaluationStatus: AiInterviewEvaluationStatus.FAILED },
        }),
      );
    });
  });

  describe('recordDecision', () => {
    it('records the recruiter decision and audits the review', async () => {
      prisma.aiInterviewEvaluation.findFirst.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.COMPLETED }),
      );
      prisma.aiInterviewEvaluation.update.mockResolvedValue({
        ...makeEvaluationRow(),
        recruiterDecision: 'PASS',
      });
      audit.record.mockResolvedValue({});
      await service.recordDecision('interview-1', 'company-1', 'PASS', 'Great fit', {
        userId: 'user-1',
        membershipId: 'mem-1',
      });
      expect(prisma.aiInterviewEvaluation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recruiterDecision: 'PASS',
            decidedByMembershipId: 'mem-1',
            decisionNote: 'Great fit',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: ApplicationAuditEventType.AI_INTERVIEW_REVIEWED }),
      );
    });

    it('rejects a decision when no evaluation exists', async () => {
      prisma.aiInterviewEvaluation.findFirst.mockResolvedValue(null);
      await expect(
        service.recordDecision('interview-1', 'company-1', 'PASS', null, {
          userId: 'user-1',
          membershipId: 'mem-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reEvaluate and getForInterview', () => {
    it('re-evaluates a completed interview with a fresh attempt on the SAME evaluation and audits', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.FAILED, attempt: 1 }),
      );
      prisma.aiInterviewEvaluation.update.mockResolvedValue({ id: 'eval-1', attempt: 2 });
      prisma.aiInterviewEvaluationAttempt.create.mockResolvedValue({ id: 'attempt-2' });
      prisma.aiInterviewEvidence.deleteMany.mockResolvedValue({ count: 0 });
      prisma.aiInterviewCompetencyEvaluation.deleteMany.mockResolvedValue({ count: 0 });
      prisma.aiInterview.update.mockResolvedValue({});
      queue.getJob.mockResolvedValue(null);

      await service.reEvaluate('interview-1', 'company-1', { userId: 'u', membershipId: 'm' });
      expect(prisma.aiInterviewEvaluation.create).not.toHaveBeenCalled();
      expect(prisma.aiInterviewEvaluation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ attempt: 2 }) }),
      );
      expect(prisma.aiInterviewEvaluationAttempt.create).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'AI interview re-evaluation requested.' }),
      );
    });

    it('never bumps the attempt when a forced re-evaluation races an in-flight run', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
      });
      prisma.aiInterviewEvaluation.findUnique.mockResolvedValue(
        makeEvaluationRow({ status: AiInterviewEvaluationStatus.RUNNING, attempt: 1 }),
      );
      queue.getJob.mockResolvedValue(null);

      const result = await service.scheduleEvaluation('interview-1', 'company-1', { force: true });
      expect(result.status).toBe(AiInterviewEvaluationStatus.RUNNING);
      expect(prisma.aiInterviewEvaluation.update).not.toHaveBeenCalled();
      expect(prisma.aiInterviewEvaluationAttempt.create).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('rejects re-evaluation of an incomplete interview', async () => {
      prisma.aiInterview.findFirst.mockResolvedValue({ ...READY_INTERVIEW, status: 'IN_PROGRESS' });
      await expect(
        service.reEvaluate('interview-1', 'company-1', { userId: 'u', membershipId: 'm' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns a report-shaped payload including rich evidence for the interview', async () => {
      prisma.aiInterviewEvaluation.findFirst.mockResolvedValue(
        makeEvaluationRow({
          status: AiInterviewEvaluationStatus.COMPLETED,
          totalScore: 80,
          maximumScore: 100,
          recommendation: 'PASS',
          confidence: 'HIGH',
          competencyEvaluations: [
            {
              id: 'comp-1',
              competency: 'Kubernetes',
              status: 'MET',
              score: 80,
              maxScore: 100,
              weight: 1,
              confidence: 'HIGH',
              rationale: 'ok',
              sortOrder: 0,
              evidence: [
                {
                  quote: 'I led a Kubernetes migration',
                  verification: 'VERBATIM',
                  excerpt: 'I led a Kubernetes migration at my last job.',
                  transcriptId: 'transcript-1',
                  segmentIndexes: [1],
                  startSeconds: 10,
                  endSeconds: 20,
                  sourceSegmentIndex: 1,
                  sourceSeconds: 10,
                },
              ],
            },
          ],
          attempts: [
            { id: 'att-1', attempt: 1, status: 'COMPLETED', provider: 'mock', latencyMs: 12 },
          ],
        }),
      );
      prisma.aiInterview.findFirst.mockResolvedValue(READY_INTERVIEW);
      prisma.aiInterviewEvaluation.count.mockResolvedValue(1);

      const result = await service.getForInterview('interview-1', 'company-1');
      expect(result.evaluationStatus).toBe('COMPLETED');
      expect(result.report).not.toBeNull();
      expect(result.report!.totalScore).toBe(80);
      expect(result.report!.competencies[0].evidence[0]).toMatchObject({
        quote: 'I led a Kubernetes migration',
        excerpt: 'I led a Kubernetes migration at my last job.',
        transcriptId: 'transcript-1',
        segmentIndexes: [1],
        startSeconds: 10,
        endSeconds: 20,
      });
      expect(result.attempts).toHaveLength(1);
    });
  });
});
