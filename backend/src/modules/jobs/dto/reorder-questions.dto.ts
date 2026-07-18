import { IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderQuestionsDto {
  @ApiProperty({ type: [Object], example: [{ id: 'uuid', sortOrder: 1 }] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  items: { id: string; sortOrder: number }[];
}
