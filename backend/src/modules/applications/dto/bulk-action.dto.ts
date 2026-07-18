import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationAssignmentType } from '@prisma/client';

export enum BulkActionType {
  ASSIGN = 'ASSIGN',
  MOVE_STAGE = 'MOVE_STAGE',
  SHORTLIST = 'SHORTLIST',
  REJECT = 'REJECT',
  HOLD = 'HOLD',
  ADD_TAG = 'ADD_TAG',
  REMOVE_TAG = 'REMOVE_TAG',
  ARCHIVE = 'ARCHIVE',
}

export class BulkActionDto {
  @ApiProperty({ enum: BulkActionType })
  @IsEnum(BulkActionType)
  action: BulkActionType;

  @ApiProperty({ description: 'Application IDs (max 100)', isArray: true })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  applicationIds: string[];

  @ApiPropertyOptional({ description: 'Target stage ID (for MOVE_STAGE)' })
  @IsOptional()
  @IsUUID()
  toStageId?: string;

  @ApiPropertyOptional({ description: 'Membership ID (for ASSIGN)' })
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiPropertyOptional({ enum: ApplicationAssignmentType })
  @IsOptional()
  @IsEnum(ApplicationAssignmentType)
  assignmentType?: ApplicationAssignmentType;

  @ApiPropertyOptional({ description: 'Tag ID (for ADD_TAG / REMOVE_TAG)' })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({ description: 'Reason code (required for REJECT)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reasonCode?: string;

  @ApiPropertyOptional({ description: 'Notes or explanation' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
