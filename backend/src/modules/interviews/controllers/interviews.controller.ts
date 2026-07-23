import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { InterviewsService } from '../services/interviews.service';
import { InterviewReminderService } from '../services/interview-reminder.service';
import { NotificationService } from '@modules/notifications/services/notification.service';
import { CreateInterviewDto } from '../dto/create-interview.dto';
import {
  UpdateInterviewDto,
  RescheduleInterviewDto,
  CancelInterviewDto,
  CompleteInterviewDto,
  StartInterviewDto,
} from '../dto/update-interview.dto';
import { InterviewQueryDto } from '../dto/interview-query.dto';
import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsString,
  IsUUID,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InterviewParticipantRole, InterviewResult } from '@prisma/client';

class AddParticipantDto {
  @ApiProperty() @IsUUID() membershipId: string;
  @ApiProperty({ enum: InterviewParticipantRole })
  @IsEnum(InterviewParticipantRole)
  role: InterviewParticipantRole;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class ConfirmInterviewDto {
  @ApiProperty({ description: 'Optimistic concurrency version' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

class RecordResultDto {
  @ApiProperty({ enum: InterviewResult }) @IsEnum(InterviewResult) result: InterviewResult;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) resultNotes?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
}

@ApiTags('Interviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('interviews')
export class InterviewsController {
  constructor(
    private readonly interviewsService: InterviewsService,
    private readonly reminderService: InterviewReminderService,
    private readonly notificationService: NotificationService,
  ) {}

  // FIX 2: interviews.create
  @Post()
  @RequirePermissions('interviews.create')
  @ApiOperation({ summary: 'Schedule a new interview' })
  @ApiResponse({ status: 201, description: 'Interview scheduled' })
  async create(@Body() dto: CreateInterviewDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const interview = await this.interviewsService.create(
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
    // FIX 1: Schedule delayed reminders
    this.reminderService
      .scheduleReminders({
        interviewId: interview.id,
        scheduledAt: new Date((interview as any).scheduledAt),
        timezone: dto.timezone,
      })
      .catch(() => {});
    // Queue notification (non-blocking)
    this.notificationService
      .scheduleInterviewNotification({
        interviewId: interview.id,
        companyId: user.activeCompanyId!,
        applicationId: dto.applicationId,
        type: 'SCHEDULED',
        scheduledAt: dto.scheduledAt,
        timezone: dto.timezone,
      })
      .catch(() => {});
    return interview;
  }

  // FIX 2: interviews.read
  @Get()
  @RequirePermissions('interviews.read')
  @ApiOperation({ summary: 'List interviews (company-scoped)' })
  async findAll(@Query() query: InterviewQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.interviewsService.findAll(query, user.activeCompanyId!);
  }

  // FIX 2: interviews.read
  @Get(':interviewId')
  @RequirePermissions('interviews.read')
  @ApiOperation({ summary: 'Get interview by ID' })
  async findOne(@Param('interviewId') id: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.interviewsService.findById(id, user.activeCompanyId!);
  }

  // FIX 2: interviews.update
  @Patch(':interviewId')
  @RequirePermissions('interviews.update')
  @ApiOperation({ summary: 'Update interview details (non-workflow fields)' })
  async update(
    @Param('interviewId') id: string,
    @Body() dto: UpdateInterviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.update(
      id,
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
  }

  // FIX 2: interviews.reschedule
  @Post(':interviewId/reschedule')
  @RequirePermissions('interviews.reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reschedule interview to a new time' })
  async reschedule(
    @Param('interviewId') id: string,
    @Body() dto: RescheduleInterviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const result = await this.interviewsService.reschedule(
      id,
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
    this.reminderService
      .rescheduleReminders({
        interviewId: id,
        scheduledAt: new Date(dto.scheduledAt),
        timezone: dto.timezone ?? 'UTC',
      })
      .catch(() => {});
    this.notificationService
      .scheduleInterviewNotification({
        interviewId: id,
        companyId: user.activeCompanyId!,
        applicationId: (result as any).applicationId ?? '',
        type: 'RESCHEDULED',
        scheduledAt: dto.scheduledAt,
      })
      .catch(() => {});
    return result;
  }

  // FIX 2: interviews.cancel
  @Post(':interviewId/cancel')
  @RequirePermissions('interviews.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel interview' })
  async cancel(
    @Param('interviewId') id: string,
    @Body() dto: CancelInterviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const result = await this.interviewsService.cancel(
      id,
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
    this.reminderService.cancelReminders(id).catch(() => {});
    this.notificationService
      .scheduleInterviewNotification({
        interviewId: id,
        companyId: user.activeCompanyId!,
        applicationId: (result as any).applicationId ?? '',
        type: 'CANCELLED',
        reason: dto.reason,
      })
      .catch(() => {});
    return result;
  }

  // FIX 2: interviews.complete
  @Post(':interviewId/complete')
  @RequirePermissions('interviews.complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark interview as completed' })
  async complete(
    @Param('interviewId') id: string,
    @Body() dto: CompleteInterviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const result = await this.interviewsService.complete(
      id,
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
    this.notificationService
      .scheduleInterviewNotification({
        interviewId: id,
        companyId: user.activeCompanyId!,
        applicationId: (result as any).applicationId ?? '',
        type: 'COMPLETED',
      })
      .catch(() => {});
    return result;
  }

  // FIX 6: interviews.confirm — SCHEDULED → CONFIRMED
  @Post(':interviewId/confirm')
  @RequirePermissions('interviews.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm interview (transition SCHEDULED → CONFIRMED)' })
  async confirm(
    @Param('interviewId') id: string,
    @Body() dto: ConfirmInterviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.confirm(
      id,
      dto.expectedVersion,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
  }

  // CONFIRMED → IN_PROGRESS
  @Post(':interviewId/start')
  @RequirePermissions('interviews.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start interview (transition CONFIRMED → IN_PROGRESS)' })
  async start(
    @Param('interviewId') id: string,
    @Body() dto: StartInterviewDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.start(
      id,
      dto,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
  }

  // FIX 2 + FIX 8: interviews.record_result
  @Post(':interviewId/result')
  @RequirePermissions('interviews.record_result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record interview result and get suggested application action' })
  async recordResult(
    @Param('interviewId') id: string,
    @Body() dto: RecordResultDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.recordResult(
      id,
      dto.result,
      dto.resultNotes,
      dto.expectedVersion,
      user.activeCompanyId!,
      user.userId,
      user.membershipId!,
    );
  }

  // FIX 2: interviews.manage_participants
  @Post(':interviewId/participants')
  @RequirePermissions('interviews.manage_participants')
  @ApiOperation({ summary: 'Add participant to interview' })
  async addParticipant(
    @Param('interviewId') id: string,
    @Body() dto: AddParticipantDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.addParticipant(
      id,
      user.activeCompanyId!,
      dto.membershipId,
      dto.role,
      dto.isRequired ?? true,
      dto.notes,
      user.membershipId!,
      user.userId,
    );
  }

  // FIX 2: interviews.manage_participants
  @Delete(':interviewId/participants/:participantId')
  @RequirePermissions('interviews.manage_participants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove participant from interview' })
  async removeParticipant(
    @Param('interviewId') id: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.removeParticipant(
      id,
      participantId,
      user.activeCompanyId!,
      user.membershipId!,
      user.userId,
    );
  }
}
