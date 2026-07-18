import { PartialType } from '@nestjs/swagger';
import { CreateJobTemplateDto } from './create-job-template.dto';

export class UpdateJobTemplateDto extends PartialType(CreateJobTemplateDto) {}
