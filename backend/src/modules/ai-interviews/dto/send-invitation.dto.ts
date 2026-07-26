import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendInvitationDto {
  @ApiProperty({ description: 'Candidate email address' })
  @IsEmail()
  to: string;

  @ApiPropertyOptional({ description: 'Optional recruiter note for email' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
