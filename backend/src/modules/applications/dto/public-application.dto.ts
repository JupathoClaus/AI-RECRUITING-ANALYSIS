import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsArray,
  MaxLength,
  MinLength,
  IsUUID,
  ValidateNested,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateSource } from '@prisma/client';
import { ScreeningAnswerInputDto } from './create-application.dto';

export class PublicApplicationDto {
  @ApiProperty({ description: 'Idempotency key (UUID)' })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ description: 'First name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Cover letter' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @ApiPropertyOptional({ description: 'Preferred interview language (ISO 639-1)' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, { message: 'Must be a 2-letter language code' })
  preferredLanguage?: string;

  @ApiPropertyOptional({ enum: CandidateSource })
  @IsOptional()
  @IsEnum(CandidateSource)
  source?: CandidateSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceDetail?: string;

  @ApiProperty({ description: 'Consent confirmed' })
  @IsBoolean()
  consentConfirmed: boolean;

  @ApiPropertyOptional({ type: [ScreeningAnswerInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScreeningAnswerInputDto)
  screeningAnswers?: ScreeningAnswerInputDto[];
}
