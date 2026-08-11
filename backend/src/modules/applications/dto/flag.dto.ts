import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationFlagType, ApplicationFlagSeverity, ApplicationActorType } from '@prisma/client';

export class CreateFlagDto {
  @ApiProperty({ enum: ApplicationFlagType })
  @IsEnum(ApplicationFlagType)
  type: ApplicationFlagType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ApplicationFlagSeverity, default: ApplicationFlagSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(ApplicationFlagSeverity)
  severity?: ApplicationFlagSeverity;
}

export class ResolveFlagDto {
  @ApiPropertyOptional({ description: 'Resolution notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNotes?: string;
}
