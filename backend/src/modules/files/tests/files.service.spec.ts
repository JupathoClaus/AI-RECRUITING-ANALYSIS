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
