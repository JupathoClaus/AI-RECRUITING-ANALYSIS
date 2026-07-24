import { IsOptional, IsBoolean, IsInt, Min, Max, IsIn, IsEnum, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { NotificationType } from '@prisma/client';

const CATEGORIES = ['system', 'application', 'interview', 'invitation'] as const;

export class NotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(CATEGORIES)
  category?: typeof CATEGORIES[number];
}
