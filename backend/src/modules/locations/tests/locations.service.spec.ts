import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '@modules/organization/organization-audit.service';
import { LocationsService } from '../locations.service';
import { LocationStatus } from '@prisma/client';

describe('LocationsService', () => {
  let service: LocationsService;
  let prisma: any;
  let auditService: any;

  const mockPrismaService = {
    $transaction: jest.fn(),
    companyLocation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockAuditService = {
    record: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrganizationAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    prisma = mockPrismaService;
    auditService = mockAuditService;

    mockPrismaService.$transaction.mockImplementation(async (cb: (...args: unknown[]) => unknown) =>
      cb(mockPrismaService),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (cb: (...args: unknown[]) => unknown) =>
      cb(mockPrismaService),
    );
  });

  describe('create', () => {
    const createDto = {
      name: 'Head Office',
      type: 'HEAD_OFFICE' as any,
      addressLine1: '123 Main St',
      city: 'New York',
      countryCode: 'US',
      timezone: 'America/New_York',
    };

    it('should create a location', async () => {
      const createdLocation = {
        id: 'loc-1',
        ...createDto,
        isPrimary: false,
        deletedAt: null,
        latitude: null,
        longitude: null,
      };
      prisma.companyLocation.create.mockResolvedValue(createdLocation);

      const result = await service.create('company-1', createDto, 'user-1');

      expect(result.id).toBe('loc-1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'LOCATION_CREATED' }),
      );
    });

    it('should create a primary location and unset previous primary', async () => {
      const primaryDto = { ...createDto, isPrimary: true };
      const createdLocation = {
        id: 'loc-2',
        ...primaryDto,
        isPrimary: true,
        latitude: null,
        longitude: null,
      };
      prisma.companyLocation.updateMany.mockResolvedValue({ count: 1 });
      prisma.companyLocation.create.mockResolvedValue(createdLocation);

      const result = await service.create('company-1', primaryDto, 'user-1');

      expect(prisma.companyLocation.updateMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isPrimary: true, deletedAt: null },
        data: { isPrimary: false },
      });
      expect(result.isPrimary).toBe(true);
    });

    it('should reject invalid latitude', async () => {
      await expect(
        service.create('company-1', { ...createDto, latitude: 100 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid longitude', async () => {
      await expect(
        service.create('company-1', { ...createDto, longitude: 200 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setPrimary', () => {
    it('should atomically switch primary location', async () => {
      const location = {
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Office',
        status: LocationStatus.ACTIVE,
      };
      prisma.companyLocation.findFirst.mockResolvedValue(location);
      prisma.companyLocation.updateMany.mockResolvedValue({ count: 1 });
      prisma.companyLocation.update.mockResolvedValue({ ...location, isPrimary: true });

      const result = await service.setPrimary('company-1', 'loc-1', 'user-1');

      expect(prisma.companyLocation.updateMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isPrimary: true, deletedAt: null },
        data: { isPrimary: false },
      });
      expect(prisma.companyLocation.update).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        data: { isPrimary: true },
      });
      expect(result.isPrimary).toBe(true);
    });

    it('should reject archived location as primary', async () => {
      const archivedLocation = {
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Old Office',
        status: LocationStatus.ARCHIVED,
      };
      prisma.companyLocation.findFirst.mockResolvedValue(archivedLocation);

      await expect(service.setPrimary('company-1', 'loc-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('archive', () => {
    it('should reject archived location as primary', async () => {
      const location = {
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Office',
        status: LocationStatus.ACTIVE,
        isPrimary: true,
      };
      prisma.companyLocation.findFirst.mockResolvedValue(location);
      prisma.companyLocation.update.mockResolvedValue({
        ...location,
        status: LocationStatus.ARCHIVED,
        isPrimary: false,
      });

      await service.archive('company-1', 'loc-1', 'user-1');

      expect(prisma.companyLocation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loc-1' },
          data: expect.objectContaining({ status: LocationStatus.ARCHIVED, isPrimary: false }),
        }),
      );
    });
  });
});
