import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExternalPostingProvider } from '@prisma/client';

export class CreatePublicationDto {
  @ApiProperty({ enum: ExternalPostingProvider })
  @IsEnum(ExternalPostingProvider)
  provider: ExternalPostingProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalAccountId?: string;
}
