import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
  ArrayMaxSize,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateSource } from '@prisma/client';
import { ScreeningAnswerInputDto } from './create-application.dto';

/**
 * Public careers application fields. Accepts BOTH classic JSON bodies and
 * multipart/form-data submissions (the careers site submits multipart so the
 * CV travels with the application in one atomic request). String-coercible
 * fields are transformed explicitly because multipart form fields are strings.
 */
export class PublicApplicationMultipartDto {
  @ApiProperty({ description: 'Idempotency key (UUID)' })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Current job title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentJobTitle?: string;

  @ApiPropertyOptional({ description: 'Years of professional experience' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalExperienceYears?: number;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkedInUrl?: string;

  @ApiPropertyOptional({ description: 'Portfolio / personal site URL' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  portfolioUrl?: string;

  @ApiPropertyOptional()
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
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consentConfirmed: boolean;

  @ApiPropertyOptional({
    description: 'Screening answers as a JSON array string in multipart requests',
    type: [ScreeningAnswerInputDto],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScreeningAnswerInputDto)
  screeningAnswers?: ScreeningAnswerInputDto[];

  /** Honeypot — humans never see this field; bots that fill it are ignored. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteUrl?: string;
}
