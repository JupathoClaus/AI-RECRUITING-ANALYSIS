import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitApprovalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  approverMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}
