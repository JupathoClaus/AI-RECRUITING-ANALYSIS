import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { LocalStorageProvider } from '@modules/files/providers/local-storage.provider';
import { validateResumeFile, sanitizeFilename } from '@modules/files/resume-file-validation';
import { CompanyCandidateService } from './company-candidate.service';
import { ApplicationNumberService } from './application-number.service';
import { ApplicationAuditService } from './application-audit.service';
import { createPendingExtraction } from '@modules/resume-processing/services/pending-extraction.creator';

const TERMINAL_CANDIDATE_STATUSES = ['MERGED', 'DELETED', 'ANONYMIZED'] as any;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const TX_MAX_RETRIES = 3;

export interface PublicSubmissionInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  currentJobTitle?: string;
  totalExperienceYears?: number;
  linkedInUrl?: string;
  portfolioUrl?: string;
  coverLetter?: string;
  preferredLanguage?: string;
  consentConfirmed: boolean;
  /** Honeypot field — must stay empty. Non-empty means bot. */
  websiteUrl?: string;
  screeningAnswers?: Array<{
    questionId: string;
    textAnswer?: string;
    numericAnswer?: number;
    dateAnswer?: string;
    answer?: unknown;
  }>;
}

export interface PublicSubmissionFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface PublicSubmissionResult {
  publicReference: string;
  applicationNumber: string | null;
  status: 'submitted' | 'pending_review' | 'received';
  resumeAttached: boolean;
}

/**
 * Atomic public careers application submission.
 *
 * One request stores the applicant (find-or-create by normalized email),
 * creates the application at the initial pipeline stage, persists screening
 * answers, stores the CV, links the StoredFile and queues resume extraction
 * — all inside one Serializable transaction. A failure before commit leaves
 * nothing behind; a duplicate active application returns the existing
 * reference without creating anything (safe against double submits).
 */
@Injectable()
export class PublicApplicationSubmissionService {
  private readonly logger = new Logger(PublicApplicationSubmissionService.name);
  private readonly maxFileSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageProvider,
    private readonly companyCandidateService: CompanyCandidateService,
    private readonly numberService: ApplicationNumberService,
    private readonly auditService: ApplicationAuditService,
    configService: ConfigService,
  ) {
    this.maxFileSize = configService.get<number>('app.maxFileSize') || DEFAULT_MAX_FILE_SIZE;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const digits = phone.replace(/[\s\-\(\)\.]+/g, '').replace(/[^\d+]/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return digits;
  }

  async submit(
    companySlug: string,
    jobSlug: string,
    input: PublicSubmissionInput,
    file?: PublicSubmissionFile,
  ): Promise<PublicSubmissionResult> {
    // Honeypot: pretend success without touching the database.
    if (input.websiteUrl && input.websiteUrl.trim().length > 0) {
      this.logger.warn('Public application rejected via honeypot field');
      return {
        publicReference: crypto.randomUUID().replace(/-/g, ''),
        applicationNumber: null,
        status: 'submitted',
        resumeAttached: false,
      };
    }

    if (!input.consentConfirmed) {
      throw new BadRequestException({
        code: 'APPLICATION_CONSENT_REQUIRED',
        message: 'Consent must be confirmed',
      });
    }

    // ── Validate the CV up front (extension, mime, magic bytes, size) ──
    let extension: string | undefined;
    if (file && file.buffer && file.buffer.length > 0) {
      if (file.buffer.length > this.maxFileSize) {
        throw new BadRequestException({
          code: 'FILE_TOO_LARGE',
          message: 'The CV file is too large.',
        });
      }
      extension = validateResumeFile(file.originalName, file.mimeType, file.buffer);
    }

    // ── Resolve company + published job (tenant + visibility enforced here) ──
    const company = await this.prisma.company.findFirst({
      where: { slug: companySlug, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!company)
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Company not found' });

    const job = await this.prisma.job.findFirst({
      where: {
        companyId: company.id,
        slug: jobSlug,
        status: 'PUBLISHED',
        visibility: { in: ['PUBLIC', 'UNLISTED'] },
        deletedAt: null,
        archivedAt: null,
        OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
      },
      select: {
        id: true,
        title: true,
        pipeline: {
          select: {
            stages: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, sortOrder: true },
            },
          },
        },
        screeningQuestions: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!job) {
      throw new NotFoundException({
        code: 'APPLICATION_JOB_NOT_ACCEPTING',
        message: 'Job not found or not accepting applications',
      });
    }

    // ── Store the CV bytes BEFORE the transaction (cleaned up on failure) ──
    let stored: { storageKey: string; checksumSha256: string; sizeBytes: number } | undefined;
    let storedName: string | undefined;
    if (file && extension) {
      storedName = crypto.randomUUID().replace(/-/g, '') + '.' + extension;
      stored = await this.storage.put(company.id, storedName, file.buffer, file.mimeType);
    }

    try {
      for (let attempt = 0; attempt < TX_MAX_RETRIES; attempt++) {
        try {
          return await this.prisma.$transaction(
            (tx: Prisma.TransactionClient) =>
              this.executeSubmission(tx, company.id, job, input, file, stored),
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              maxWait: 5000,
              timeout: 15000,
            },
          );
        } catch (err) {
          const prismaErr = err as { code?: string };
          if (prismaErr.code === 'P2034' && attempt < TX_MAX_RETRIES - 1) continue;
          throw err;
        }
      }
      throw new Error('unreachable');
    } catch (err) {
      if (stored && storedName) {
        await this.storage.delete(stored.storageKey).catch(() => {});
      }
      throw err;
    }
  }

  private async executeSubmission(
    tx: Prisma.TransactionClient,
    companyId: string,
    job: {
      id: string;
      title: string;
      pipeline?: { stages: Array<{ id: string }> } | null;
      screeningQuestions: Array<{ id: string }>;
    },
    input: PublicSubmissionInput,
    file: PublicSubmissionFile | undefined,
    stored: { storageKey: string; checksumSha256: string; sizeBytes: number } | undefined,
  ): Promise<PublicSubmissionResult> {
    const normalizedEmail = this.normalizeEmail(input.email);

    // ── Find or create the global candidate ──
    let candidate = await tx.candidate.findFirst({
      where: { normalizedEmail, status: { notIn: TERMINAL_CANDIDATE_STATUSES } },
      select: { id: true },
    });
    if (!candidate) {
      candidate = await tx.candidate.create({
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email: input.email.trim(),
          normalizedEmail,
          phone: input.phone?.trim() ?? null,
          normalizedPhone: this.normalizePhone(input.phone),
          currentJobTitle: input.currentJobTitle?.trim() ?? null,
          totalExperienceYears: input.totalExperienceYears ?? null,
          linkedInUrl: input.linkedInUrl?.trim() ?? null,
          portfolioUrl: input.portfolioUrl?.trim() ?? null,
          preferredLocale: input.preferredLanguage ?? 'en',
          source: 'CAREERS_PAGE',
        },
        select: { id: true },
      });
    }

    // ── Duplicate active application guard (same candidate + same job) ──
    const existingApp = await tx.application.findFirst({
      where: {
        companyId,
        jobId: job.id,
        candidateId: candidate.id,
        deletedAt: null,
        status: { notIn: ['WITHDRAWN', 'ARCHIVED', 'REJECTED'] },
      },
      select: { publicReference: true, applicationNumber: true },
    });
    if (existingApp) {
      // Generic response — never leak details, never create a second application.
      return {
        publicReference: existingApp.publicReference,
        applicationNumber: existingApp.applicationNumber,
        status: 'pending_review',
        resumeAttached: false,
      };
    }

    // ── Company link ──
    const cc = await this.companyCandidateService.findOrCreate(
      companyId,
      candidate.id,
      'CAREERS_PAGE',
      undefined,
      undefined,
      undefined,
      undefined,
      tx,
    );

    // ── Application at the initial pipeline stage (lowest sortOrder) ──
    interface PipelineStage {
      id: string;
      sortOrder: number;
    }
    const stages = (job.pipeline?.stages ?? []) as PipelineStage[];
    const sortedStages = [...stages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const initialStage = sortedStages[0];
    const applicationNumber = await this.numberService.generate(companyId, tx);
    const publicReference = crypto.randomUUID().replace(/-/g, '');
    const application = await tx.application.create({
      data: {
        companyId,
        jobId: job.id,
        candidateId: candidate.id,
        companyCandidateId: cc.id,
        applicationNumber,
        publicReference,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        currentStageId: initialStage?.id ?? null,
        source: 'CAREERS_PAGE',
        coverLetter: input.coverLetter?.trim() ?? null,
        consentConfirmed: true,
      },
      select: { id: true },
    });

    if (initialStage) {
      await tx.applicationStageHistory.create({
        data: {
          applicationId: application.id,
          toStageId: initialStage.id,
          fromStatus: null,
          toStatus: 'SUBMITTED',
          actorType: 'CANDIDATE',
        },
      });
    }

    // ── Screening answers: accept ONLY ids belonging to THIS job ──
    const validQuestionIds = new Set(job.screeningQuestions.map((q) => q.id));
    const answers = (input.screeningAnswers ?? []).filter((a) =>
      validQuestionIds.has(a.questionId),
    );
    if (answers.length > 0) {
      await tx.applicationScreeningAnswer.createMany({
        data: answers.map((a) => ({
          applicationId: application.id,
          questionId: a.questionId,
          textAnswer: a.textAnswer ?? null,
          numericAnswer: a.numericAnswer ?? null,
          dateAnswer: a.dateAnswer ? new Date(a.dateAnswer) : null,
          answer: a.answer ?? undefined,
          isComplete: !!(a.textAnswer || a.numericAnswer != null || a.dateAnswer || a.answer),
        })),
        skipDuplicates: true,
      });
    }

    // ── CV linkage + pending extraction (dispatched by the reconciler) ──
    let resumeAttached = false;
    if (stored && file) {
      const storedFile = await tx.storedFile.create({
        data: {
          companyId,
          applicationId: application.id,
          uploadedByUserId: null,
          storageKey: stored.storageKey,
          originalName: sanitizeFilename(file.originalName),
          storedName: stored.storageKey.split('/').pop() as string,
          extension: (stored.storageKey.split('.').pop() ?? 'pdf').toLowerCase(),
          mimeType: file.mimeType,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          category: 'RESUME',
          status: 'ACTIVE',
        },
        select: { id: true, checksumSha256: true },
      });

      await createPendingExtraction(tx, {
        storedFileId: storedFile.id,
        companyId,
        mimeType: file.mimeType,
        checksumSha256: storedFile.checksumSha256,
      });
      resumeAttached = true;
    }

    await this.auditService.record({
      companyId,
      applicationId: application.id,
      candidateId: candidate.id,
      companyCandidateId: cc.id,
      actorType: 'CANDIDATE',
      eventType: 'APPLICATION_SUBMITTED',
      entityType: 'Application',
      entityId: application.id,
      description: `Public application submitted for job ${job.title}`,
      metadata: { jobId: job.id, resumeAttached },
      tx,
    });

    this.logger.log(
      `Public application ${applicationNumber} submitted for job ${job.id} (candidate ${candidate.id}, resume=${resumeAttached})`,
    );

    return { publicReference, applicationNumber, status: 'submitted', resumeAttached };
  }
}
