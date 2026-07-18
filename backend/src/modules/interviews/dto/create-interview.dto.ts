import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
  IsBoolean,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewType, InterviewParticipantRole } from '@prisma/client';

export class ParticipantInputDto {
  @ApiProperty({ description: 'Membership ID of the participant' })
  @IsUUID()
  membershipId: string;

  @ApiProperty({ enum: InterviewParticipantRole })
  @IsEnum(InterviewParticipantRole)
  role: InterviewParticipantRole;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateInterviewDto {
  @ApiProperty({ description: 'Application ID' })
  @IsUUID()
  applicationId: string;

  @ApiProperty({ enum: InterviewType })
  @IsEnum(InterviewType)
  type: InterviewType;

  @ApiProperty({ description: 'Interview title' })
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Scheduled start time (ISO 8601)' })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ description: 'Duration in minutes', minimum: 5, maximum: 480 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @ApiProperty({ description: 'IANA timezone', example: 'Africa/Kampala' })
  @IsString()
  @MaxLength(100)
  timezone: string;

  @ApiPropertyOptional({ description: 'Pipeline stage ID' })
  @IsOptional()
  @IsUUID()
  jobPipelineStageId?: string;

  @ApiPropertyOptional({ description: 'Physical location or room name' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiPropertyOptional({ description: 'Meeting provider (Zoom, Meet, Teams, etc.)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  meetingProvider?: string;

  @ApiPropertyOptional({ description: 'Meeting URL' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meetingLink?: string;

  @ApiPropertyOptional({ description: 'Meeting ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  meetingId?: string;

  @ApiPropertyOptional({ description: 'Instructions for participants' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Private recruiter notes (not shared)' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  privateNotes?: string;

  @ApiPropertyOptional({ description: 'Interview language', default: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ type: [ParticipantInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ParticipantInputDto)
  participants?: ParticipantInputDto[];
}
