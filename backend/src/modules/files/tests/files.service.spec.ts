import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { LocalStorageProvider } from '../providers/local-storage.provider';
import { ApplicationAuditService } from '../../applications/services/application-audit.service';
import { FilesService } from '../services/files.service';

describe('FilesService', () => {
  let service: FilesService;
  let prisma: any;
  let storage: any;
  let audit: any;

  const mockCompanyId = 'company-1';
  const mockUserId = 'user-1';
  const mockApplicationId = 'app-1';

  const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
  const docxBuffer = Buffer.from('PK\x03\x04 fake docx content');
  const textBuffer = Buffer.from('plain text not allowed');

  beforeEach(async () => {
    prisma = {
      company: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      application: {
        findFirst: jest.fn(),
      },
      storedFile: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      resumeTextExtraction: {
        create: jest.fn().mockResolvedValue({ id: 'ex-new' }),
      },
      extractionDispatch: {
        create: jest.fn().mockResolvedValue({ id: 'dispatch-new' }),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    storage = {
      generateStoredName: jest.fn().mockReturnValue('uuid-abc.pdf'),
      put: jest.fn().mockResolvedValue({
        storageKey: 'company-1/uuid-abc.pdf',
        checksumSha256: 'abc123',
        sizeBytes: 100,
      }),
      get: jest
        .fn()
        .mockResolvedValue({ stream: {} as any, mimeType: 'application/pdf', sizeBytes: 100 }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'app.maxFileSize') return 10 * 1024 * 1024;
        if (key === 'app.uploadDir') return './test-uploads';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: LocalStorageProvider, useValue: storage },
        { provide: ConfigService, useValue: config },
        { provide: ApplicationAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe('uploadUserAvatar', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

    it('should store a valid PNG and link it to the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: mockUserId });
      prisma.storedFile.create.mockResolvedValue({ id: 'avatar-1', category: 'USER_AVATAR' });

      const result = await service.uploadUserAvatar(mockUserId, pngBuffer, 'me.png', 'image/png');

      expect(storage.put).toHaveBeenCalled();
      expect(prisma.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploadedByUserId: mockUserId,
            category: 'USER_AVATAR',
            status: 'ACTIVE',
            extension: 'png',
          }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUserId },
          data: expect.objectContaining({
            avatarFileId: 'avatar-1',
            avatarUrl: '/api/v1/user/avatar',
          }),
        }),
      );
      expect(result.id).toBe('avatar-1');
    });

    it('should supersede the previous active avatar on replacement', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: mockUserId });
      prisma.storedFile.create.mockResolvedValue({ id: 'avatar-2', category: 'USER_AVATAR' });

      await service.uploadUserAvatar(mockUserId, jpgBuffer, 'me.jpg', 'image/jpeg');

      expect(prisma.storedFile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'USER_AVATAR', status: 'ACTIVE' }),
          data: { status: 'SUPERSEDED' },
        }),
      );
    });

    it('should reject an oversized avatar', async () => {
      await expect(
        service.uploadUserAvatar(
          mockUserId,
          Buffer.alloc(2 * 1024 * 1024 + 1),
          'big.png',
          'image/png',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject an unsupported MIME type', async () => {
      await expect(
        service.uploadUserAvatar(mockUserId, Buffer.from([1, 2, 3]), 'evil.gif', 'image/gif'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a spoofed file whose signature does not match its MIME type', async () => {
      await expect(
        service.uploadUserAvatar(
          mockUserId,
          Buffer.from('not-a-real-png!!'),
          'fake.png',
          'image/png',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw USER_AVATAR_NOT_FOUND when no avatar exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: mockUserId, avatarFileId: null });
      await expect(service.downloadUserAvatar(mockUserId)).rejects.toThrow(NotFoundException);
    });

    it('should reject upload when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.uploadUserAvatar(mockUserId, pngBuffer, 'me.png', 'image/png'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadResume', () => {
    it('should reject empty buffer', async () => {
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          Buffer.alloc(0),
          'resume.pdf',
          'application/pdf',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject oversized file', async () => {
      const large = Buffer.alloc(11 * 1024 * 1024);
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          large,
          'resume.pdf',
          'application/pdf',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject missing extension', async () => {
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          pdfBuffer,
          'resume',
          'application/pdf',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject blocked extension', async () => {
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          Buffer.from('something'),
          'resume.exe',
          'application/x-msdownload',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject spoofed MIME type', async () => {
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          pdfBuffer,
          'resume.pdf',
          'text/html',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject PDF signature mismatch', async () => {
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          textBuffer,
          'resume.pdf',
          'application/pdf',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject DOCX signature mismatch', async () => {
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          Buffer.from('not a zip'),
          'resume.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-existent application', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(
        service.uploadResume(
          mockApplicationId,
          mockCompanyId,
          mockUserId,
          pdfBuffer,
          'resume.pdf',
          'application/pdf',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should accept valid PDF', async () => {
      prisma.application.findFirst.mockResolvedValue({
        id: mockApplicationId,
        companyId: mockCompanyId,
      });
      prisma.storedFile.findFirst.mockResolvedValue(null);
      prisma.storedFile.updateMany.mockResolvedValue({ count: 0 });
      prisma.storedFile.create.mockResolvedValue({
        id: 'file-1',
        storageKey: 'company-1/uuid-abc.pdf',
        originalName: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
      });
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        storageKey: 'company-1/uuid-abc.pdf',
        originalName: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        checksumSha256: 'abc123',
      });

      const result = await service.uploadResume(
        mockApplicationId,
        mockCompanyId,
        mockUserId,
        pdfBuffer,
        'resume.pdf',
        'application/pdf',
      );
      expect(result).toBeDefined();
      expect(result!).toBeDefined();
      expect(result!.id).toBe('file-1');
      expect(storage.put).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'APPLICATION_RESUME_UPLOADED',
          actorType: 'RECRUITER',
        }),
      );
    });

    it('should accept valid DOCX', async () => {
      prisma.application.findFirst.mockResolvedValue({
        id: mockApplicationId,
        companyId: mockCompanyId,
      });
      prisma.storedFile.findFirst.mockResolvedValue(null);
      prisma.storedFile.updateMany.mockResolvedValue({ count: 0 });
      prisma.storedFile.create.mockResolvedValue({
        id: 'file-2',
        storageKey: 'key',
        originalName: 'res.docx',
      });
      prisma.storedFile.findUnique.mockResolvedValue({ id: 'file-2' });

      const result = await service.uploadResume(
        mockApplicationId,
        mockCompanyId,
        mockUserId,
        docxBuffer,
        'res.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result).toBeDefined();
    });

    it('should handle replacement by superseding previous', async () => {
      prisma.application.findFirst.mockResolvedValue({
        id: mockApplicationId,
        companyId: mockCompanyId,
      });
      prisma.storedFile.findFirst
        .mockResolvedValueOnce({ id: 'old-file' })
        .mockResolvedValueOnce(null);
      prisma.storedFile.updateMany.mockResolvedValue({ count: 1 });
      prisma.storedFile.create.mockResolvedValue({
        id: 'new-file',
        storageKey: 'company-1/new.pdf',
      });
      prisma.storedFile.findUnique.mockResolvedValue({ id: 'new-file' });

      const result = await service.uploadResume(
        mockApplicationId,
        mockCompanyId,
        mockUserId,
        pdfBuffer,
        'new.pdf',
        'application/pdf',
      );
      expect(result!.id).toBe('new-file');
      expect(prisma.storedFile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SUPERSEDED' } }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'APPLICATION_RESUME_REPLACED' }),
      );
    });
  });

  describe('company logo', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);

    it('stores a validated logo and links it to the company', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: mockCompanyId });
      storage.generateStoredName.mockReturnValue('logo.png');
      storage.put.mockResolvedValue({
        storageKey: `${mockCompanyId}/logo.png`,
        checksumSha256: 'logo-checksum',
        sizeBytes: pngBuffer.length,
      });
      prisma.storedFile.create.mockResolvedValue({ id: 'logo-file', mimeType: 'image/png' });

      await expect(
        service.uploadCompanyLogo(mockCompanyId, mockUserId, pngBuffer, 'brand.png', 'image/png'),
      ).resolves.toMatchObject({ id: 'logo-file' });

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: mockCompanyId },
        data: { logoFileId: 'logo-file', logoUrl: '/api/v1/company/logo' },
      });
    });

    it('rejects a file whose bytes do not match its image type', async () => {
      await expect(
        service.uploadCompanyLogo(
          mockCompanyId,
          mockUserId,
          Buffer.from('not an image'),
          'brand.png',
          'image/png',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadPublicResume', () => {
    it('rejects an unknown public application reference', async () => {
      prisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadPublicResume('a'.repeat(32), pdfBuffer, 'resume.pdf', 'application/pdf'),
      ).rejects.toThrow(NotFoundException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('uploads with candidate attribution and returns no internal identifiers', async () => {
      prisma.application.findFirst
        .mockResolvedValueOnce({ id: mockApplicationId, companyId: mockCompanyId })
        .mockResolvedValueOnce({ id: mockApplicationId, companyId: mockCompanyId });
      prisma.storedFile.findFirst.mockResolvedValue(null);
      prisma.storedFile.updateMany.mockResolvedValue({ count: 0 });
      prisma.storedFile.create.mockResolvedValue({ id: 'file-public' });
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-public',
        originalName: 'resume.pdf',
        sizeBytes: 100,
        storageKey: 'company-1/uuid-abc.pdf',
      });

      const result = await service.uploadPublicResume(
        'b'.repeat(32),
        pdfBuffer,
        'resume.pdf',
        'application/pdf',
      );

      expect(result).toEqual({ uploaded: true, fileName: 'resume.pdf', sizeBytes: 100 });
      expect(prisma.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ uploadedByUserId: null }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'CANDIDATE',
          actorUserId: undefined,
          eventType: 'APPLICATION_RESUME_UPLOADED',
        }),
      );
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('storageKey');
    });
  });

  describe('downloadFile', () => {
    it('should reject non-existent file', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(null);
      await expect(service.downloadFile('nonexistent', mockCompanyId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject soft-deleted file', async () => {
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        companyId: mockCompanyId,
        deletedAt: new Date(),
        status: 'ACTIVE',
        category: 'RESUME',
        applicationId: null,
      });
      await expect(service.downloadFile('file-1', mockCompanyId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject cross-tenant access', async () => {
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        companyId: 'company-other',
        deletedAt: null,
        status: 'ACTIVE',
        category: 'RESUME',
        applicationId: null,
      });
      await expect(service.downloadFile('file-1', mockCompanyId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow same-tenant download', async () => {
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        companyId: mockCompanyId,
        deletedAt: null,
        status: 'ACTIVE',
        category: 'RESUME',
        applicationId: mockApplicationId,
      });
      prisma.application.findFirst.mockResolvedValue({
        id: mockApplicationId,
        companyId: mockCompanyId,
      });

      const result = await service.downloadFile('file-1', mockCompanyId, mockUserId);
      expect(result).toBeDefined();
      expect(storage.get).toHaveBeenCalled();
    });

    it('should reject file with status DELETED', async () => {
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        companyId: mockCompanyId,
        deletedAt: null,
        status: 'DELETED',
        category: 'RESUME',
        applicationId: mockApplicationId,
      });
      await expect(service.downloadFile('file-1', mockCompanyId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('archiveFile', () => {
    it('should reject non-existent file', async () => {
      prisma.storedFile.findUnique.mockResolvedValue(null);
      await expect(service.archiveFile('nonexistent', mockCompanyId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject cross-tenant archive', async () => {
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        companyId: 'company-other',
        deletedAt: null,
        applicationId: mockApplicationId,
      });
      await expect(service.archiveFile('file-1', mockCompanyId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should soft-delete file', async () => {
      prisma.storedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        companyId: mockCompanyId,
        deletedAt: null,
        applicationId: mockApplicationId,
      });
      prisma.storedFile.update.mockResolvedValue({ id: 'file-1', status: 'DELETED' });

      const result = await service.archiveFile('file-1', mockCompanyId, mockUserId);
      expect(result.archived).toBe(true);
      expect(prisma.storedFile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DELETED' }) }),
      );
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('getApplicationResume', () => {
    it('should reject non-existent application', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(service.getApplicationResume('bad-app', mockCompanyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return null when no resume exists', async () => {
      prisma.application.findFirst.mockResolvedValue({
        id: mockApplicationId,
        companyId: mockCompanyId,
      });
      prisma.storedFile.findFirst.mockResolvedValue(null);
      const result = await service.getApplicationResume(mockApplicationId, mockCompanyId);
      expect(result).toBeNull();
    });

    it('should return active resume', async () => {
      prisma.application.findFirst.mockResolvedValue({
        id: mockApplicationId,
        companyId: mockCompanyId,
      });
      prisma.storedFile.findFirst.mockResolvedValue({ id: 'file-1', originalName: 'resume.pdf' });
      const result = await service.getApplicationResume(mockApplicationId, mockCompanyId);
      expect(result).toEqual({ id: 'file-1', originalName: 'resume.pdf' });
    });
  });
});
