/**
 * Public candidate confirmation endpoints — no auth required.
 * FIX 7: Secure signed token, single-use, expiring, interview+participant specific.
 * Never exposes private recruiter notes or internal data.
 */
import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '@database/prisma/prisma.service';
import { InterviewTokenService } from '../services/interview-token.service';
import { InterviewParticipantStatus, InterviewHistoryEventType } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

class ConfirmDeclineDto {
  @ApiPropertyOptional({ description: 'Optional message from candidate' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

class RequestRescheduleDto {
  @ApiPropertyOptional({ description: 'Reason or preferred times' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

@ApiTags('Interview Confirmation (Public)')
@Controller('public/interview-confirmation')
export class InterviewConfirmationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: InterviewTokenService,
  ) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Get safe interview details via confirmation token' })
  @ApiResponse({ status: 200, description: 'Safe interview details for candidate' })
  async getDetails(@Param('token') token: string) {
    const { interviewId, participantId } = this.tokenService.validateToken(token);
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, deletedAt: null },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        scheduledAt: true,
        durationMinutes: true,
        timezone: true,
        location: true,
        meetingProvider: true,
        language: true,
        notes: true, // instructions for candidate — NOT privateNotes
        job: { select: { id: true, title: true } },
      },
    });
    if (!interview) throw new NotFoundException('Interview not found');

    const participant = await this.prisma.interviewParticipant.findFirst({
      where: { id: participantId, interviewId },
    });
    if (!participant) throw new NotFoundException('Participant not found');

    return {
      interview: {
        ...interview,
        privateNotes: undefined, // Explicitly never expose
      },
      participant: { id: participant.id, role: participant.role, status: participant.status },
    };
  }

  @Post(':token/confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Candidate confirms interview attendance' })
  async confirm(@Param('token') token: string, @Body() dto: ConfirmDeclineDto) {
    const { interviewId, participantId } = this.tokenService.validateToken(token);
    return this.updateParticipantStatus(
      interviewId,
      participantId,
      InterviewParticipantStatus.CONFIRMED,
      dto.message,
      InterviewHistoryEventType.PARTICIPANT_STATUS_CHANGED,
      'Candidate confirmed attendance',
    );
  }

  @Post(':token/decline')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Candidate declines interview' })
  async decline(@Param('token') token: string, @Body() dto: ConfirmDeclineDto) {
    const { interviewId, participantId } = this.tokenService.validateToken(token);
    return this.updateParticipantStatus(
      interviewId,
      participantId,
      InterviewParticipantStatus.DECLINED,
      dto.message,
      InterviewHistoryEventType.PARTICIPANT_STATUS_CHANGED,
      'Candidate declined interview',
    );
  }

  @Post(':token/request-reschedule')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Candidate requests interview reschedule' })
  async requestReschedule(@Param('token') token: string, @Body() dto: RequestRescheduleDto) {
    const { interviewId, participantId } = this.tokenService.validateToken(token);
    const participant = await this.prisma.interviewParticipant.findFirst({
      where: { id: participantId, interviewId },
    });
    if (!participant) throw new NotFoundException('Participant not found');

    await this.prisma.interviewHistory.create({
      data: {
        interviewId,
        eventType: InterviewHistoryEventType.PARTICIPANT_STATUS_CHANGED,
        description: 'Candidate requested reschedule',
        metadata: { reason: dto.reason ?? null, requestedByParticipant: participantId } as any,
      },
    });
    // Safe response — no internal details
    return { requested: true, message: 'Reschedule request sent. The recruiter will contact you.' };
  }

  private async updateParticipantStatus(
    interviewId: string,
    participantId: string,
    status: InterviewParticipantStatus,
    message: string | undefined,
    eventType: InterviewHistoryEventType,
    description: string,
  ) {
    const participant = await this.prisma.interviewParticipant.findFirst({
      where: { id: participantId, interviewId },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    if (participant.respondedAt) {
      throw new BadRequestException({
        code: 'PARTICIPANT_ALREADY_RESPONDED',
        message: 'Participant has already responded to this interview',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.interviewParticipant.update({
        where: { id: participantId },
        data: { status, respondedAt: new Date() },
      });
      await tx.interviewHistory.create({
        data: {
          interviewId,
          eventType,
          description,
          metadata: { participantId, status, message: message ?? null } as any,
        },
      });
    });
    return { status, message: 'Response recorded.' };
  }
}
