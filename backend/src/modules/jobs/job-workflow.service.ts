import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  JobStatus,
  JobApprovalStatus,
  JobActivityEventType,
  JobPublicationStatus,
  Prisma,
} from '@prisma/client';
import { JobActivityService } from './job-activity.service';

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.DRAFT]: [
    JobStatus.PENDING_APPROVAL,
    JobStatus.PUBLISHED,
    JobStatus.CLOSED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.PENDING_APPROVAL]: [JobStatus.APPROVED, JobStatus.DRAFT, JobStatus.CANCELLED],
  [JobStatus.APPROVED]: [
    JobStatus.PUBLISHED,
    JobStatus.SCHEDULED,
    JobStatus.DRAFT,
    JobStatus.CANCELLED,
  ],
  [JobStatus.SCHEDULED]: [JobStatus.PUBLISHED, JobStatus.DRAFT, JobStatus.CANCELLED],
  [JobStatus.PUBLISHED]: [JobStatus.PAUSED, JobStatus.CLOSED, JobStatus.FILLED],
  [JobStatus.PAUSED]: [JobStatus.PUBLISHED, JobStatus.CLOSED],
  [JobStatus.CLOSED]: [JobStatus.DRAFT],
  [JobStatus.FILLED]: [JobStatus.CLOSED],
  [JobStatus.CANCELLED]: [JobStatus.DRAFT],
  [JobStatus.ARCHIVED]: [JobStatus.DRAFT],
};

const STATUS_TIMESTAMPS: Partial<
  Record<
    JobStatus,
    keyof Pick<
      Prisma.JobUpdateInput,
      'publishedAt' | 'closedAt' | 'filledAt' | 'archivedAt' | 'scheduledPublishAt'
    >
  >
> = {
  [JobStatus.PUBLISHED]: 'publishedAt',
  [JobStatus.CLOSED]: 'closedAt',
  [JobStatus.FILLED]: 'filledAt',
  [JobStatus.ARCHIVED]: 'archivedAt',
  [JobStatus.SCHEDULED]: 'scheduledPublishAt',
};

const STATUS_ACTIVITY_EVENTS: Record<JobStatus, JobActivityEventType> = {
  [JobStatus.DRAFT]: JobActivityEventType.JOB_CREATED,
  [JobStatus.PENDING_APPROVAL]: JobActivityEventType.JOB_SUBMITTED_FOR_APPROVAL,
  [JobStatus.APPROVED]: JobActivityEventType.JOB_APPROVED,
  [JobStatus.SCHEDULED]: JobActivityEventType.JOB_SCHEDULED,
  [JobStatus.PUBLISHED]: JobActivityEventType.JOB_PUBLISHED,
  [JobStatus.PAUSED]: JobActivityEventType.JOB_PAUSED,
  [JobStatus.CLOSED]: JobActivityEventType.JOB_CLOSED,
  [JobStatus.FILLED]: JobActivityEventType.JOB_FILLED,
  [JobStatus.CANCELLED]: JobActivityEventType.JOB_CANCELLED,
  [JobStatus.ARCHIVED]: JobActivityEventType.JOB_ARCHIVED,
};

@Injectable()
export class JobWorkflowService {
  private readonly logger = new Logger(JobWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobActivityService: JobActivityService,
  ) {}

  async transition(
    companyId: string,
    jobId: string,
    newStatus: JobStatus,
    membershipId: string,
    userId?: string,
    options?: {
      scheduledPublishAt?: Date;
      approvalId?: string;
      requestId?: string;
    },
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, title: true, jobCode: true },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    const currentStatus = job.status;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];

    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      this.logger.warn(
        `Invalid status transition: ${currentStatus} -> ${newStatus} for job ${jobId}`,
      );
      throw new BadRequestException('JOB_STATUS_TRANSITION_INVALID');
    }

    const timestampField = STATUS_TIMESTAMPS[newStatus];
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedByMembershipId: membershipId,
    };

    if (timestampField) {
      updateData[timestampField] = new Date();
    }

    if (newStatus === JobStatus.SCHEDULED && options?.scheduledPublishAt) {
      updateData.scheduledPublishAt = options.scheduledPublishAt;
    }

    if (newStatus === JobStatus.PUBLISHED) {
      updateData.publicationStatus = JobPublicationStatus.PUBLISHED;
    }

    if (
      newStatus === JobStatus.CLOSED ||
      newStatus === JobStatus.CANCELLED ||
      newStatus === JobStatus.ARCHIVED
    ) {
      updateData.publicationStatus = JobPublicationStatus.UNPUBLISHED;
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: updateData as Prisma.JobUpdateInput,
    });

    const eventType = STATUS_ACTIVITY_EVENTS[newStatus] || JobActivityEventType.JOB_UPDATED;

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType,
      description: `Job "${job.title}" (${job.jobCode}) status changed from ${currentStatus} to ${newStatus}`,
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: {
        previousStatus: currentStatus,
        newStatus,
      },
      requestId: options?.requestId,
    });

    this.logger.log(
      `Job ${jobId} transitioned: ${currentStatus} -> ${newStatus} by membership ${membershipId}`,
    );
  }

  async submitForApproval(
    companyId: string,
    jobId: string,
    approverMembershipId: string,
    membershipId: string,
    userId: string,
    message?: string,
    requestId?: string,
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, approvalStatus: true },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    if (job.status !== JobStatus.DRAFT) {
      throw new BadRequestException('JOB_STATUS_TRANSITION_INVALID');
    }

    const approval = await this.prisma.jobApproval.create({
      data: {
        jobId,
        requestedByMembershipId: membershipId,
        assignedApproverMembershipId: approverMembershipId,
        status: JobApprovalStatus.PENDING,
        message: message ?? null,
        requestedAt: new Date(),
      },
    });

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PENDING_APPROVAL,
        approvalStatus: JobApprovalStatus.PENDING,
        updatedByMembershipId: membershipId,
      },
    });

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.JOB_SUBMITTED_FOR_APPROVAL,
      description: 'Job submitted for approval',
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: { approvalId: approval.id, approverMembershipId },
      requestId,
    });
  }

  async approve(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    reviewNotes?: string,
    requestId?: string,
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, approvalStatus: true },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    if (job.status !== JobStatus.PENDING_APPROVAL) {
      throw new BadRequestException('JOB_STATUS_TRANSITION_INVALID');
    }

    const pendingApproval = await this.prisma.jobApproval.findFirst({
      where: {
        jobId,
        status: JobApprovalStatus.PENDING,
        assignedApproverMembershipId: membershipId,
      },
    });

    if (!pendingApproval) {
      throw new BadRequestException('No pending approval request found for this reviewer');
    }

    await this.prisma.jobApproval.update({
      where: { id: pendingApproval.id },
      data: {
        status: JobApprovalStatus.APPROVED,
        reviewedByMembershipId: membershipId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      },
    });

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.APPROVED,
        approvalStatus: JobApprovalStatus.APPROVED,
        updatedByMembershipId: membershipId,
      },
    });

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.JOB_APPROVED,
      description: 'Job has been approved',
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: { approvalId: pendingApproval.id },
      requestId,
    });
  }

  async reject(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    reviewNotes?: string,
    requestId?: string,
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, approvalStatus: true },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    if (job.status !== JobStatus.PENDING_APPROVAL) {
      throw new BadRequestException('JOB_STATUS_TRANSITION_INVALID');
    }

    const pendingApproval = await this.prisma.jobApproval.findFirst({
      where: {
        jobId,
        status: JobApprovalStatus.PENDING,
        assignedApproverMembershipId: membershipId,
      },
    });

    if (!pendingApproval) {
      throw new BadRequestException('No pending approval request found for this reviewer');
    }

    await this.prisma.jobApproval.update({
      where: { id: pendingApproval.id },
      data: {
        status: JobApprovalStatus.REJECTED,
        reviewedByMembershipId: membershipId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      },
    });

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
        updatedByMembershipId: membershipId,
      },
    });

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.JOB_REJECTED,
      description: 'Job approval has been rejected',
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: { approvalId: pendingApproval.id },
      requestId,
    });
  }

  async requestChanges(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    reviewNotes?: string,
    requestId?: string,
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, approvalStatus: true },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    if (job.status !== JobStatus.PENDING_APPROVAL) {
      throw new BadRequestException('JOB_STATUS_TRANSITION_INVALID');
    }

    const pendingApproval = await this.prisma.jobApproval.findFirst({
      where: {
        jobId,
        status: JobApprovalStatus.PENDING,
        assignedApproverMembershipId: membershipId,
      },
    });

    if (!pendingApproval) {
      throw new BadRequestException('No pending approval request found for this reviewer');
    }

    await this.prisma.jobApproval.update({
      where: { id: pendingApproval.id },
      data: {
        status: JobApprovalStatus.CHANGES_REQUESTED,
        reviewedByMembershipId: membershipId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      },
    });

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.DRAFT,
        approvalStatus: JobApprovalStatus.NOT_REQUIRED,
        updatedByMembershipId: membershipId,
      },
    });

    await this.jobActivityService.record({
      companyId,
      jobId,
      eventType: JobActivityEventType.JOB_CHANGES_REQUESTED,
      description: 'Changes requested for the job',
      actorUserId: userId,
      actorMembershipId: membershipId,
      metadata: { approvalId: pendingApproval.id },
      requestId,
    });
  }

  async schedulePublish(
    companyId: string,
    jobId: string,
    scheduledAt: Date,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('JOB_DEADLINE_INVALID');
    }

    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: { id: true, status: true, approvalStatus: true },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    if (job.approvalStatus !== JobApprovalStatus.APPROVED) {
      throw new BadRequestException('Job must be approved before scheduling publication');
    }

    await this.transition(companyId, jobId, JobStatus.SCHEDULED, membershipId, userId, {
      scheduledPublishAt: scheduledAt,
      requestId,
    });
  }

  async publish(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: {
        id: true,
        status: true,
        approvalStatus: true,
        company: {
          select: {
            settings: {
              select: { requireJobApproval: true },
            },
          },
        },
      },
    });

    if (!job) {
      throw new BadRequestException('JOB_NOT_FOUND');
    }

    const requireApproval = job.company?.settings?.requireJobApproval ?? true;

    if (requireApproval && job.approvalStatus !== JobApprovalStatus.APPROVED) {
      throw new BadRequestException('Job must be approved before publishing');
    }

    const validPrePublishStatuses: JobStatus[] = requireApproval
      ? [JobStatus.APPROVED, JobStatus.SCHEDULED]
      : [JobStatus.DRAFT, JobStatus.APPROVED, JobStatus.SCHEDULED];

    if (!validPrePublishStatuses.includes(job.status)) {
      throw new BadRequestException('JOB_STATUS_TRANSITION_INVALID');
    }

    await this.transition(companyId, jobId, JobStatus.PUBLISHED, membershipId, userId, {
      requestId,
    });
  }

  async close(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    await this.transition(companyId, jobId, JobStatus.CLOSED, membershipId, userId, { requestId });
  }

  async pause(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    await this.transition(companyId, jobId, JobStatus.PAUSED, membershipId, userId, { requestId });
  }

  async resume(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    await this.transition(companyId, jobId, JobStatus.PUBLISHED, membershipId, userId, {
      requestId,
    });
  }

  async fill(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    await this.transition(companyId, jobId, JobStatus.FILLED, membershipId, userId, { requestId });
  }

  async cancel(
    companyId: string,
    jobId: string,
    membershipId: string,
    userId: string,
    requestId?: string,
  ): Promise<void> {
    await this.transition(companyId, jobId, JobStatus.CANCELLED, membershipId, userId, {
      requestId,
    });
  }
}
