import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
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
import {
  VerifyCodeResponseDto,
  SessionResponseDto,
  StartInterviewResponseDto,
} from '../dto/public-response.dto';
import { AiInterviewCodeService } from './ai-interview-code.service';
import { AiInterviewTokenService } from './ai-interview-token.service';
import { TavusClientService } from './tavus-client.service';
import { EmailService } from '@modules/email/email.service';

interface TavusCallbackPayload {
  event: string;
  conversation_id: string;
  status?: string;
  properties?: Record<string, unknown>;
}

interface TranscriptTurn {
  role?: string;
  content?: string;
  timestamp?: number;
  seconds_from_start?: number;
  duration?: number;
}

@Injectable()
export class AiInterviewsService {
  private readonly logger = new Logger(AiInterviewsService.name);
  private readonly frontendUrl: string;
  private readonly backendUrl: string;
  private readonly tavusEnabled: boolean;
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
    this.backendUrl = this.configService.get<string>('app.backendUrl') || 'http://localhost:3000';
    this.tavusEnabled = this.configService.get<boolean>('tavus.enabled') || false;
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

  async findAll(companyId: string) {
    const interviews = await this.prisma.aiInterview.findMany({
      where: { companyId },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
            job: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return interviews.map((interview) => this.stripMeetingToken(interview));
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
      interview.status === AiInterviewStatus.CANCELLED ||
      interview.status === AiInterviewStatus.EXPIRED ||
      interview.status === AiInterviewStatus.FAILED ||
      interview.status === AiInterviewStatus.IN_PROGRESS
    ) {
      throw new BadRequestException({
        code: 'AI_INTERVIEW_TERMINAL',
        message: 'Cannot regenerate the code for this interview state',
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

    if (
      interview.status === AiInterviewStatus.COMPLETED ||
      interview.status === AiInterviewStatus.CANCELLED ||
      interview.status === AiInterviewStatus.EXPIRED ||
      interview.status === AiInterviewStatus.FAILED ||
      interview.status === AiInterviewStatus.IN_PROGRESS
    ) {
      throw new BadRequestException({
        code: 'AI_INTERVIEW_NOT_SENDABLE',
        message: 'This interview cannot be sent in its current state.',
      });
    }

    const candidate = interview.application.candidate;
    const job = interview.application.job;
    const companyName = interview.application.company?.name || 'AI Recruiter Co';

    // Resolve the raw code that will be shown in the email.
    // - When the recruiter UI still holds the raw code (creation/regeneration)
    //   it is verified against the stored hash before use.
    // - Otherwise (list page send after refresh) a fresh code is generated.
    //   The database only ever stores the hash; the raw code is never persisted.
    let emailCode: string;
    if (dto.rawCode) {
      const normalizedInput = this.codeService.normalize(dto.rawCode);
      if (!this.codesMatch(normalizedInput, interview.codeHash)) {
        throw new BadRequestException({
          code: 'CODE_MISMATCH',
          message: 'The interview code has changed. Please use the latest code.',
        });
      }
      emailCode = this.codeService.format(normalizedInput);
    } else {
      const rawCode = this.codeService.generate();
      emailCode = rawCode;
      await this.prisma.aiInterview.update({
        where: { id },
        data: {
          codeHash: this.codeService.hash(rawCode),
          codeDisplayHint: this.codeService.displayHint(rawCode),
        },
      });
    }

    // Derive email from the application's candidate record. No arbitrary recipient.
    const to = candidate.email;
    if (!to) {
      throw new BadRequestException({
        code: 'CANDIDATE_EMAIL_MISSING',
        message: 'The candidate does not have an email address.',
      });
    }

    const interviewLink = `${this.frontendUrl}/interview/access`;

    try {
      await this.emailService.sendAiInterviewInvitationEmail(
        to,
        `${candidate.firstName} ${candidate.lastName}`,
        job.title,
        companyName,
        interviewLink,
        emailCode,
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
        invitationEmail: to,
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

  // â”€â”€â”€ PUBLIC ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        message: 'This interview invitation has expired.',
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
        message: 'This interview invitation has expired.',
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

    if (interview.status === AiInterviewStatus.EXPIRED) {
      throw new BadRequestException({
        code: 'INTERVIEW_EXPIRED',
        message: 'This interview invitation has expired.',
      });
    }
    if (interview.status === AiInterviewStatus.COMPLETED) {
      throw new BadRequestException({
        code: 'INTERVIEW_COMPLETED',
        message: 'This interview has already been completed.',
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
    const accommodationRequested = dto.accommodationRequested === true;
    const accommodationNotes =
      accommodationRequested && dto.accommodationNotes
        ? dto.accommodationNotes.trim().slice(0, 1000)
        : null;

    // Try to atomically claim this interview for starting
    const updateResult = await this.prisma.aiInterview.updateMany({
      where: {
        id: interviewId,
        status: { in: eligibleStatuses },
      },
      data: {
        status: AiInterviewStatus.IN_PROGRESS,
        startedAt: now,
        consentAcceptedAt: now,
        accommodationRequested,
        accommodationNotes,
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
            candidate: {
              include: {
                skills: { include: { skill: true }, orderBy: { createdAt: 'asc' } },
                employmentRecords: { orderBy: { startDate: 'desc' }, take: 5 },
                educationRecords: { orderBy: { startDate: 'desc' }, take: 5 },
              },
            },
            job: {
              include: {
                skills: { include: { skill: true }, orderBy: { createdAt: 'asc' } },
              },
            },
            company: { select: { name: true } },
            resumeFiles: {
              where: { deletedAt: null },
              include: {
                textExtractions: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
              take: 1,
            },
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
      const greeting = `Hello ${interview.application.candidate.firstName}. Welcome to your AI interview for the ${interview.application.job.title} position at ${interview.application.company?.name || 'this company'}. I understand we have you interviewing for the ${interview.application.job.title} role. Before we begin, could you confirm your full name and tell me briefly why you are interested in this role?`;
      const callbackBaseUrl =
        this.configService.get<string>('tavus.callbackBaseUrl') || this.backendUrl;
      const callbackSecret = this.configService.get<string>('tavus.callbackSecret') || '';
      const callbackUrl = callbackSecret
        ? `${callbackBaseUrl}/api/v1/ai-interviews/callback/${callbackSecret}`
        : `${callbackBaseUrl}/api/v1/ai-interviews/callback`;
      const testMode = this.configService.get<boolean>('tavus.testMode') || false;

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
          test_mode: testMode,
          properties: {
            participant_absent_timeout:
              this.configService.get<number>('tavus.participantAbsentTimeoutSeconds') || 120,
            participant_left_timeout:
              this.configService.get<number>('tavus.participantLeftTimeoutSeconds') || 60,
          },
        });

        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            tavusConversationId: tavusResponse.conversation_id,
            tavusConversationUrl: tavusResponse.conversation_url,
            tavusMeetingToken: tavusResponse.meeting_token || null,
            tavusStatus: tavusResponse.status,
            transcriptStatus:
              interview.transcriptStatus === AiInterviewTranscriptStatus.NOT_REQUESTED
                ? AiInterviewTranscriptStatus.PENDING
                : interview.transcriptStatus,
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
            consentAcceptedAt: null,
          },
        });
        this.logger.error(`Tavus conversation creation failed: ${error}`);
        throw new BadRequestException({
          code: 'TAVUS_CREATION_FAILED',
          message: "We couldn't start your interview right now. Please try again shortly.",
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

  // â”€â”€â”€ TAVUS CALLBACK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async handleTavusCallback(
    payload: TavusCallbackPayload,
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
      if (!this.secretsMatch(callbackSecret, expectedSecret)) {
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

    const eventType = payload.event;
    const properties = payload.properties || {};

    switch (eventType) {
      case 'system.replica_joined':
      case 'system.pal_joined':
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: { tavusStatus: eventType },
        });
        break;

      case 'system.shutdown': {
        // Idempotent completion: move to COMPLETED at most once and never from
        // CANCELLED/FAILED. Duplicate shutdown callbacks are safe.
        const data: Prisma.AiInterviewUpdateInput = {
          tavusStatus: (properties.shutdown_reason as string) || 'shutdown',
        };
        if (
          interview.status !== AiInterviewStatus.CANCELLED &&
          interview.status !== AiInterviewStatus.FAILED
        ) {
          if (interview.status !== AiInterviewStatus.COMPLETED) {
            data.status = AiInterviewStatus.COMPLETED;
          }
          if (!interview.completedAt) {
            data.completedAt = new Date();
          }
          if (interview.transcriptStatus === AiInterviewTranscriptStatus.NOT_REQUESTED) {
            data.transcriptStatus = AiInterviewTranscriptStatus.PENDING;
          }
        }
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data,
        });
        // Pull transcript/recording artifacts from the provider when the
        // webhook did not already carry them.
        await this.syncTavusArtifacts(interview.id).catch((error) => {
          this.logger.warn(`Tavus artifact sync failed for ${interview.id}: ${error}`);
        });
        break;
      }

      case 'application.transcription_ready': {
        const transcriptTurns = this.sanitizeTranscript(properties.transcript);
        const transcriptUrl = (properties.transcript_url as string) || null;
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            transcriptStatus: AiInterviewTranscriptStatus.READY,
            transcriptUrl,
            transcript: transcriptTurns.length
              ? (transcriptTurns as unknown as Prisma.InputJsonValue)
              : undefined,
            tavusStatus: eventType,
          },
        });
        break;
      }

      case 'application.recording_ready': {
        const storageUri = (properties.storage_uri as string) || null;
        const s3Key = (properties.s3_key as string) || null;
        const recordingUrl = storageUri || s3Key;
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            recordingStatus: 'READY',
            recordingUrl,
            tavusStatus: eventType,
          },
        });
        break;
      }

      case 'application.recording_copy_failed':
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: {
            recordingStatus: 'FAILED',
            tavusStatus: eventType,
          },
        });
        break;

      default:
        this.logger.log(
          `Tavus unhandled event: ${eventType} for conversation ${conversationId}`,
        );
        await this.prisma.aiInterview.update({
          where: { id: interview.id },
          data: { tavusStatus: payload.status || eventType },
        });
    }

    return { received: true };
  }

  /**
   * Fetches the conversation (verbose) from Tavus and persists transcript and
   * recording artifacts that may have been missed by webhooks.
   */
  private async syncTavusArtifacts(interviewId: string): Promise<void> {
    const interview = await this.prisma.aiInterview.findUnique({
      where: { id: interviewId },
      select: { tavusConversationId: true, transcriptStatus: true, recordingStatus: true },
    });
    if (!interview?.tavusConversationId) return;
    if (!this.tavusClient.isEnabled) return;
    if (
      interview.transcriptStatus === AiInterviewTranscriptStatus.READY &&
      interview.recordingStatus === 'READY'
    ) {
      return;
    }

    const conversation = await this.tavusClient.getConversation(
      interview.tavusConversationId,
      true,
    );
    const events = conversation.events || [];

    const transcriptEvent = events.find((e) => e.event_type === 'application.transcription_ready');
    if (transcriptEvent && interview.transcriptStatus !== AiInterviewTranscriptStatus.READY) {
      const turns = this.sanitizeTranscript(transcriptEvent.properties?.transcript);
      if (turns.length) {
        await this.prisma.aiInterview.update({
          where: { id: interviewId },
          data: {
            transcriptStatus: AiInterviewTranscriptStatus.READY,
            transcript: turns as unknown as Prisma.InputJsonValue,
            transcriptUrl: (transcriptEvent.properties?.transcript_url as string) || null,
          },
        });
      }
    }

    const recordingEvent = events.find((e) => e.event_type === 'application.recording_ready');
    if (recordingEvent && interview.recordingStatus !== 'READY') {
      const props = recordingEvent.properties || {};
      await this.prisma.aiInterview.update({
        where: { id: interviewId },
        data: {
          recordingStatus: 'READY',
          recordingUrl: (props.storage_uri as string) || (props.s3_key as string) || null,
        },
      });
    }
  }

  private sanitizeTranscript(raw: unknown): TranscriptTurn[] {
    if (!Array.isArray(raw)) return [];
    const turns: TranscriptTurn[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const role = typeof obj.role === 'string' ? obj.role : undefined;
      const content = typeof obj.content === 'string' ? obj.content : undefined;
      if (!role && !content) continue;
      turns.push({
        role,
        content,
        timestamp: typeof obj.timestamp === 'number' ? obj.timestamp : undefined,
        seconds_from_start:
          typeof obj.seconds_from_start === 'number' ? obj.seconds_from_start : undefined,
        duration: typeof obj.duration === 'number' ? obj.duration : undefined,
      });
    }
    return turns;
  }

  private codesMatch(normalizedCode: string, storedHash: string): boolean {
    const inputHash = this.codeService.hash(normalizedCode);
    return this.secretsMatch(inputHash, storedHash);
  }

  private secretsMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const companyName = interview.application.company?.name || 'the company';

    const parts: string[] = [];

    // â”€â”€ Candidate professional context â”€â”€
    parts.push('CANDIDATE PROFILE');
    parts.push(`Name: ${candidate.firstName} ${candidate.lastName}`);
    if (candidate.currentJobTitle) parts.push(`Current job title: ${candidate.currentJobTitle}`);
    if (candidate.currentEmployer) parts.push(`Current employer: ${candidate.currentEmployer}`);
    if (candidate.totalExperienceYears) {
      parts.push(`Total experience: ${candidate.totalExperienceYears} years`);
    }
    if (candidate.summary) parts.push(`Summary: ${candidate.summary}`);

    const skillNames = (candidate.skills || [])
      .map((s: any) => s.skill?.displayName)
      .filter(Boolean);
    if (skillNames.length) parts.push(`Skills: ${skillNames.join(', ')}`);

    const employment = (candidate.employmentRecords || [])
      .slice(0, 3)
      .map((r: any) => {
        const years = r.startDate
          ? `${r.startDate.getFullYear()}${r.endDate ? `-${r.endDate.getFullYear()}` : '-present'}`
          : '';
        const desc = r.description ? ` - ${r.description.slice(0, 300)}` : '';
        return `${r.jobTitle} at ${r.companyName} (${years})${desc}`;
      })
      .filter(Boolean);
    if (employment.length) {
      parts.push('Recent experience:');
      parts.push(...employment.map((line: string) => `- ${line}`));
    }

    const education = (candidate.educationRecords || [])
      .slice(0, 2)
      .map((r: any) => `${r.fieldOfStudy || r.level} at ${r.institution}`)
      .filter(Boolean);
    if (education.length) {
      parts.push(`Education: ${education.join('; ')}`);
    }

    const resumeText = interview.application.resumeFiles?.[0]?.textExtractions?.[0]?.extractedText;
    if (resumeText && resumeText.length > 0) {
      parts.push(`Resume excerpt: ${resumeText.slice(0, 5000)}`);
    }

    // â”€â”€ Job context â”€â”€
    parts.push('');
    parts.push('JOB');
    parts.push(`Position: ${job.title}`);
    parts.push(`Company: ${companyName}`);
    if (job.description) parts.push(`Job description: ${job.description}`);
    if (job.responsibilities) parts.push(`Responsibilities: ${job.responsibilities}`);
    if (job.qualifications) parts.push(`Qualifications: ${job.qualifications}`);
    const jobSkills = (job.skills || [])
      .map((s: any) => s.skill?.displayName)
      .filter(Boolean);
    if (jobSkills.length) parts.push(`Required/preferred skills: ${jobSkills.join(', ')}`);
    if (job.experienceLevel) parts.push(`Experience level: ${job.experienceLevel}`);

    // â”€â”€ Interview setup â”€â”€
    parts.push('');
    parts.push('INTERVIEW SETUP');
    parts.push(`Language: ${interview.language || 'en'}`);
    parts.push(
      `Target duration: approximately ${interview.estimatedDurationMinutes || 30} minutes`,
    );
    if (interview.accommodationRequested && interview.accommodationNotes) {
      parts.push(
        `Accessibility note from the candidate: ${interview.accommodationNotes}. Accommodate this need without lowering the standard of the questions asked.`,
      );
    }

    // â”€â”€ Interviewer instructions â”€â”€
    parts.push('');
    parts.push('INTERVIEWER INSTRUCTIONS');
    parts.push(
      `Greet the candidate by their first name (${candidate.firstName}) and introduce yourself as an AI interviewer assistant conducting the interview on behalf of ${companyName}.`,
    );
    parts.push(
      `Confirm the role with the candidate: "We have you interviewing for the ${job.title} position. Is that correct?" Do not ask the candidate to identify the job from scratch.`,
    );
    parts.push(
      'Ask job-specific questions based on the role requirements and the candidate resume context above.',
    );
    parts.push(
      'Use the candidate resume, skills, and experience to ask meaningful, tailored follow-up questions.',
    );
    parts.push(
      'Keep the interview within the target duration and maintain a professional, respectful tone.',
    );
    parts.push(
      'Do not ask questions about age, gender, religion, marital status, disability, pregnancy, nationality, or appearance. Do not evaluate or comment on the candidate appearance or emotional state.',
    );
    parts.push(
      'The AI interviewer supports the recruitment process. Final recruitment decisions are made by the employer. Do not claim to make hiring decisions.',
    );
    parts.push(
      'When the interview is complete, thank the candidate, explain that their responses will be reviewed by the recruitment team, and close politely.',
    );

    return parts.join('\n');
  }
}
