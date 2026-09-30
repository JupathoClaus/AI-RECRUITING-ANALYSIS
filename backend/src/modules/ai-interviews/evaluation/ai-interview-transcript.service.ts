import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  AiInterviewTranscriptStatus,
  AiInterviewTranscriptSegmentType,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import {
  AiInterviewAiEvaluationInput,
  AiInterviewTranscriptInput,
} from './ai-interview-ai-provider.interface';

export interface TranscriptTurn {
  role?: string;
  content?: string;
  seconds_from_start?: number;
  duration?: number;
}

export interface NormalizedSegment {
  segmentIndex: number;
  segmentType: AiInterviewTranscriptSegmentType;
  speakerRole: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  durationSeconds: number | null;
  textRaw: string | null;
  textNormalized: string | null;
  characterCount: number;
  hidden: boolean;
}

export interface NormalizedTranscript {
  transcriptId: string;
  candidateResponseText: string;
  transcriptInput: AiInterviewTranscriptInput[];
  segments: NormalizedSegment[];
}

const MAX_COMPETENCIES = 12;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes the raw provider transcript (the sanitized JSON blob persisted on
 * the interview) into a stable, queryable per-interview transcript with typed
 * segments, and derives the AI evaluation input: the server-derived job
 * competencies and the candidate-only response text used for evidence
 * verification. Idempotent — re-runs diff-clean and rebuild the segments.
 */
@Injectable()
export class AiInterviewTranscriptService {
  private readonly logger = new Logger(AiInterviewTranscriptService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists the normalized transcript row + segments and returns everything
   * the evaluator needs.
   */
  async ensureTranscript(interviewId: string): Promise<NormalizedTranscript> {
    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: {
              select: { id: true },
            },
            job: {
              select: {
                id: true,
                title: true,
                description: true,
                responsibilities: true,
                qualifications: true,
                experienceLevel: true,
                skills: { include: { skill: { select: { displayName: true } } } },
              },
            },
          },
        },
      },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found.',
      });
    }

    const rawTurns = Array.isArray(interview.transcript)
      ? (interview.transcript as TranscriptTurn[])
      : [];
    const normalized = this.normalizeTurns(rawTurns);

    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rawTurns ?? []))
      .digest('hex');

    const existing = await this.prisma.aiInterviewTranscript.findUnique({
      where: { aiInterviewId: interview.id },
      select: { id: true },
    });

    const record = await this.prisma.$transaction(async (tx) => {
      const r = await tx.aiInterviewTranscript.upsert({
        where: { aiInterviewId: interview.id },
        create: {
          aiInterviewId: interview.id,
          companyId: interview.companyId,
          applicationId: interview.applicationId,
          candidateId: interview.application.candidateId,
          jobId: interview.application.jobId,
          status: AiInterviewTranscriptStatus.READY,
          language: interview.language || 'en',
          formatVersion: 'v1',
          contentHash,
          rawTurns: (rawTurns as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
        update: {
          companyId: interview.companyId,
          applicationId: interview.applicationId,
          candidateId: interview.application.candidateId,
          jobId: interview.application.jobId,
          status: AiInterviewTranscriptStatus.READY,
          language: interview.language || 'en',
          formatVersion: 'v1',
          contentHash,
          rawTurns: (rawTurns as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.aiInterviewTranscriptSegment.deleteMany({ where: { transcriptId: existing.id } });
      }
      if (normalized.segments.length > 0) {
        await tx.aiInterviewTranscriptSegment.createMany({
          data: normalized.segments.map((s) => ({ transcriptId: r.id, ...s })),
        });
      }
      return r;
    });

    return { transcriptId: record.id, ...normalized };
  }

  /**
   * Builds the AI evaluation input, including the server-derived, job-specific
   * competency set (the provider may only evaluate these).
   */
  async buildEvaluationInput(interviewId: string): Promise<{
    transcript: NormalizedTranscript;
    input: AiInterviewAiEvaluationInput;
  }> {
    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: {
              select: { id: true },
            },
            job: {
              select: {
                id: true,
                title: true,
                description: true,
                responsibilities: true,
                qualifications: true,
                experienceLevel: true,
                skills: { include: { skill: { select: { displayName: true } } } },
              },
            },
          },
        },
      },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found.',
      });
    }

    const transcript = await this.ensureTranscript(interview.id);
    const job = interview.application.job as unknown as JobCompetencySource;
    const competencies = this.buildCompetencies(job);

    return {
      transcript,
      input: {
        jobTitle: job.title,
        jobDescription: job.description,
        jobResponsibilities: job.responsibilities,
        jobQualifications: job.qualifications,
        experienceLevel: job.experienceLevel ?? null,
        competencies: competencies.map((c) => ({ ...c })),
        transcript: transcript.transcriptInput,
        candidateResponseText: transcript.candidateResponseText,
      },
    };
  }

  private normalizeTurns(
    raw: TranscriptTurn[],
  ): Pick<NormalizedTranscript, 'candidateResponseText' | 'transcriptInput' | 'segments'> {
    const segments: NormalizedSegment[] = [];
    const userSpans: string[] = [];
    const transcriptInput: AiInterviewTranscriptInput[] = [];

    raw.forEach((turn, index) => {
      const content = typeof turn.content === 'string' ? turn.content : '';
      const role = typeof turn.role === 'string' ? turn.role.toLowerCase() : '';
      let segmentType: AiInterviewTranscriptSegmentType = AiInterviewTranscriptSegmentType.SYSTEM;
      if (role === 'user') segmentType = AiInterviewTranscriptSegmentType.USER;
      else if (role === 'assistant') segmentType = AiInterviewTranscriptSegmentType.ASSISTANT;

      const start = typeof turn.seconds_from_start === 'number' ? turn.seconds_from_start : null;
      const duration = typeof turn.duration === 'number' ? turn.duration : null;
      segments.push({
        segmentIndex: index,
        segmentType,
        speakerRole: role || null,
        startSeconds: start,
        endSeconds: start !== null && duration !== null ? start + duration : null,
        durationSeconds: duration,
        textRaw: content || null,
        textNormalized: content ? normalizeText(content) : null,
        characterCount: content.length,
        hidden: segmentType === AiInterviewTranscriptSegmentType.SYSTEM,
      });
      transcriptInput.push({
        role:
          segmentType === AiInterviewTranscriptSegmentType.USER
            ? 'user'
            : segmentType === AiInterviewTranscriptSegmentType.ASSISTANT
              ? 'assistant'
              : 'system',
        content: content || '',
        secondsFromStart: start,
        durationSeconds: duration,
      });
      if (segmentType === AiInterviewTranscriptSegmentType.USER && content.trim()) {
        userSpans.push(content);
      }
    });

    return {
      candidateResponseText: userSpans.join(' '),
      transcriptInput,
      segments,
    };
  }

  private buildCompetencies(job: JobCompetencySource): {
    competency: string;
    description: string | null;
    guidance: string | null;
    maxScore: number;
    weight: number;
  }[] {
    const skills = (job.skills ?? [])
      .map((s) => s.skill?.displayName)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

    if (skills.length === 0) {
      return [
        {
          competency: 'Role fit',
          description: `Overall fit for the ${job.title} role based on the interview transcript.`,
          guidance:
            'Job title, description, responsibilities, and qualifications are the reference. Score only from candidate transcript evidence.',
          maxScore: 100,
          weight: 1,
        },
      ];
    }

    return skills.slice(0, MAX_COMPETENCIES).map((name) => ({
      competency: name,
      description: `Required skill for ${job.title}.`,
      guidance:
        'Score only from candidate transcript evidence. The candidate must demonstrate this competency in their own words.',
      maxScore: 100,
      weight: 1,
    }));
  }
}

interface JobCompetencySource {
  title: string;
  description?: string | null;
  responsibilities?: string | null;
  qualifications?: string | null;
  experienceLevel?: string | null;
  skills?: { skill?: { displayName?: string | null } | null }[] | null;
}
