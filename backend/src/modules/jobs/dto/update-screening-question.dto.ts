import { PartialType } from '@nestjs/swagger';
import { CreateScreeningQuestionDto } from './create-screening-question.dto';

export class UpdateScreeningQuestionDto extends PartialType(CreateScreeningQuestionDto) {}
