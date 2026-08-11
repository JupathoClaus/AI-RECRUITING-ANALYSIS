import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  JobPublicationStatus,
  JobActivityEventType,
  ExternalPostingProvider,
} from '@prisma/client';
import { AdapterRegistry } from './adapters/adapter-registry';
import { CreatePublicationDto } from './dto/create-publication.dto';

@Injectable()
export class JobPublicationsService {
  private readonly logger = new Logger(JobPublicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  async findByJob(companyId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const publications = await this.prisma.jobPublication.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    return publications;
  }

  async publish(companyId: string, jobId: string, dto: CreatePublicationDto, membershipId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const existing = await this.prisma.jobPublication.findUnique({
      where: { jobId_provider: { jobId, provider: dto.provider } },
    });
    if (existing && existing.status === JobPublicationStatus.PUBLISHED) {
      throw new ConflictException(`Job is already published on ${dto.provider}`);
    }

    if (existing && existing.status === JobPublicationStatus.QUEUED) {
      throw new ConflictException(`A publication request for ${dto.provider} is already queued`);
    }

    const adapter = this.adapterRegistry.get(dto.provider);
    const config = await this.buildProviderConfig(companyId, dto);

    let publication = existing;
    if (!publication) {
      publication = await this.prisma.jobPublication.create({
        data: {
          jobId,
          provider: dto.provider,
          externalAccountId: dto.externalAccountId ?? null,
          status: JobPublicationStatus.QUEUED,
          requestedByMembershipId: membershipId,
        },
      });
    } else {
      publication = await this.prisma.jobPublication.update({
        where: { id: publication.id },
        data: {
          status: JobPublicationStatus.QUEUED,
          retryCount: { increment: 1 },
          failureCode: null,
          failureMessage: null,
          requestedByMembershipId: membershipId,
        },
      });
    }

    try {
      const result = await adapter.publish(job, config);

      if (result.success) {
        publication = await this.prisma.jobPublication.update({
          where: { id: publication.id },
          data: {
            status: JobPublicationStatus.PUBLISHED,
            externalPostingId: result.externalPostingId ?? null,
            externalUrl: result.externalUrl ?? null,
            publishedAt: new Date(),
            lastSyncedAt: new Date(),
          },
        });

        await this.recordJobActivity(
          companyId,
          jobId,
          membershipId,
          JobActivityEventType.JOB_PUBLISHED,
          `Job published to ${dto.provider}`,
        );

        await this.syncJobPublicationStatus(companyId, jobId);
      } else {
        publication = await this.prisma.jobPublication.update({
          where: { id: publication.id },
          data: {
            status: JobPublicationStatus.FAILED,
            failureCode: result.failureCode ?? null,
            failureMessage: result.failureMessage ?? null,
          },
        });

        await this.recordJobActivity(
          companyId,
          jobId,
          membershipId,
          JobActivityEventType.JOB_PUBLICATION_FAILED,
          `Job publication to ${dto.provider} failed: ${result.failureMessage}`,
        );
      }
    } catch (error) {
      publication = await this.prisma.jobPublication.update({
        where: { id: publication.id },
        data: {
          status: JobPublicationStatus.FAILED,
          failureCode: 'ADAPTER_ERROR',
          failureMessage: (error as Error).message,
        },
      });
    }

    return publication;
  }

  async unpublish(companyId: string, jobId: string, publicationId: string, membershipId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const publication = await this.prisma.jobPublication.findFirst({
      where: { id: publicationId, jobId },
    });
    if (!publication) {
      throw new NotFoundException(`Publication with ID ${publicationId} not found`);
    }

    const adapter = this.adapterRegistry.get(publication.provider);
    const config = await this.buildProviderConfig(companyId, {
      provider: publication.provider,
      externalAccountId: publication.externalAccountId ?? undefined,
    });

    try {
      if (publication.externalPostingId) {
        await adapter.unpublish(publication.externalPostingId, config);
      }
    } catch (error) {
      this.logger.warn(
        `Unpublish request failed for publication ${publicationId}: ${(error as Error).message}`,
      );
    }

    const updated = await this.prisma.jobPublication.update({
      where: { id: publicationId },
      data: {
        status: JobPublicationStatus.UNPUBLISHED,
        unpublishedAt: new Date(),
      },
    });

    await this.recordJobActivity(
      companyId,
      jobId,
      membershipId,
      JobActivityEventType.JOB_UPDATED,
      `Job unpublished from ${publication.provider}`,
    );

    await this.syncJobPublicationStatus(companyId, jobId);

    return updated;
  }

  async retry(companyId: string, jobId: string, publicationId: string, membershipId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const publication = await this.prisma.jobPublication.findFirst({
      where: { id: publicationId, jobId },
    });
    if (!publication) {
      throw new NotFoundException(`Publication with ID ${publicationId} not found`);
    }

    if (publication.status !== JobPublicationStatus.FAILED) {
      throw new BadRequestException('Can only retry failed publications');
    }

    const adapter = this.adapterRegistry.get(publication.provider);
    const config = await this.buildProviderConfig(companyId, {
      provider: publication.provider,
      externalAccountId: publication.externalAccountId ?? undefined,
    });

    await this.prisma.jobPublication.update({
      where: { id: publicationId },
      data: {
        status: JobPublicationStatus.QUEUED,
        retryCount: { increment: 1 },
        failureCode: null,
        failureMessage: null,
      },
    });

    try {
      const result = await adapter.publish(job, config);

      if (result.success) {
        const updated = await this.prisma.jobPublication.update({
          where: { id: publicationId },
          data: {
            status: JobPublicationStatus.PUBLISHED,
            externalPostingId: result.externalPostingId ?? null,
            externalUrl: result.externalUrl ?? null,
            publishedAt: new Date(),
            lastSyncedAt: new Date(),
          },
        });

        await this.recordJobActivity(
          companyId,
          jobId,
          membershipId,
          JobActivityEventType.JOB_PUBLISHED,
          `Job republished to ${publication.provider} (retry)`,
        );

        await this.syncJobPublicationStatus(companyId, jobId);

        return updated;
      } else {
        return this.prisma.jobPublication.update({
          where: { id: publicationId },
          data: {
            status: JobPublicationStatus.FAILED,
            failureCode: result.failureCode ?? null,
            failureMessage: result.failureMessage ?? null,
          },
        });
      }
    } catch (error) {
      return this.prisma.jobPublication.update({
        where: { id: publicationId },
        data: {
          status: JobPublicationStatus.FAILED,
          failureCode: 'ADAPTER_ERROR',
          failureMessage: (error as Error).message,
        },
      });
    }
  }

  getSupportedProviders(): ExternalPostingProvider[] {
    return this.adapterRegistry.getAllProviders();
  }

  private async buildProviderConfig(
    companyId: string,
    dto: { provider: ExternalPostingProvider; externalAccountId?: string },
  ): Promise<Record<string, unknown>> {
    const settings = await this.prisma.companySettings.findUnique({
      where: { companyId },
    });

    const config: Record<string, unknown> = {};

    if (dto.provider === ExternalPostingProvider.COMPANY_CAREERS_PAGE) {
      if (settings?.careersPageEnabled) {
        const company = await this.prisma.company.findUnique({
          where: { id: companyId },
          select: { slug: true, name: true },
        });
        if (company) {
          config.careersPageUrl = `https://${company.slug}.careers.example.com`;
        }
      }
    }

    if (dto.provider === ExternalPostingProvider.CUSTOM_WEBHOOK && dto.externalAccountId) {
      config.webhookUrl = dto.externalAccountId;
    }

    return config;
  }

  private async syncJobPublicationStatus(companyId: string, jobId: string): Promise<void> {
    const publications = await this.prisma.jobPublication.findMany({
      where: { jobId },
    });

    const hasPublished = publications.some((p) => p.status === JobPublicationStatus.PUBLISHED);
    const hasFailed = publications.some((p) => p.status === JobPublicationStatus.FAILED);
    const hasQueued = publications.some((p) => p.status === JobPublicationStatus.QUEUED);

    let newStatus: JobPublicationStatus;
    if (hasPublished && hasFailed) {
      newStatus = JobPublicationStatus.PARTIALLY_PUBLISHED;
    } else if (hasPublished) {
      newStatus = JobPublicationStatus.PUBLISHED;
    } else if (hasQueued) {
      newStatus = JobPublicationStatus.QUEUED;
    } else if (hasFailed) {
      newStatus = JobPublicationStatus.FAILED;
    } else {
      newStatus = JobPublicationStatus.NOT_PUBLISHED;
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: { publicationStatus: newStatus },
    });
  }

  private async recordJobActivity(
    companyId: string,
    jobId: string,
    membershipId: string,
    eventType: JobActivityEventType,
    description: string,
  ): Promise<void> {
    try {
      await this.prisma.jobActivityEvent.create({
        data: {
          companyId,
          jobId,
          actorMembershipId: membershipId,
          eventType,
          description,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to record job activity event: ${(error as Error).message}`);
    }
  }
}
