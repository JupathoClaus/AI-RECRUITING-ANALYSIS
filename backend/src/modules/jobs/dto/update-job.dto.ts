import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateJobDto } from './create-job.dto';

export class UpdateJobDto extends PartialType(CreateJobDto) {
  @ApiPropertyOptional({ description: 'Expected version for optimistic concurrency control' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
