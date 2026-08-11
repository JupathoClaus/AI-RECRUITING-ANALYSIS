import { IsString, IsEnum, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateNoteVisibility } from '@prisma/client';

export class CreateNoteDto {
  @ApiProperty({ description: 'Note content' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({ enum: CandidateNoteVisibility, default: CandidateNoteVisibility.PRIVATE })
  @IsOptional()
  @IsEnum(CandidateNoteVisibility)
  visibility?: CandidateNoteVisibility = CandidateNoteVisibility.PRIVATE;
}

export class UpdateNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content?: string;

  @ApiPropertyOptional({ enum: CandidateNoteVisibility })
  @IsOptional()
  @IsEnum(CandidateNoteVisibility)
  visibility?: CandidateNoteVisibility;
}
