import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return Object.fromEntries(
      Object.entries(user).filter(([key]) => key !== 'passwordHash'),
    ) as Omit<typeof user, 'passwordHash'>;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email },
    });
  }

  async findByNormalizedEmail(normalizedEmail: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { normalizedEmail },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    const existing = await this.prisma.user.findUnique({
      where: { normalizedEmail: data.normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findMemberships(userId: string) {
    await this.findById(userId);
    return this.prisma.companyMembership.findMany({
      where: { userId },
      include: {
        role: true,
        company: true,
      },
    });
  }

  async count(): Promise<number> {
    return this.prisma.user.count({
      where: { deletedAt: null },
    });
  }
}
