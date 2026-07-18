import {
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationDecisionType, ApplicationActorType } from '@prisma/client';

export class CreateDecisionDto {
  @ApiProperty({ enum: ApplicationDecisionType })
  @IsEnum(ApplicationDecisionType)
  type: ApplicationDecisionType;

  @ApiProperty({ description: 'Required explanation for the decision' })
  @IsString()
  @MaxLength(5000)
  explanation: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reasonCode?: string;

  @ApiPropertyOptional({ description: 'Decision score (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ description: 'Is this a final decision' })
  @IsOptional()
  @IsBoolean()
  finalDecision?: boolean;
}

export class OverrideDecisionDto {
  @ApiProperty({ enum: ApplicationDecisionType })
  @IsEnum(ApplicationDecisionType)
  type: ApplicationDecisionType;

  @ApiProperty({ description: 'Required explanation for the override' })
  @IsString()
  @MaxLength(5000)
  explanation: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reasonCode?: string;
}
