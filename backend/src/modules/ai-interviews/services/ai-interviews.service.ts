import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  AiInterviewStatus,
  AiInterviewProvider,
  AiInterviewTranscriptStatus,
  Prisma,
} from '@prisma/client';
import { CreateAiInterviewDto } from '../dto/create-ai-interview.dto';
import { SendInvitationDto } from '../dto/send-invitation.dto';
import { VerifyCodeDto } from '../dto/verify-code.dto';
import { StartAiInterviewDto } from '../dto/start-ai-interview.dto';
import { AiInterviewCodeService } from './ai-interview-code.service';
import { TavusClientService } from './tavus-client.service';
import { EmailService } from '@modules/email/email.service';
import * as crypto from 'crypto';

const INTERVIEW_ACCESS_TOKEN_PREFIX = 'ai-interview-token-';

@Injectable()
export class AiInterviewsService {
  private readonly logger = new Logger(AiInterviewsService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeService: AiInterviewCodeService,
    private readonly tavusClient: TavusClientService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
  }

  async create(
    dto: CreateAiInterviewDto,
    companyId: string,
    membershipId: string,
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id: dto.applicationId, companyId, deletedAt: null },
      include: {
        candidate: true,
        job: true,
      },
    });
    if (!application) {
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
    }

    const existing = await this.prisma.aiInterview.findFirst({
      where: {
        applicationId: dto.applicationId,
        status: { notIn: [AiInterviewStatus.CANCELLED, AiInterviewStatus.EXPIRED, AiInterviewStatus.FAILED] },
      },
    });
    if (existing) {
      return this.findById(existing.id);
    }

    const rawCode = this.codeService.generate();
    const codeHash = this.codeService.hash(rawCode);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const interview = await this.prisma.aiInterview.create({
      data: {
        applicationId: dto.applicationId,
        companyId,
        provider: (dto.provider as AiInterviewProvider) || AiInterviewProvider.TAVUS,
        status: AiInterviewStatus.CREATED,
        codeHash,
        codeDisplayHint: this.codeService.displayHint(rawCode),
        language: dto.language || 'en',
        estimatedDurationMinutes: dto.estimatedDurationMinutes || 30,
        expiresAt,
        notes: dto.notes || null,
        createdByMembershipId: membershipId,
        transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
      },
      include: {
        application: {
          include: { candidate: true, job: true },
        },
      },
    });

    return {
      ...interview,
      rawCode,
    };
  }

  async findById(id: string) {
    const interview = await this.prisma.aiInterview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
    });
    if (!interview) {
      throw new NotFoundException({ code: 'AI_INTERVIEW_NOT_FOUND', message: 'AI interview not found' });
    }
    return interview;
  }

  async findByApplication(applicationId: string, companyId: string) {
    return this.prisma.aiInterview.findMany({
      where: { applicationId, company: { id: companyId } },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async regenerateCode(id: string, companyId: string) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
    });
    if (!interview) {
      throw new NotFoundException({ code: 'AI_INTERVIEW_NOT_FOUND', message: 'AI interview not found' });
    }
    if (interview.status === AiInterviewStatus.COMPLETED || interview.status === AiInterviewStatus.CANCELLED) {
      throw new BadRequestException({ code: 'AI_INTERVIEW_TERMINAL', message: 'Cannot regenerate code for a completed or cancelled interview' });
    }

    const rawCode = this.codeService.generate();
    const codeHash = this.codeService.hash(rawCode);

    await this.prisma.aiInterview.update({
      where: { id },
      data: { codeHash },
    });

    return { rawCode, displayHint: this.codeService.displayHint(rawCode) };
  }

  async sendInvitation(
    id: string,
    dto: SendInvitationDto,
    companyId: string,
  ) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
    });
    if (!interview) {
      throw new NotFoundException({ code: 'AI_INTERVIEW_NOT_FOUND', message: 'AI interview not found' });
    }

    const companyName = 'AI Recruiter Co';
    const candidateName = `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`;
    const jobTitle = interview.application.job.title;
    const code = interview.codeDisplayHint || '';

    const accessToken = this.generateAccessToken(interview.id);
    const interviewLink = `${this.frontendUrl}/interview/access?token=${accessToken}`;

    try {
      await this.emailService.sendAiInterviewInvitationEmail(
        dto.to,
        candidateName,
        jobTitle,
        companyName,
        interviewLink,
        code,
        interview.estimatedDurationMinutes,
        interview.expiresAt,
        dto.note,
      );
    } catch (error) {
      this.logger.error(`Failed to send AI interview invitation email: ${error}`);
      throw new BadRequestException({
        code: 'EMAIL_SEND_FAILED',
        message: 'Failed to send invitation email. The interview record has been preserved. Please try again.',
      });
    }

    // Reset invitation token
    const newCode = this.codeService.generate();
    const newCodeHash = this.codeService.hash(newCode);

    await this.prisma.aiInterview.update({
      where: { id },
      data: {
        status: AiInterviewStatus.SENT,
        invitationSentAt: new Date(),
        invitationEmail: dto.to,
        codeHash: newCodeHash,
        codeDisplayHint: this.codeService.displayHint(newCode),
      },
    });

    return {
      sent: true,
      sentAt: new Date().toISOString(),
      codeHint: this.codeService.displayHint(newCode),
      rawCode: newCode,
    };
  }

  async cancel(id: string, companyId: string) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
    });
    if (!interview) {
      throw new NotFoundException({ code: 'AI_INTERVIEW_NOT_FOUND', message: 'AI interview not found' });
    }
    if (interview.status === AiInterviewStatus.COMPLETED || interview.status === AiInterviewStatus.CANCELLED) {
      throw new BadRequestException({ code: 'AI_INTERVIEW_TERMINAL', message: 'Interview is already in a terminal state' });
    }

    await this.prisma.aiInterview.update({
      where: { id },
      data: { status: AiInterviewStatus.CANCELLED, cancelledAt: new Date() },
    });

    return { cancelled: true };
  }

  // ─── PUBLIC ENDPOINTS ──────────────────────────────────────────────────────

  async verifyCode(dto: VerifyCodeDto) {
    const normalized = this.codeService.normalize(dto.code);
    const codeHash = this.codeService.hash(normalized);

    const interview = await this.prisma.aiInterview.findUnique({
      where: { codeHash },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!interview) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'We could not verify this interview code.' });
    }

    if (interview.status === AiInterviewStatus.EXPIRED) {
      throw new BadRequestException({ code: 'INTERVIEW_EXPIRED', message: 'This interview is no longer available.' });
    }
    if (interview.status === AiInterviewStatus.CANCELLED || interview.status === AiInterviewStatus.FAILED) {
      throw new BadRequestException({ code: 'INTERVIEW_UNAVAILABLE', message: 'This interview is no longer available.' });
    }
    if (interview.status === AiInterviewStatus.COMPLETED) {
      throw new BadRequestException({ code: 'INTERVIEW_COMPLETED', message: 'This interview has already been completed.' });
    }

    if (interview.expiresAt && interview.expiresAt < new Date()) {
      await this.prisma.aiInterview.update({
        where: { id: interview.id },
        data: { status: AiInterviewStatus.EXPIRED },
      });
      throw new BadRequestException({ code: 'INTERVIEW_EXPIRED', message: 'This interview is no longer available.' });
    }

    // Update status to ACCESSED if not already sent/accessed
    if (interview.status === AiInterviewStatus.SENT || interview.status === AiInterviewStatus.CREATED) {
      await this.prisma.aiInterview.update({
        where: { id: interview.id },
        data: { status: AiInterviewStatus.ACCESSED, accessedAt: new Date() },
      });
    }

    const accessToken = this.generateAccessToken(interview.id);

    return {
      accessToken,
      interviewId: interview.id,
      candidateName: `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
      jobTitle: interview.application.job.title,
      language: interview.language,
      estimatedDurationMinutes: interview.estimatedDurationMinutes,
      expiresAt: interview.expiresAt,
      provider: interview.provider,
      status: AiInterviewStatus.ACCESSED,
    };
  }

  async getInterviewSession(accessToken: string) {
    const interviewId = this.verifyAccessToken(accessToken);
    if (!interviewId) {
      throw new BadRequestException({ code: 'INVALID_SESSION', message: 'Invalid or expired session.' });
    }

    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
            job: { select: { id: true, title: true, description: true } },
          },
        },
      },
    });

    if (!interview) {
      throw new BadRequestException({ code: 'INVALID_SESSION', message: 'Interview not found.' });
    }

    return {
      candidateName: `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
      candidateFirstName: interview.application.candidate.firstName,
      jobTitle: interview.application.job.title,
      jobDescription: interview.application.job.description,
      language: interview.language,
      estimatedDurationMinutes: interview.estimatedDurationMinutes,
      expiresAt: interview.expiresAt,
      provider: interview.provider,
      status: interview.status,
    };
  }

  async startInterview(accessToken: string, dto: StartAiInterviewDto) {
    const interviewId = this.verifyAccessToken(accessToken);
    if (!interviewId) {
      throw new BadRequestException({ code: 'INVALID_SESSION', message: 'Invalid or expired session.' });
    }

    if (!dto.acknowledgementsAccepted) {
      throw new BadRequestException({ code: 'ACKNOWLEDGEMENT_REQUIRED', message: 'You must accept the required acknowledgements before starting.' });
    }

    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: true,
            job: true,
          },
        },
      },
    });

    if (!interview) {
      throw new BadRequestException({ code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found.' });
    }

    if (interview.status === AiInterviewStatus.COMPLETED) {
      throw new BadRequestException({ code: 'INTERVIEW_COMPLETED', message: 'This interview has already been completed.' });
    }
    if (interview.status === AiInterviewStatus.CANCELLED || interview.status === AiInterviewStatus.EXPIRED || interview.status === AiInterviewStatus.FAILED) {
      throw new BadRequestException({ code: 'INTERVIEW_UNAVAILABLE', message: 'This interview is no longer available.' });
    }
    if (interview.status === AiInterviewStatus.IN_PROGRESS) {
      if (interview.tavusConversationId && interview.tavusConversationUrl) {
        return {
          conversationUrl: interview.tavusConversationUrl,
          conversationId: interview.tavusConversationId,
          meetingToken: interview.tavusMeetingToken,
          provider: interview.provider,
          status: AiInterviewStatus.IN_PROGRESS,
        };
      }
    }

    // Create Tavus conversation
    if (interview.provider === AiInterviewProvider.TAVUS) {
      if (!this.tavusClient.isEnabled) {
        // Mock mode
        const mockUrl = `${this.frontendUrl}/interview/session/mock?interviewId=${interview.id}`;
        const now = new Date();
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            status: AiInterviewStatus.IN_PROGRESS,
            startedAt: now,
            tavusConversationId: `mock-${interview.id}`,
            tavusConversationUrl: mockUrl,
            tavusStatus: 'mock_created',
            transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
          },
        });

        return {
          conversationUrl: mockUrl,
          conversationId: `mock-${interview.id}`,
          meetingToken: null,
          provider: AiInterviewProvider.MOCK,
          status: AiInterviewStatus.IN_PROGRESS,
        };
      }

      const personaId = this.configService.get<string>('tavus.personaId') || '';
      const replicaId = this.configService.get<string>('tavus.replicaId') || '';
      const callbackBaseUrl = this.configService.get<string>('tavus.callbackBaseUrl') || this.frontendUrl;

      if (!personaId || !replicaId) {
        throw new BadRequestException({
          code: 'TAVUS_CONFIG_MISSING',
          message: 'Tavus Persona ID and Replica ID must be configured.',
        });
      }

      const context = this.buildConversationContext(interview);
      const greeting = `Hello ${interview.application.candidate.firstName}. Welcome to your interview for the ${interview.application.job.title} position. Before we begin, could you please confirm your full name?`;

      try {
        const tavusResponse = await this.tavusClient.createConversation({
          persona_id: personaId,
          replica_id: replicaId,
          conversation_name: `AI Interview - ${interview.application.job.title} - ${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
          conversational_context: context,
          custom_greeting: greeting,
          callback_url: `${callbackBaseUrl}/api/v1/ai-interviews/callback`,
          require_auth: true,
          max_participants: 2,
          max_call_duration_seconds: this.configService.get<number>('tavus.maxCallDurationSeconds') || 600,
          participant_absent_timeout_seconds: this.configService.get<number>('tavus.participantAbsentTimeoutSeconds') || 120,
          participant_left_timeout_seconds: this.configService.get<number>('tavus.participantLeftTimeoutSeconds') || 60,
        });

        const now = new Date();
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            status: AiInterviewStatus.IN_PROGRESS,
            startedAt: now,
            tavusConversationId: tavusResponse.conversation_id,
            tavusConversationUrl: tavusResponse.conversation_url,
            tavusMeetingToken: tavusResponse.meeting_token || null,
            tavusStatus: tavusResponse.status,
            transcriptStatus: AiInterviewTranscriptStatus.NOT_REQUESTED,
          },
        });

        return {
          conversationUrl: tavusResponse.conversation_url,
          conversationId: tavusResponse.conversation_id,
          meetingToken: tavusResponse.meeting_token || null,
          provider: AiInterviewProvider.TAVUS,
          status: AiInterviewStatus.IN_PROGRESS,
        };
      } catch (error) {
        this.logger.error(`Tavus conversation creation failed: ${error}`);
        throw new BadRequestException({
          code: 'TAVUS_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create interview session.',
        });
      }
    }

    // Mock provider
    const mockUrl = `${this.frontendUrl}/interview/session/mock?interviewId=${interview.id}`;
    const now = new Date();
    await this.prisma.aiInterview.update({
      where: { id: interview.id },
      data: {
        status: AiInterviewStatus.IN_PROGRESS,
        startedAt: now,
        tavusConversationId: `mock-${interview.id}`,
        tavusConversationUrl: mockUrl,
        tavusStatus: 'mock_created',
      },
    });

    return {
      conversationUrl: mockUrl,
      conversationId: `mock-${interview.id}`,
      meetingToken: null,
      provider: AiInterviewProvider.MOCK,
      status: AiInterviewStatus.IN_PROGRESS,
    };
  }

  async completeInterview(accessToken: string) {
    const interviewId = this.verifyAccessToken(accessToken);
    if (!interviewId) {
      throw new BadRequestException({ code: 'INVALID_SESSION', message: 'Invalid or expired session.' });
    }

    const now = new Date();
    await this.prisma.aiInterview.update({
      where: { id: interviewId },
      data: {
        status: AiInterviewStatus.COMPLETED,
        completedAt: now,
      },
    });

    return { completed: true };
  }

  // ─── TAVUS CALLBACK ────────────────────────────────────────────────────────

  async handleTavusCallback(payload: { event: string; conversation_id: string; status?: string; payload?: Record<string, unknown> }) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { tavusConversationId: payload.conversation_id },
    });

    if (!interview) {
      this.logger.warn(`Tavus callback for unknown conversation: ${payload.conversation_id}`);
      return { received: true };
    }

    switch (payload.event) {
      case 'system.replica_joined':
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: { tavusStatus: payload.status || 'replica_joined' },
        });
        break;

      case 'system.shutdown':
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            tavusStatus: payload.status || 'shutdown',
            status: AiInterviewStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        break;

      case 'application.transcription_ready':
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            transcriptStatus: AiInterviewTranscriptStatus.READY,
            transcriptUrl: (payload.payload?.transcript_url as string) || null,
          },
        });
        break;

      default:
        this.logger.log(`Tavus unhandled event: ${payload.event} for conversation ${payload.conversation_id}`);
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: { tavusStatus: payload.status || payload.event },
        });
    }

    return { received: true };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  private generateAccessToken(interviewId: string): string {
    const raw = `${INTERVIEW_ACCESS_TOKEN_PREFIX}${interviewId}:${crypto.randomUUID()}`;
    return Buffer.from(raw).toString('base64url');
  }

  private verifyAccessToken(token: string): string | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      if (!decoded.startsWith(INTERVIEW_ACCESS_TOKEN_PREFIX)) return null;
      const interviewId = decoded.slice(INTERVIEW_ACCESS_TOKEN_PREFIX.length).split(':')[0];
      if (!interviewId) return null;
      return interviewId;
    } catch {
      return null;
    }
  }

  private buildConversationContext(interview: any): string {
    const candidate = interview.application.candidate;
    const job = interview.application.job;

    const parts: string[] = [
      `Candidate: ${candidate.firstName} ${candidate.lastName}`,
      `Position: ${job.title}`,
      `Experience: ${candidate.totalExperienceYears || 'Not specified'} years`,
    ];

    if (candidate.skills) {
      try {
        const skills = typeof candidate.skills === 'string' ? JSON.parse(candidate.skills) : candidate.skills;
        if (Array.isArray(skills) && skills.length > 0) {
          parts.push(`Skills: ${skills.join(', ')}`);
        }
      } catch {
        // skills field may not be parseable
      }
    }

    parts.push('Interview objectives: Assess technical competence, problem-solving ability, communication skills, and cultural fit for the role.');
    parts.push('Ask natural follow-up questions based on the candidate\'s responses.');
    parts.push('Remain professional and courteous throughout.');
    parts.push('Avoid discriminatory or unrelated questions about age, gender, religion, marital status, disability, or appearance.');
    parts.push('When the interview is complete, thank the candidate and end politely.');

    return parts.join('\n');
  }
}
