import { AiInterviewTranscriptService } from '../../evaluation/ai-interview-transcript.service';
import { AiInterviewTranscriptSegmentType } from '@prisma/client';

describe('AiInterviewTranscriptService', () => {
  let service: AiInterviewTranscriptService;
  let prisma: any;

  const mockThreads = {
    transcript: {
      role: 'assistant',
      content: 'Tell me about your Kubernetes experience.',
      seconds_from_start: 12,
      duration: 6,
    },
    cyears: {
      role: 'user',
      content: 'I led a Kubernetes migration at my last job.',
      seconds_from_start: 20,
      duration: 9,
    },
    comgmnt: {
      role: 'user',
      content:
        '__MOCK_INTERVIEW_SCENARIO:WEAK I coordinated with stakeholders on Kubernetes deliverables.',
      seconds_from_start: 32,
      duration: 7,
    },
  };

  function mockInterview(overrides: Record<string, unknown> = {}) {
    return {
      id: 'interview-1',
      companyId: 'company-1',
      applicationId: 'app-1',
      language: 'en',
      transcript: [
        { role: 'system', content: 'The session started.', seconds_from_start: 0, duration: 1 },
        mockThreads.transcript,
        mockThreads.cyears,
        mockThreads.comgmnt,
      ],
      application: {
        candidateId: 'cand-1',
        candidate: { id: 'cand-1', firstName: 'Daniel', lastName: 'Kato' },
        jobId: 'job-1',
        job: {
          title: 'DevOps Engineer',
          description: 'Run infrastructure.',
          responsibilities: 'Own the platform.',
          qualifications: '5 years of ops.',
          experienceLevel: 'SENIOR',
          skills: [
            { skill: { displayName: 'Kubernetes' } },
            { skill: { displayName: 'Networking' } },
          ],
        },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      aiInterview: { findUnique: jest.fn() },
      aiInterviewTranscript: { findUnique: jest.fn(), upsert: jest.fn() },
      aiInterviewTranscriptSegment: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: any) => unknown) => cb(prisma)),
    };
    service = new AiInterviewTranscriptService(prisma);
  });

  describe('ensureTranscript', () => {
    beforeEach(() => {
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview());
      prisma.aiInterviewTranscript.findUnique.mockResolvedValue(null);
      prisma.aiInterviewTranscript.upsert.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscriptSegment.createMany.mockResolvedValue({ count: 3 });
      prisma.aiInterviewTranscriptSegment.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('normalizes raw turns into typed segments with SYSTEM hidden', async () => {
      const result = await service.ensureTranscript('interview-1');
      expect(result.segments.length).toBe(4);
      expect(result.segments[0].segmentType).toBe(AiInterviewTranscriptSegmentType.SYSTEM);
      expect(result.segments[0].hidden).toBe(true);
      expect(result.segments[1].segmentType).toBe(AiInterviewTranscriptSegmentType.ASSISTANT);
      expect(result.segments[1].hidden).toBe(false);
      expect(result.segments[2].segmentType).toBe(AiInterviewTranscriptSegmentType.USER);
      expect(result.segments[2].endSeconds).toBe(29);
      expect(result.segments[3].characterCount).toBeGreaterThan(0);
    });

    it('aggregates candidate response text from non-hidden USER segments only', async () => {
      const result = await service.ensureTranscript('interview-1');
      expect(result.candidateResponseText).toContain('led a Kubernetes migration');
      expect(result.candidateResponseText).toContain('coordinated with stakeholders');
      expect(result.candidateResponseText).not.toContain('Tell me about your Kubernetes');
    });

    it('persists segment rows on a fresh transcript', async () => {
      await service.ensureTranscript('interview-1');
      expect(prisma.aiInterviewTranscript.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.aiInterviewTranscriptSegment.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.aiInterviewTranscriptSegment.deleteMany).not.toHaveBeenCalled();
    });

    it('rebuilds segments idempotently when the transcript row already exists', async () => {
      prisma.aiInterviewTranscript.findUnique.mockResolvedValue({ id: 'transcript-1' });
      const result = await service.ensureTranscript('interview-1');
      expect(prisma.aiInterviewTranscriptSegment.deleteMany).toHaveBeenCalledWith({
        where: { transcriptId: 'transcript-1' },
      });
      expect(result.transcriptId).toBe('transcript-1');
    });
  });

  describe('buildEvaluationInput', () => {
    it('derives competencies from the job skills and includes candidate context + response text', async () => {
      prisma.aiInterview.findUnique.mockResolvedValue(mockInterview());
      prisma.aiInterviewTranscript.findUnique.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscript.upsert.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscriptSegment.createMany.mockResolvedValue({ count: 3 });

      const { input } = await service.buildEvaluationInput('interview-1');
      expect(input.jobTitle).toBe('DevOps Engineer');
      expect(input.competencies).toEqual([
        {
          competency: 'Kubernetes',
          description: 'Required skill for DevOps Engineer.',
          guidance:
            'Score only from candidate transcript evidence. The candidate must demonstrate this competency in their own words.',
          maxScore: 100,
          weight: 1,
        },
        {
          competency: 'Networking',
          description: 'Required skill for DevOps Engineer.',
          guidance:
            'Score only from candidate transcript evidence. The candidate must demonstrate this competency in their own words.',
          maxScore: 100,
          weight: 1,
        },
      ]);
      expect(input.candidateContext).toBe('Daniel Kato');
      expect(input.candidateResponseText).toContain('Kubernetes migration');
      expect(input.transcript[0].role).toBe('system');
      expect(input.transcript[1]).toMatchObject({
        role: 'assistant',
        content: mockThreads.transcript.content,
        secondsFromStart: 12,
      });
    });

    it('falls back to a single "Role fit" competency when the job has no skills', async () => {
      const noSkills = mockInterview({
        application: {
          ...mockInterview().application,
          job: {
            ...mockInterview().application.job,
            skills: [],
          },
        },
      });
      prisma.aiInterview.findUnique.mockResolvedValue(noSkills);
      prisma.aiInterviewTranscript.findUnique.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscript.upsert.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscriptSegment.createMany.mockResolvedValue({ count: 3 });

      const { input } = await service.buildEvaluationInput('interview-1');
      expect(input.competencies).toHaveLength(1);
      expect(input.competencies[0].competency).toBe('Role fit');
    });

    it('caps the competency set at 12 skills', async () => {
      const manySkills = {
        ...mockInterview(),
        application: {
          ...mockInterview().application,
          job: {
            ...mockInterview().application.job,
            skills: Array.from({ length: 20 }, (_, i) => ({
              skill: { displayName: `Skill ${i + 1}` },
            })),
          },
        },
      };
      prisma.aiInterview.findUnique.mockResolvedValue(manySkills);
      prisma.aiInterviewTranscript.findUnique.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscript.upsert.mockResolvedValue({ id: 'transcript-1' });
      prisma.aiInterviewTranscriptSegment.createMany.mockResolvedValue({ count: 3 });

      const { input } = await service.buildEvaluationInput('interview-1');
      expect(input.competencies).toHaveLength(12);
    });
  });
});
