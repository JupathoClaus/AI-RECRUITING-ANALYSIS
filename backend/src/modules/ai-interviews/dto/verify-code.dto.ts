import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCodeDto {
  @ApiProperty({ description: 'Interview code (e.g. ABCD-EFGH)' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code: string;
}
