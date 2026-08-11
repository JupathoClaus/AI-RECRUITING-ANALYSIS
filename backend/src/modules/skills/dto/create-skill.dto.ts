import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SkillType } from '@prisma/client';

export class CreateSkillDto {
  @ApiProperty({ example: 'TypeScript' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: SkillType, example: SkillType.TECHNICAL })
  @IsEnum(SkillType)
  type: SkillType;

  @ApiPropertyOptional({ example: 'TypeScript programming language' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
