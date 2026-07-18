import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';

@Injectable()
export class JobCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async generateCode(companyId: string): Promise<string> {
    const year = new Date().getFullYear().toString();
    const key = `job_code_${companyId}_${year}`;

    return this.prisma.$transaction(async (tx) => {
      let metadata = await tx.systemMetadata.findUnique({ where: { key } });

      if (!metadata) {
        metadata = await tx.systemMetadata.create({
          data: {
            key,
            value: { sequence: 1 },
          },
        });
      }

      const value = metadata.value as { sequence?: number } | null;
      const currentSeq = value?.sequence ?? 1;

      await tx.systemMetadata.update({
        where: { key },
        data: { value: { sequence: currentSeq + 1 } },
      });

      return `JOB-${year}-${String(currentSeq).padStart(5, '0')}`;
    });
  }

  async generateSlug(companyId: string, title: string): Promise<string> {
    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) slug = 'job';

    const existing = await this.prisma.job.findFirst({
      where: { companyId, slug, deletedAt: null },
      select: { id: true },
    });

    if (!existing) return slug;

    let suffix = 1;
    while (true) {
      const candidate = `${slug}-${suffix}`;
      const conflict = await this.prisma.job.findFirst({
        where: { companyId, slug: candidate, deletedAt: null },
        select: { id: true },
      });
      if (!conflict) return candidate;
      suffix++;
    }
  }

  async regenerateSlug(companyId: string, title: string, excludeJobId: string): Promise<string> {
    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) slug = 'job';

    const existing = await this.prisma.job.findFirst({
      where: { companyId, slug, id: { not: excludeJobId }, deletedAt: null },
      select: { id: true },
    });

    if (!existing) return slug;

    let suffix = 1;
    while (true) {
      const candidate = `${slug}-${suffix}`;
      const conflict = await this.prisma.job.findFirst({
        where: { companyId, slug: candidate, id: { not: excludeJobId }, deletedAt: null },
        select: { id: true },
      });
      if (!conflict) return candidate;
      suffix++;
    }
  }
}
