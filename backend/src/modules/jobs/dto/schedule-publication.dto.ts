import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SchedulePublicationDto {
  @ApiProperty()
  @IsDateString()
  scheduledAt: string;
}
