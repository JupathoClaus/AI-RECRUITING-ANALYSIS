import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { SkillsService } from '../skills.service';
import { SkillType } from '@prisma/client';

describe('SkillsService', () => {
  let service: SkillsService;
  let prisma: any;

  const mockPrismaService = {
    skill: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SkillsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
    prisma = mockPrismaService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── create ────────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a company-custom skill with normalized name', async () => {
      prisma.skill.findFirst.mockResolvedValue(null);
      prisma.skill.create.mockResolvedValue({
        id: 'skill-1',
        normalizedName: 'typescript',
        displayName: 'TypeScript',
        type: SkillType.TECHNICAL,
        description: 'A programming language',
        companyId: 'company-1',
        isGlobal: false,
      });

      const result = await service.create('company-1', {
        name: '  TypeScript  ',
        type: SkillType.TECHNICAL,
        description: 'A programming language',
      });

      expect(result.normalizedName).toBe('typescript');
      expect(result.displayName).toBe('TypeScript');
      expect(prisma.skill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            normalizedName: 'typescript',
            displayName: 'TypeScript',
            companyId: 'company-1',
          }),
        }),
      );
    });

    it('should reject duplicate skill name within the same company', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'existing',
        normalizedName: 'typescript',
        companyId: 'company-1',
      });

      await expect(
        service.create('company-1', { name: 'TypeScript', type: SkillType.TECHNICAL }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow same name in different companies', async () => {
      prisma.skill.findFirst.mockResolvedValue(null);
      prisma.skill.create.mockResolvedValue({
        id: 'skill-2',
        normalizedName: 'typescript',
        displayName: 'TypeScript',
        type: SkillType.TECHNICAL,
        companyId: 'company-2',
      });

      const result = await service.create('company-2', {
        name: 'TypeScript',
        type: SkillType.TECHNICAL,
      });

      expect(result.normalizedName).toBe('typescript');
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated results including global + company skills', async () => {
      prisma.skill.findMany.mockResolvedValue([
        { id: 'skill-1', displayName: 'TypeScript', isGlobal: true },
        { id: 'skill-2', displayName: 'React', isGlobal: false, companyId: 'company-1' },
      ]);
      prisma.skill.count.mockResolvedValue(2);

      const result = await service.findAll('company-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ companyId: 'company-1' }, { isGlobal: true }],
          }),
        }),
      );
    });

    it('should filter by type', async () => {
      prisma.skill.findMany.mockResolvedValue([]);
      prisma.skill.count.mockResolvedValue(0);

      await service.findAll('company-1', { type: SkillType.TECHNICAL });

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([expect.objectContaining({ type: SkillType.TECHNICAL })]),
          }),
        }),
      );
    });

    it('should search by displayName and description', async () => {
      prisma.skill.findMany.mockResolvedValue([]);
      prisma.skill.count.mockResolvedValue(0);

      await service.findAll('company-1', { search: 'Type' });

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: [
                  { displayName: { contains: 'Type', mode: 'insensitive' } },
                  { description: { contains: 'Type', mode: 'insensitive' } },
                ],
              }),
            ]),
          }),
        }),
      );
    });

    it('should paginate results', async () => {
      prisma.skill.findMany.mockResolvedValue([]);
      prisma.skill.count.mockResolvedValue(50);

      const result = await service.findAll('company-1', { page: 2, limit: 10 });

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta.totalPages).toBe(5);
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('should find a skill by ID accessible cross-tenant for globals', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-1',
        displayName: 'TypeScript',
        isGlobal: true,
        companyId: null,
      });

      const result = await service.findById('company-1', 'skill-1');

      expect(result.id).toBe('skill-1');
      expect(prisma.skill.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'skill-1',
            OR: [{ companyId: 'company-1' }, { isGlobal: true }],
          },
        }),
      );
    });

    it('should find own company-specific skill', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-2',
        displayName: 'React',
        isGlobal: false,
        companyId: 'company-1',
      });

      const result = await service.findById('company-1', 'skill-2');

      expect(result.id).toBe('skill-2');
    });

    it('should throw NotFoundException if skill not found', async () => {
      prisma.skill.findFirst.mockResolvedValue(null);

      await expect(service.findById('company-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update a company-custom skill', async () => {
      prisma.skill.findFirst.mockResolvedValueOnce({
        id: 'skill-1',
        isGlobal: false,
        companyId: 'company-1',
        displayName: 'TypeScript',
        normalizedName: 'typescript',
        type: SkillType.TECHNICAL,
      });
      prisma.skill.findFirst.mockResolvedValueOnce(null);
      prisma.skill.update.mockResolvedValue({
        id: 'skill-1',
        displayName: 'TypeScript 5',
        normalizedName: 'typescript 5',
        type: SkillType.TECHNICAL,
      });

      const result = await service.update('company-1', 'skill-1', { name: 'TypeScript 5' });

      expect(result.displayName).toBe('TypeScript 5');
      expect(result.normalizedName).toBe('typescript 5');
    });

    it('should reject update of a global skill', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'global-skill',
        isGlobal: true,
        companyId: null,
      });

      await expect(
        service.update('company-1', 'global-skill', { name: 'New Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject update of another company skill', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-other',
        isGlobal: false,
        companyId: 'company-2',
      });

      await expect(
        service.update('company-1', 'skill-other', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject duplicate name on update', async () => {
      prisma.skill.findFirst.mockResolvedValueOnce({
        id: 'skill-1',
        isGlobal: false,
        companyId: 'company-1',
        displayName: 'TypeScript',
        normalizedName: 'typescript',
        type: SkillType.TECHNICAL,
      });
      prisma.skill.findFirst.mockResolvedValueOnce({
        id: 'skill-2',
        normalizedName: 'javascript',
        companyId: 'company-1',
      });

      await expect(service.update('company-1', 'skill-1', { name: 'JavaScript' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('should delete a company-custom skill', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-1',
        isGlobal: false,
        companyId: 'company-1',
        displayName: 'TypeScript',
      });
      prisma.skill.delete.mockResolvedValue({ id: 'skill-1' });

      const result = await service.delete('company-1', 'skill-1');

      expect(result).toEqual({ deleted: true });
      expect(prisma.skill.delete).toHaveBeenCalledWith({ where: { id: 'skill-1' } });
    });

    it('should reject deletion of a global skill', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'global-skill',
        isGlobal: true,
        companyId: null,
      });

      await expect(service.delete('company-1', 'global-skill')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject deletion of another company skill', async () => {
      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-other',
        isGlobal: false,
        companyId: 'company-2',
      });

      await expect(service.delete('company-1', 'skill-other')).rejects.toThrow(NotFoundException);
    });
  });
});
