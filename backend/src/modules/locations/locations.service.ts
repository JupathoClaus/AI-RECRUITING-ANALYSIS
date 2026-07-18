import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrganizationAuditService } from '../organization/organization-audit.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationQueryDto } from './dto/location-query.dto';
import { Prisma, LocationStatus } from '@prisma/client';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: OrganizationAuditService,
  ) {}

  async create(companyId: string, dto: CreateLocationDto, userId: string) {
    if (dto.latitude != null && (dto.latitude < -90 || dto.latitude > 90)) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (dto.longitude != null && (dto.longitude < -180 || dto.longitude > 180)) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.companyLocation.updateMany({
          where: { companyId, isPrimary: true, deletedAt: null },
          data: { isPrimary: false },
        });
      }

      const location = await tx.companyLocation.create({
        data: {
          companyId,
          name: dto.name,
          type: dto.type,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2 ?? null,
          city: dto.city,
          stateOrProvince: dto.stateOrProvince ?? null,
          postalCode: dto.postalCode ?? null,
          countryCode: dto.countryCode,
          timezone: dto.timezone,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          isPrimary: dto.isPrimary ?? false,
        },
      });

      return location;
    });

    await this.auditService.record({
      companyId,
      actorUserId: userId,
      eventType: 'LOCATION_CREATED' as any,
      entityType: 'CompanyLocation',
      entityId: result.id,
      description: `Location "${result.name}" created`,
      metadata: { locationId: result.id, name: result.name, type: result.type },
    });

    return result;
  }

  async findAll(companyId: string, query: LocationQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      type,
      countryCode,
      isPrimary,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.CompanyLocationWhereInput = { companyId, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { addressLine1: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (type) where.type = type;
    if (countryCode) where.countryCode = countryCode;
    if (isPrimary != null) where.isPrimary = isPrimary;

    const orderBy: Prisma.CompanyLocationOrderByWithRelationInput = {};
    const allowedSort = ['name', 'createdAt', 'updatedAt', 'city', 'countryCode', 'type'];
    if (allowedSort.includes(sortBy)) {
      (orderBy as any)[sortBy] = sortOrder;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.companyLocation.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.companyLocation.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(companyId: string, locationId: string) {
    const location = await this.prisma.companyLocation.findFirst({
      where: { id: locationId, companyId, deletedAt: null },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID "${locationId}" not found`);
    }
    return location;
  }

  async update(companyId: string, locationId: string, dto: UpdateLocationDto, userId: string) {
    await this.findById(companyId, locationId);

    if (dto.latitude != null && (dto.latitude < -90 || dto.latitude > 90)) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (dto.longitude != null && (dto.longitude < -180 || dto.longitude > 180)) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.companyLocation.updateMany({
          where: { companyId, id: { not: locationId }, isPrimary: true, deletedAt: null },
          data: { isPrimary: false },
        });
      }

      return tx.companyLocation.update({
        where: { id: locationId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1 }),
          ...(dto.addressLine2 !== undefined && { addressLine2: dto.addressLine2 }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.stateOrProvince !== undefined && { stateOrProvince: dto.stateOrProvince }),
          ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
          ...(dto.countryCode !== undefined && { countryCode: dto.countryCode }),
          ...(dto.timezone !== undefined && { timezone: dto.timezone }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.latitude !== undefined && { latitude: dto.latitude }),
          ...(dto.longitude !== undefined && { longitude: dto.longitude }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        },
      });
    });

    await this.auditService.record({
      companyId,
      actorUserId: userId,
      eventType: 'LOCATION_UPDATED' as any,
      entityType: 'CompanyLocation',
      entityId: locationId,
      description: `Location "${result.name}" updated`,
      metadata: { changes: Object.keys(dto).filter((k) => (dto as any)[k] !== undefined) },
    });

    return result;
  }

  async setPrimary(companyId: string, locationId: string, userId: string) {
    const location = await this.findById(companyId, locationId);

    if (location.status !== LocationStatus.ACTIVE) {
      throw new BadRequestException('Cannot set an archived or inactive location as primary');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.companyLocation.updateMany({
        where: { companyId, isPrimary: true, deletedAt: null },
        data: { isPrimary: false },
      });

      return tx.companyLocation.update({
        where: { id: locationId },
        data: { isPrimary: true },
      });
    });

    await this.auditService.record({
      companyId,
      actorUserId: userId,
      eventType: 'LOCATION_UPDATED' as any,
      entityType: 'CompanyLocation',
      entityId: locationId,
      description: `Location "${result.name}" set as primary`,
      metadata: { action: 'setPrimary', locationId },
    });

    return result;
  }

  async softDelete(companyId: string, locationId: string) {
    const location = await this.findById(companyId, locationId);

    if (location.isPrimary) {
      const otherActive = await this.prisma.companyLocation.findFirst({
        where: {
          companyId,
          id: { not: locationId },
          deletedAt: null,
          status: LocationStatus.ACTIVE,
        },
      });
      if (!otherActive) {
        throw new BadRequestException(
          'Cannot delete the primary location. Set another location as primary first.',
        );
      }
    }

    return this.prisma.companyLocation.update({
      where: { id: locationId },
      data: { deletedAt: new Date() },
    });
  }

  async archive(companyId: string, locationId: string, userId: string) {
    const location = await this.findById(companyId, locationId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.CompanyLocationUpdateInput = {
        status: LocationStatus.ARCHIVED,
      };

      if (location.isPrimary) {
        updateData.isPrimary = false;
      }

      return tx.companyLocation.update({
        where: { id: locationId },
        data: updateData,
      });
    });

    await this.auditService.record({
      companyId,
      actorUserId: userId,
      eventType: 'LOCATION_ARCHIVED' as any,
      entityType: 'CompanyLocation',
      entityId: locationId,
      description: `Location "${result.name}" archived`,
      metadata: { previousStatus: location.status },
    });

    return result;
  }

  async restore(companyId: string, locationId: string, userId: string) {
    const location = await this.prisma.companyLocation.findFirst({
      where: { id: locationId, companyId, deletedAt: null },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID "${locationId}" not found`);
    }

    if (location.status !== LocationStatus.ARCHIVED) {
      throw new BadRequestException('Only archived locations can be restored');
    }

    const result = await this.prisma.companyLocation.update({
      where: { id: locationId },
      data: { status: LocationStatus.ACTIVE },
    });

    await this.auditService.record({
      companyId,
      actorUserId: userId,
      eventType: 'LOCATION_RESTORED' as any,
      entityType: 'CompanyLocation',
      entityId: locationId,
      description: `Location "${result.name}" restored`,
      metadata: { previousStatus: location.status },
    });

    return result;
  }
}
