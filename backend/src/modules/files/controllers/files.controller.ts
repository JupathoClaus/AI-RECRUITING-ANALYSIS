import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { FilesService } from '../services/files.service';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class FilesController {
  private readonly logger = new Logger(FilesController.name);
  private readonly maxFileSize: number;

  constructor(private readonly filesService: FilesService) {
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
  }

  @Post('applications/:applicationId/resume')
  @RequirePermissions('applications.update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload resume for an application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Resume file (PDF or DOCX, max 10MB)',
        },
      },
    },
  })
  async uploadResume(
    @Param('applicationId') applicationId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10485760 }),
        ],
        fileIsRequired: true,
      }),
    )
    file: UploadedFile,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    if (!file) {
      throw new Error('FILE_REQUIRED');
    }
    const result = await this.filesService.uploadResume(
      applicationId,
      user.activeCompanyId!,
      user.userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return result;
  }

  @Get('files/:fileId/download')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Download a file by ID' })
  async downloadFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res() res: Response,
  ) {
    const result = await this.filesService.downloadFile(
      fileId,
      user.activeCompanyId!,
      user.userId,
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.originalName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', result.sizeBytes);
    result.stream.pipe(res);
  }

  @Get('applications/:applicationId/resume')
  @RequirePermissions('applications.read')
  @ApiOperation({ summary: 'Get current resume metadata for an application' })
  async getApplicationResume(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const file = await this.filesService.getApplicationResume(
      applicationId,
      user.activeCompanyId!,
    );
    return file;
  }

  @Delete('files/:fileId')
  @RequirePermissions('applications.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a file (soft delete)' })
  async archiveFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.filesService.archiveFile(fileId, user.activeCompanyId!, user.userId);
  }
}
