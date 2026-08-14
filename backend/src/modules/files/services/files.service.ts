import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  FileCategory,
  FileStatus,
  ApplicationAuditEventType,
  ApplicationActorType,
} from '@prisma/client';
import { LocalStorageProvider } from '../providers/local-storage.provider';
import { ApplicationAuditService } from '../../applications/services/application-audit.service';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const PDF_HEADER = Buffer.from('%PDF');
const DOCX_ZIP_MARKER = Buffer.from('PK');
const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES: Record<string, { extension: string; signature: number[] }> = {
  'image/png': { extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly maxFileSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageProvider,
    private readonly configService: ConfigService,
    private readonly auditService: ApplicationAuditService,
  ) {
    this.maxFileSize = configService.get<number>('app.maxFileSize') || 10 * 1024 * 1024;
  }

  async uploadResume(
    applicationId: string,
    companyId: string,
    userId: string | null,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    actorType: ApplicationActorType = ApplicationActorType.RECRUITER,
  ) {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('FILE_EMPTY');
    }

    if (buffer.length > this.maxFileSize) {
      throw new BadRequestException('FILE_TOO_LARGE');
    }

    const extension = this.validateAndGetExtension(originalName, mimeType, buffer);

    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app) {
      throw new NotFoundException('APPLICATION_NOT_FOUND');
    }

    const isReplacement = await this.hasExistingResume(applicationId);
    const storedName = this.storage.generateStoredName(extension);
    const { storageKey, checksumSha256, sizeBytes } = await this.storage.put(
      companyId,
      storedName,
      buffer,
      mimeType,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.storedFile.updateMany({
          where: { applicationId, category: 'RESUME', status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' as FileStatus },
        });

        await tx.storedFile.create({
          data: {
            companyId,
            applicationId,
            uploadedByUserId: userId,
            storageKey,
            originalName: this.sanitizeFilename(originalName),
            storedName,
            extension,
            mimeType,
            sizeBytes,
            checksumSha256,
            category: 'RESUME',
            status: 'ACTIVE',
          },
        });
      });
    } catch (e) {
      await this.storage.delete(storageKey).catch(() => {});
      throw e;
    }

    const file = await this.prisma.storedFile.findUnique({
      where: { storageKey },
    });

    const auditEventType = isReplacement
      ? ApplicationAuditEventType.APPLICATION_RESUME_REPLACED
      : ApplicationAuditEventType.APPLICATION_RESUME_UPLOADED;
    await this.auditService.record({
      companyId,
      applicationId,
      eventType: auditEventType,
      actorType,
      entityType: 'StoredFile',
      entityId: file!.id,
      description: isReplacement ? 'Resume replaced' : 'Resume uploaded',
      metadata: {
        fileName: this.sanitizeFilename(originalName),
        fileSize: sizeBytes,
        mimeType,
      },
      actorUserId: userId ?? undefined,
    });

    return file;
  }

  async uploadCompanyLogo(
    companyId: string,
    userId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ) {
    if (!buffer?.length) throw new BadRequestException('FILE_EMPTY');
    if (buffer.length > MAX_LOGO_SIZE) throw new BadRequestException('FILE_TOO_LARGE');

    const type = LOGO_TYPES[mimeType];
    if (!type) throw new BadRequestException('FILE_TYPE_NOT_ALLOWED');
    if (!type.signature.every((byte, index) => buffer[index] === byte)) {
      throw new BadRequestException('FILE_SIGNATURE_MISMATCH');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('COMPANY_NOT_FOUND');

    const storedName = this.storage.generateStoredName(type.extension);
    const { storageKey, checksumSha256, sizeBytes } = await this.storage.put(
      companyId,
      storedName,
      buffer,
      mimeType,
    );

    try {
      const file = await this.prisma.$transaction(async (tx) => {
        await tx.storedFile.updateMany({
          where: { companyId, category: FileCategory.COMPANY_LOGO, status: FileStatus.ACTIVE },
          data: { status: FileStatus.SUPERSEDED },
        });
        const created = await tx.storedFile.create({
          data: {
            companyId,
            uploadedByUserId: userId,
            storageKey,
            originalName: this.sanitizeFilename(originalName),
            storedName,
            extension: type.extension,
            mimeType,
            sizeBytes,
            checksumSha256,
            category: FileCategory.COMPANY_LOGO,
            status: FileStatus.ACTIVE,
          },
        });
        await tx.company.update({
          where: { id: companyId },
          data: { logoFileId: created.id, logoUrl: `/api/v1/company/logo` },
        });
        return created;
      });
      return file;
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async downloadCompanyLogo(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { logoFileId: true },
    });
    if (!company?.logoFileId) throw new NotFoundException('COMPANY_LOGO_NOT_FOUND');

    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: company.logoFileId,
        companyId,
        category: FileCategory.COMPANY_LOGO,
        status: FileStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (!file) throw new NotFoundException('COMPANY_LOGO_NOT_FOUND');

    const stored = await this.storage.get(file.storageKey);
    return { ...stored, mimeType: file.mimeType, originalName: file.originalName };
  }

  async uploadPublicResume(
    publicReference: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ) {
    if (!/^[a-f0-9]{32}$/i.test(publicReference)) {
      throw new NotFoundException('APPLICATION_NOT_FOUND');
    }
    const application = await this.prisma.application.findFirst({
      where: { publicReference, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!application) {
      throw new NotFoundException('APPLICATION_NOT_FOUND');
    }

    const file = await this.uploadResume(
      application.id,
      application.companyId,
      null,
      buffer,
      originalName,
      mimeType,
      ApplicationActorType.CANDIDATE,
    );

    return {
      uploaded: true,
      fileName: file!.originalName,
      sizeBytes: file!.sizeBytes,
    };
  }

  async downloadFile(fileId: string, companyId: string, userId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt) {
      throw new NotFoundException('FILE_NOT_FOUND');
    }

    if (file.companyId !== companyId) {
      throw new NotFoundException('FILE_NOT_FOUND');
    }

    if (file.status === 'DELETED') {
      throw new NotFoundException('FILE_NOT_FOUND');
    }

    if (file.category === 'RESUME' && file.applicationId) {
      const app = await this.prisma.application.findFirst({
        where: { id: file.applicationId, companyId, deletedAt: null },
      });
      if (!app) {
        throw new NotFoundException('FILE_NOT_FOUND');
      }
    }

    const { stream, mimeType, sizeBytes } = await this.storage.get(file.storageKey);

    return {
      stream,
      mimeType,
      sizeBytes,
      originalName: file.originalName,
      fileId: file.id,
    };
  }

  async archiveFile(fileId: string, companyId: string, userId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt) {
      throw new NotFoundException('FILE_NOT_FOUND');
    }

    if (file.companyId !== companyId) {
      throw new NotFoundException('FILE_NOT_FOUND');
    }

    await this.prisma.storedFile.update({
      where: { id: fileId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    if (file.applicationId) {
      await this.auditService.record({
        companyId,
        applicationId: file.applicationId,
        eventType: ApplicationAuditEventType.APPLICATION_RESUME_DELETED,
        actorType: ApplicationActorType.RECRUITER,
        entityType: 'StoredFile',
        entityId: fileId,
        description: 'Resume deleted',
        metadata: { fileName: file.originalName },
        actorUserId: userId,
      });
    }

    return { archived: true };
  }

  async getApplicationResume(applicationId: string, companyId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, companyId, deletedAt: null },
    });
    if (!app) {
      throw new NotFoundException('APPLICATION_NOT_FOUND');
    }

    const file = await this.prisma.storedFile.findFirst({
      where: { applicationId, category: 'RESUME', status: 'ACTIVE', deletedAt: null },
    });

    return file;
  }

  private validateAndGetExtension(originalName: string, mimeType: string, buffer: Buffer): string {
    const dotIdx = originalName.lastIndexOf('.');
    if (dotIdx === -1 || dotIdx === originalName.length - 1) {
      throw new BadRequestException('FILE_EXTENSION_MISSING');
    }

    const extension = originalName.slice(dotIdx + 1).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('FILE_EXTENSION_NOT_ALLOWED');
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('FILE_TYPE_NOT_ALLOWED');
    }

    if (buffer.length < 4) {
      throw new BadRequestException('FILE_TOO_SMALL');
    }

    if (extension === 'pdf') {
      if (buffer.slice(0, 4).compare(PDF_HEADER) !== 0) {
        throw new BadRequestException('FILE_SIGNATURE_MISMATCH');
      }
    } else if (extension === 'docx') {
      if (buffer.slice(0, 2).compare(DOCX_ZIP_MARKER) !== 0) {
        throw new BadRequestException('FILE_SIGNATURE_MISMATCH');
      }
    }

    return extension;
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[/\\<>:"|?*\x00-\x1f]/g, '_').substring(0, 255);
  }

  private async hasExistingResume(applicationId: string): Promise<boolean> {
    const existing = await this.prisma.storedFile.findFirst({
      where: { applicationId, category: 'RESUME', status: 'ACTIVE', deletedAt: null },
    });
    return !!existing;
  }
}
