import {
  Controller,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import { FilesService } from '../services/files.service';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

interface PublicResumeFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('Public Applications')
@Controller('public')
export class PublicFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('applications/:publicReference/resume')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES } }))
  @ApiOperation({ summary: 'Upload or replace a resume for a public application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF or DOCX, max 10MB' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Resume accepted' })
  async uploadResume(
    @Param('publicReference') publicReference: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: MAX_RESUME_BYTES })],
      }),
    )
    file: PublicResumeFile,
  ) {
    return this.filesService.uploadPublicResume(
      publicReference,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }
}
