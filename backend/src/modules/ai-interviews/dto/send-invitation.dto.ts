import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SendInvitationDto {
  @ApiPropertyOptional({ description: 'Raw interview code to verify before sending' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rawCode?: string;

  @ApiPropertyOptional({ description: 'Optional recruiter note for email' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
