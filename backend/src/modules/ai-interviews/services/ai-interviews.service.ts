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
} from '@prisma/client';
import { CreateAiInterviewDto } from '../dto/create-ai-interview.dto';
import { SendInvitationDto } from '../dto/send-invitation.dto';
import { VerifyCodeDto } from '../dto/verify-code.dto';
import { StartAiInterviewDto } from '../dto/start-ai-interview.dto';
import {
  VerifyCodeResponseDto,
  SessionResponseDto,
  StartInterviewResponseDto,
} from '../dto/public-response.dto';
import { AiInterviewCodeService } from './ai-interview-code.service';
import { AiInterviewTokenService } from './ai-interview-token.service';
import { TavusClientService } from './tavus-client.service';
import { EmailService } from '@modules/email/email.service';

@Injectable()
export class AiInterviewsService {
  private readonly logger = new Logger(AiInterviewsService.name);
  private readonly frontendUrl: string;
  private readonly tavusEnabled: boolean;
  private readonly allowTestEmailOverride: boolean;
  private readonly env: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeService: AiInterviewCodeService,
    private readonly tokenService: AiInterviewTokenService,
    private readonly tavusClient: TavusClientService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    this.tavusEnabled = this.configService.get<boolean>('tavus.enabled') || false;
    this.allowTestEmailOverride =
      this.configService.get<boolean>('aiInterview.allowTestEmailOverride') || false;
    this.env = this.configService.get<string>('app.env') || 'development';
  }

  async create(dto: CreateAiInterviewDto, companyId: string, membershipId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: dto.applicationId, companyId, deletedAt: null },
      include: {
        candidate: true,
        job: true,
      },
    });
    if (!application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
    }

    const existing = await this.prisma.aiInterview.findFirst({
      where: {
        applicationId: dto.applicationId,
        status: {
          notIn: [
            AiInterviewStatus.CANCELLED,
            AiInterviewStatus.EXPIRED,
            AiInterviewStatus.FAILED,
            AiInterviewStatus.COMPLETED,
          ],
        },
      },
    });
    if (existing) {
      return this.findById(existing.id, companyId);
    }

    const provider = this.resolveProvider(dto.provider as AiInterviewProvider | undefined);

    const rawCode = this.codeService.generate();
    const codeHash = this.codeService.hash(rawCode);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const interview = await this.prisma.aiInterview.create({
      data: {
        applicationId: dto.applicationId,
        companyId,
        provider,
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

  async findById(id: string, companyId: string) {
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
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found',
      });
    }
    return this.stripMeetingToken(interview);
  }

  async findByApplication(applicationId: string, companyId: string) {
    const interviews = await this.prisma.aiInterview.findMany({
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
    return interviews.map((i) => this.stripMeetingToken(i));
  }

  async previewInvitation(id: string, companyId: string) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
      include: {
        application: {
          include: {
            candidate: true,
            job: true,
            company: { select: { name: true } },
          },
        },
      },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found',
      });
    }

    const candidate = interview.application.candidate;
    const job = interview.application.job;
    const companyName = interview.application.company?.name || 'AI Recruiter Co';
    const code = interview.codeDisplayHint || '';

    return {
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      candidateEmail: candidate.email,
      jobTitle: job.title,
      companyName,
      interviewCode: code,
      estimatedDurationMinutes: interview.estimatedDurationMinutes,
      expiresAt: interview.expiresAt,
    };
  }

  async regenerateCode(id: string, companyId: string) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found',
      });
    }
    if (
      interview.status === AiInterviewStatus.COMPLETED ||
      interview.status === AiInterviewStatus.CANCELLED
    ) {
      throw new BadRequestException({
        code: 'AI_INTERVIEW_TERMINAL',
        message: 'Cannot regenerate code for a completed or cancelled interview',
      });
    }

    const rawCode = this.codeService.generate();
    const codeHash = this.codeService.hash(rawCode);

    await this.prisma.aiInterview.update({
      where: { id },
      data: {
        codeHash,
        codeDisplayHint: this.codeService.displayHint(rawCode),
      },
    });

    return { rawCode, displayHint: this.codeService.displayHint(rawCode) };
  }

  async sendInvitation(id: string, dto: SendInvitationDto, companyId: string) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
      include: {
        application: {
          include: {
            candidate: true,
            job: true,
            company: { select: { name: true } },
          },
        },
      },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found',
      });
    }

    const candidate = interview.application.candidate;
    const job = interview.application.job;
    const companyName = interview.application.company?.name || 'AI Recruiter Co';

    // Verify raw code if provided
    if (dto.rawCode) {
      const normalizedInput = this.codeService.normalize(dto.rawCode);
      const inputHash = this.codeService.hash(normalizedInput);
      if (inputHash !== interview.codeHash) {
        throw new BadRequestException({
          code: 'CODE_MISMATCH',
          message: 'The interview code has changed. Please use the latest code.',
        });
      }
    }

    // Derive email from application
    const to = candidate.email;
    if (!to) {
      throw new BadRequestException({
        code: 'CANDIDATE_EMAIL_MISSING',
        message: 'The candidate does not have an email address.',
      });
    }

    // Allow override only in development/test with explicit flag
    const effectiveTo: string = to;

    const accessToken = this.tokenService.generate(interview.id, interview.codeHash);
    const interviewLink = `${this.frontendUrl}/interview/access`;

    try {
      await this.emailService.sendAiInterviewInvitationEmail(
        effectiveTo,
        `${candidate.firstName} ${candidate.lastName}`,
        job.title,
        companyName,
        interviewLink,
        interview.codeDisplayHint || '',
        interview.estimatedDurationMinutes,
        interview.expiresAt,
        dto.note,
      );
    } catch (error) {
      this.logger.error(`Failed to send AI interview invitation email: ${error}`);
      throw new BadRequestException({
        code: 'EMAIL_SEND_FAILED',
        message:
          'Failed to send invitation email. The interview record has been preserved. Please try again.',
      });
    }

    // Keep codeHash unchanged - the code in the email remains valid
    await this.prisma.aiInterview.update({
      where: { id },
      data: {
        status: AiInterviewStatus.SENT,
        invitationSentAt: new Date(),
        invitationEmail: effectiveTo,
      },
    });

    return {
      sent: true,
      sentAt: new Date().toISOString(),
      codeHint: interview.codeDisplayHint,
    };
  }

  async cancel(id: string, companyId: string) {
    const interview = await this.prisma.aiInterview.findFirst({
      where: { id, companyId },
    });
    if (!interview) {
      throw new NotFoundException({
        code: 'AI_INTERVIEW_NOT_FOUND',
        message: 'AI interview not found',
      });
    }
    if (
      interview.status === AiInterviewStatus.COMPLETED ||
      interview.status === AiInterviewStatus.CANCELLED
    ) {
      throw new BadRequestException({
        code: 'AI_INTERVIEW_TERMINAL',
        message: 'Interview is already in a terminal state',
      });
    }

    await this.prisma.aiInterview.update({
      where: { id },
      data: { status: AiInterviewStatus.CANCELLED, cancelledAt: new Date() },
    });

    return { cancelled: true };
  }

  // ─── PUBLIC ENDPOINTS ──────────────────────────────────────────────────────

  async verifyCode(dto: VerifyCodeDto): Promise<VerifyCodeResponseDto> {
    const normalized = this.codeService.normalize(dto.code);
    const codeHash = this.codeService.hash(normalized);

    const interview = await this.prisma.aiInterview.findUnique({
      where: { codeHash },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            job: { select: { id: true, title: true } },
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!interview) {
      throw new BadRequestException({
        code: 'INVALID_CODE',
        message: 'We could not verify this interview code.',
      });
    }

    if (interview.status === AiInterviewStatus.EXPIRED) {
      throw new BadRequestException({
        code: 'INTERVIEW_EXPIRED',
        message: 'This interview is no longer available.',
      });
    }
    if (
      interview.status === AiInterviewStatus.CANCELLED ||
      interview.status === AiInterviewStatus.FAILED
    ) {
      throw new BadRequestException({
        code: 'INTERVIEW_UNAVAILABLE',
        message: 'This interview is no longer available.',
      });
    }
    if (interview.status === AiInterviewStatus.COMPLETED) {
      throw new BadRequestException({
        code: 'INTERVIEW_COMPLETED',
        message: 'This interview has already been completed.',
      });
    }

    if (interview.expiresAt && interview.expiresAt < new Date()) {
      await this.prisma.aiInterview.update({
        where: { id: interview.id },
        data: { status: AiInterviewStatus.EXPIRED },
      });
      throw new BadRequestException({
        code: 'INTERVIEW_EXPIRED',
        message: 'This interview is no longer available.',
      });
    }

    // Update status to ACCESSED if not already
    if (
      interview.status === AiInterviewStatus.SENT ||
      interview.status === AiInterviewStatus.CREATED
    ) {
      await this.prisma.aiInterview.update({
        where: { id: interview.id },
        data: { status: AiInterviewStatus.ACCESSED, accessedAt: new Date() },
      });
    }

    const accessToken = this.tokenService.generate(interview.id, interview.codeHash);
    const companyName = interview.application.company?.name || 'AI Recruiter Co';

    return {
      accessToken,
      candidateFirstName: interview.application.candidate.firstName,
      candidateDisplayName: `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
      jobTitle: interview.application.job.title,
      organizationName: companyName,
      language: interview.language,
      estimatedDurationMinutes: interview.estimatedDurationMinutes,
      expiresAt: interview.expiresAt,
      provider: interview.provider,
      status: AiInterviewStatus.ACCESSED,
    };
  }

  async getInterviewSession(accessToken: string): Promise<SessionResponseDto> {
    const payload = this.tokenService.verify(accessToken);
    const interviewId = payload.sub;

    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
            job: { select: { id: true, title: true, description: true } },
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!interview) {
      throw new BadRequestException({ code: 'INVALID_SESSION', message: 'Interview not found.' });
    }

    if (payload.cv !== interview.codeHash.slice(0, 16)) {
      throw new BadRequestException({
        code: 'CODE_VERSION_MISMATCH',
        message: 'Session expired due to code change.',
      });
    }

    const companyName = interview.application.company?.name || 'AI Recruiter Co';

    return {
      candidateFirstName: interview.application.candidate.firstName,
      candidateDisplayName: `${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
      jobTitle: interview.application.job.title,
      organizationName: companyName,
      language: interview.language,
      estimatedDurationMinutes: interview.estimatedDurationMinutes,
      expiresAt: interview.expiresAt,
      provider: interview.provider,
      status: interview.status,
    };
  }

  async startInterview(
    accessToken: string,
    dto: StartAiInterviewDto,
  ): Promise<StartInterviewResponseDto> {
    const payload = this.tokenService.verify(accessToken);
    const interviewId = payload.sub;

    if (!dto.acknowledgementsAccepted) {
      throw new BadRequestException({
        code: 'ACKNOWLEDGEMENT_REQUIRED',
        message: 'You must accept the required acknowledgements before starting.',
      });
    }

    const interviewForCvCheck = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      select: { codeHash: true },
    });
    if (!interviewForCvCheck) {
      throw new BadRequestException({
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Interview not found.',
      });
    }
    if (payload.cv !== interviewForCvCheck.codeHash.slice(0, 16)) {
      throw new BadRequestException({
        code: 'CODE_VERSION_MISMATCH',
        message: 'Session expired due to code change.',
      });
    }

    // Atomic idempotency: only update if in a pre-start status
    const eligibleStatuses = [
      AiInterviewStatus.ACCESSED,
      AiInterviewStatus.SENT,
      AiInterviewStatus.CREATED,
      AiInterviewStatus.READY,
    ];

    const now = new Date();

    // Try to atomically claim this interview for starting
    const updateResult = await this.prisma.aiInterview.updateMany({
      where: {
        id: interviewId,
        status: { in: eligibleStatuses },
      },
      data: {
        status: AiInterviewStatus.IN_PROGRESS,
        startedAt: now,
      },
    });

    if (updateResult.count === 0) {
      const existing = await this.prisma.aiInterview.findUnique({
        where: { id: interviewId },
      });

      if (!existing) {
        throw new BadRequestException({
          code: 'INTERVIEW_NOT_FOUND',
          message: 'Interview not found.',
        });
      }

      if (existing.status === AiInterviewStatus.COMPLETED) {
        throw new BadRequestException({
          code: 'INTERVIEW_COMPLETED',
          message: 'This interview has already been completed.',
        });
      }

      if (
        existing.status === AiInterviewStatus.CANCELLED ||
        existing.status === AiInterviewStatus.EXPIRED ||
        existing.status === AiInterviewStatus.FAILED
      ) {
        throw new BadRequestException({
          code: 'INTERVIEW_UNAVAILABLE',
          message: 'This interview is no longer available.',
        });
      }

      // Already IN_PROGRESS - return existing session
      if (existing.status === AiInterviewStatus.IN_PROGRESS) {
        if (existing.tavusConversationId && existing.tavusConversationUrl) {
          return {
            conversationUrl: existing.tavusConversationUrl,
            conversationId: existing.tavusConversationId,
            provider: existing.provider,
            status: AiInterviewStatus.IN_PROGRESS,
            meetingToken:
              existing.provider === AiInterviewProvider.MOCK ? null : existing.tavusMeetingToken,
          };
        }
      }

      throw new BadRequestException({
        code: 'INTERVIEW_UNEXPECTED_STATE',
        message: 'Interview is in an unexpected state.',
      });
    }

    // We successfully claimed the interview. Now create the session.
    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: true,
            job: true,
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!interview) {
      throw new BadRequestException({
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Interview not found.',
      });
    }

    // Create provider session
    if (interview.provider === AiInterviewProvider.TAVUS) {
      if (!this.tavusEnabled) {
        throw new BadRequestException({
          code: 'TAVUS_DISABLED',
          message:
            'Tavus is not enabled. This interview cannot be started with the TAVUS provider.',
        });
      }

      const personaId = this.configService.get<string>('tavus.personaId') || '';
      const replicaId = this.configService.get<string>('tavus.replicaId') || '';

      if (!personaId || !replicaId) {
        throw new BadRequestException({
          code: 'TAVUS_CONFIG_MISSING',
          message: 'Tavus Persona ID and Replica ID must be configured.',
        });
      }

      const context = this.buildConversationContext(interview);
      const greeting = `Hello ${interview.application.candidate.firstName}. Welcome to your interview for the ${interview.application.job.title} position. Before we begin, could you please confirm your full name?`;
      const companyName = interview.application.company?.name || 'AI Recruiter Co';
      const callbackBaseUrl =
        this.configService.get<string>('tavus.callbackBaseUrl') || this.frontendUrl;
      const callbackSecret = this.configService.get<string>('tavus.callbackSecret') || '';
      const callbackUrl = callbackSecret
        ? `${callbackBaseUrl}/api/v1/ai-interviews/callback/${callbackSecret}`
        : `${callbackBaseUrl}/api/v1/ai-interviews/callback`;

      try {
        const tavusResponse = await this.tavusClient.createConversation({
          persona_id: personaId,
          replica_id: replicaId,
          conversation_name: `AI Interview - ${interview.application.job.title} - ${interview.application.candidate.firstName} ${interview.application.candidate.lastName}`,
          conversational_context: context,
          custom_greeting: greeting,
          callback_url: callbackUrl,
          require_auth: true,
          max_participants: 2,
          max_call_duration_seconds:
            this.configService.get<number>('tavus.maxCallDurationSeconds') || 600,
          participant_absent_timeout_seconds:
            this.configService.get<number>('tavus.participantAbsentTimeoutSeconds') || 120,
          participant_left_timeout_seconds:
            this.configService.get<number>('tavus.participantLeftTimeoutSeconds') || 60,
        });

        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            tavusConversationId: tavusResponse.conversation_id,
            tavusConversationUrl: tavusResponse.conversation_url,
            tavusMeetingToken: tavusResponse.meeting_token || null,
            tavusStatus: tavusResponse.status,
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
        // Tavus creation failed - revert to retryable state
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            status: AiInterviewStatus.READY,
            startedAt: null,
          },
        });
        this.logger.error(`Tavus conversation creation failed: ${error}`);
        throw new BadRequestException({
          code: 'TAVUS_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create interview session.',
        });
      }
    }

    // Mock provider
    const mockUrl = `${this.frontendUrl}/interview/session/mock`;
    await this.prisma.aiInterview.update({
      where: { id: interview.id },
      data: {
        tavusConversationId: `mock-${interview.id}`,
        tavusConversationUrl: mockUrl,
        tavusStatus: 'mock_created',
      },
    });

    return {
      conversationUrl: mockUrl,
      conversationId: `mock-${interview.id}`,
      provider: AiInterviewProvider.MOCK,
      status: AiInterviewStatus.IN_PROGRESS,
    };
  }

  async completeInterview(accessToken: string) {
    const payload = this.tokenService.verify(accessToken);
    const interviewId = payload.sub;

    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new BadRequestException({
        code: 'INTERVIEW_NOT_FOUND',
        message: 'Interview not found.',
      });
    }

    if (payload.cv !== interview.codeHash.slice(0, 16)) {
      throw new BadRequestException({
        code: 'CODE_VERSION_MISMATCH',
        message: 'Session expired due to code change.',
      });
    }

    // Cannot complete a cancelled interview
    if (interview.status === AiInterviewStatus.CANCELLED) {
      throw new BadRequestException({
        code: 'INTERVIEW_CANCELLED',
        message: 'This interview has been cancelled.',
      });
    }

    // For MOCK, completing is deliberate
    // For TAVUS, the callback marks completion; frontend exit does not force completion
    if (interview.provider === AiInterviewProvider.TAVUS) {
      this.logger.log(`Candidate left Tavus interview ${interviewId} before callback`);
      return { completed: false, message: 'Your interview session has ended.' };
    }

    // Mock deliberate completion
    if (interview.status === AiInterviewStatus.COMPLETED) {
      return { completed: true };
    }

    await this.prisma.aiInterview.update({
      where: { id: interviewId },
      data: {
        status: AiInterviewStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return { completed: true, message: 'Your interview has been submitted.' };
  }

  // ─── TAVUS CALLBACK ────────────────────────────────────────────────────────

  async handleTavusCallback(
    payload: {
      event: string;
      conversation_id: string;
      status?: string;
      payload?: Record<string, unknown>;
    },
    callbackSecret?: string,
  ) {
    // Verify callback secret if configured
    const expectedSecret = this.configService.get<string>('tavus.callbackSecret') || '';
    if (expectedSecret) {
      if (!callbackSecret) {
        this.logger.warn('Tavus callback rejected: missing secret');
        throw new BadRequestException({
          code: 'CALLBACK_SECRET_MISSING',
          message: 'Callback secret required',
        });
      }
      if (callbackSecret !== expectedSecret) {
        this.logger.warn('Tavus callback rejected: wrong secret');
        throw new BadRequestException({
          code: 'CALLBACK_SECRET_INVALID',
          message: 'Invalid callback secret',
        });
      }
    }

    const conversationId = payload.conversation_id;
    if (!conversationId) {
      this.logger.warn('Tavus callback missing conversation_id');
      return { received: true };
    }

    const interview = await this.prisma.aiInterview.findFirst({
      where: { tavusConversationId: conversationId },
    });

    if (!interview) {
      this.logger.warn(`Tavus callback for unknown conversation: ${conversationId}`);
      return { received: true };
    }

    switch (payload.event) {
      case 'system.replica_joined':
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: { tavusStatus: payload.status || 'replica_joined' },
        });
        break;

      case 'system.shutdown': {
        // Only update to COMPLETED if not already in a terminal state
        if (
          interview.status !== AiInterviewStatus.CANCELLED &&
          interview.status !== AiInterviewStatus.FAILED
        ) {
          await this.prisma.aiInterview.update({
            where: { id: interview.id },
            data: {
              tavusStatus: payload.status || 'shutdown',
              status: AiInterviewStatus.COMPLETED,
              completedAt: new Date(),
            },
          });
        }
        break;
      }

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
        this.logger.log(
          `Tavus unhandled event: ${payload.event} for conversation ${conversationId}`,
        );
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: { tavusStatus: payload.status || payload.event },
        });
    }

    return { received: true };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  private resolveProvider(requested?: AiInterviewProvider): AiInterviewProvider {
    if (requested === AiInterviewProvider.MOCK) {
      return AiInterviewProvider.MOCK;
    }
    if (requested === AiInterviewProvider.TAVUS) {
      if (!this.tavusEnabled) {
        throw new BadRequestException({
          code: 'TAVUS_DISABLED',
          message:
            'Tavus is not enabled. Configure TAVUS_ENABLED=true and provide TAVUS_API_KEY, TAVUS_PERSONA_ID, and TAVUS_REPLICA_ID.',
        });
      }
      const personaId = this.configService.get<string>('tavus.personaId') || '';
      const replicaId = this.configService.get<string>('tavus.replicaId') || '';
      if (!personaId || !replicaId) {
        throw new BadRequestException({
          code: 'TAVUS_CONFIG_MISSING',
          message: 'Tavus Persona ID and Replica ID must be configured when using TAVUS provider.',
        });
      }
      return AiInterviewProvider.TAVUS;
    }
    // Default to MOCK when Tavus is disabled
    return this.tavusEnabled ? AiInterviewProvider.TAVUS : AiInterviewProvider.MOCK;
  }

  private stripMeetingToken(interview: any) {
    if (!interview) return interview;
    const { tavusMeetingToken, ...rest } = interview;
    return rest;
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
        const skills =
          typeof candidate.skills === 'string' ? JSON.parse(candidate.skills) : candidate.skills;
        if (Array.isArray(skills) && skills.length > 0) {
          parts.push(`Skills: ${skills.join(', ')}`);
        }
      } catch {
        // skills field may not be parseable
      }
    }

    parts.push(
      'Interview objectives: Assess technical competence, problem-solving ability, communication skills, and cultural fit for the role.',
    );
    parts.push("Ask natural follow-up questions based on the candidate's responses.");
    parts.push('Remain professional and courteous throughout.');
    parts.push(
      'Avoid discriminatory or unrelated questions about age, gender, religion, marital status, disability, or appearance.',
    );
    parts.push('When the interview is complete, thank the candidate and end politely.');

    return parts.join('\n');
  }
}
