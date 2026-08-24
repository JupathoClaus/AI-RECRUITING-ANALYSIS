import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { LocalStorageProvider } from '@modules/files/providers/local-storage.provider';
import { FilesService } from '@modules/files/services/files.service';
import { CompanyCandidateService } from '@modules/applications/services/company-candidate.service';
import { ApplicationNumberService } from '@modules/applications/services/application-number.service';
import { ApplicationAuditService } from '@modules/applications/services/application-audit.service';
import { ExtractionDispatchReconcilerService } from '@modules/resume-processing/services/extraction-dispatch-reconciler.service';
import { CandidateAuditService } from './candidate-audit.service';
import { CandidateDeduplicationService } from './candidate-deduplication.service';
import { RecruiterCandidateWorkflowDto } from './dto/recruiter-candidate-workflow.dto';
import {
  ApplicationActorType,
  ApplicationAuditEventType,
  ApplicationStatus,
  CandidateAuditEventType,
  CandidateSource,
  FileCategory,
  FileStatus,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';

const ACCEPTED_JOB_STATUSES = ['PUBLISHED'];
const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.SCREENING,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.ON_HOLD,
];
const TERMINAL_CANDIDATE_STATUSES = ['MERGED', 'DELETED', 'ANONYMIZED'] as any;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface RecruiterWorkflowResumeFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface RecruiterWorkflowResult {
  candidateId: string;
  candidateCreated: boolean;
  applicationId: string;
  applicationNumber: string;
  applicationStatus: string;
  stageId: string | null;
  stageName: string | null;
  jobId: string;
  jobTitle: string;
  storedFileId: string | null;
  extraction: { id: string; status: string } | null;
}

/**
 * Atomic "Add Candidate + Application + Resume" workflow used by the
 * recruiter Add Candidate dialog.
 *
 * Design guarantees (see stabilization sprint report):
 * - ONE HTTP request; candidate + application + resume linkage + extraction
 *   record are committed inside ONE idempotency-guarded serializable
 *   transaction. A failure before commit leaves NOTHING behind (the file is
 *   cleaned from disk).
 * - The resume file is validated and persisted to storage BEFORE the
 *   transaction so the DB write can never reference a file that failed to
 *   store, and a DB failure can delete the stored file.
 * - Existing candidate by normalized email is REUSED (like the public apply
 *   flow); a new application for the same candidate + job is a 409.
 * - Resume extraction is created in the same transaction (PENDING) and only
 *   DISPATCHED to BullMQ afterwards — the dispatch reconciler retries in the
 *   background, so the recruiter never waits for extraction.
 * - The whole workflow is idempotent under the Idempotency-Key header:
 *   retrying the exact same request replays the stored response.
 */
@Injectable()
export class RecruiterCandidateWorkflowService {
  private readonly logger = new Logger(RecruiterCandidateWorkflowService.name);
  private readonly maxFileSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private readonly storage: LocalStorageProvider,
    private readonly filesService: FilesService,
    private readonly companyCandidateService: CompanyCandidateService,
    private readonly numberService: ApplicationNumberService,
    private readonly auditService: ApplicationAuditService,
    private readonly candidateAuditService: CandidateAuditService,
    private readonly deduplicationService: CandidateDeduplicationService,
    private readonly reconciler: ExtractionDispatchReconcilerService,
    configService: ConfigService,
  ) {
    this.maxFileSize = configService.get<number>('app.maxFileSize') || DEFAULT_MAX_FILE_SIZE;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const cleaned = phone.replace(/[\s\-\(\)\.]+/g, '');
    const digits = cleaned.replace(/[^\d+]/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return digits;
  }

  private computeRequestHash(
    dto: RecruiterCandidateWorkflowDto,
    file: RecruiterWorkflowResumeFile,
  ): string {
    const fileSha = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const normalized = {
      firstName: dto.firstName?.trim() ?? '',
      lastName: dto.lastName?.trim() ?? '',
      email: dto.email?.trim()?.toLowerCase() ?? '',
      phone: dto.phone?.trim() ?? '',
      totalExperienceYears: dto.totalExperienceYears ?? null,
      jobId: dto.jobId,
      fileName: file.originalName,
      fileMimeType: file.mimeType,
      fileSize: file.buffer.length,
      fileSha256: fileSha,
    };
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  async create(
    dto: RecruiterCandidateWorkflowDto,
    companyId: string,
    userId: string,
    membershipId: string,
    file: RecruiterWorkflowResumeFile | undefined,
    idempotencyKey?: string,
  ): Promise<RecruiterWorkflowResult> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'A resume file is required.' });
    }

    // ── 1. Validate the file up front (extension, mime, size, magic bytes) ──
    if (file.buffer.length > this.maxFileSize) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'The resume file is too large.' });
    }
    const extension = this.filesService.validateAndGetExtension(
      file.originalName,
      file.mimeType,
      file.buffer,
    );

    // ── 2. Persist the file to storage BEFORE any DB write ──
    const storedName = this.storage.generateStoredName(extension);
    const { storageKey, checksumSha256, sizeBytes } = await this.storage.put(
      companyId,
      storedName,
      file.buffer,
      file.mimeType,
    );

    const requestHash = this.computeRequestHash(dto, file);

    try {
      const claim = await this.idempotencyService.executeTransactional<RecruiterWorkflowResult>({
        key: idempotencyKey ?? crypto.randomUUID(),
        companyId,
        userId,
        operation: 'RECRUITER_CANDIDATE_WORKFLOW',
        requestHash,
        execute: (tx) =>
          this.executeWorkflow(
            dto,
            companyId,
            userId,
            membershipId,
            { ...file, extension, storageKey, checksumSha256, sizeBytes },
            tx,
          ),
      });

      if (claim.status === 'COMPLETED') {
        const result = claim.responseJson as RecruiterWorkflowResult;
        if (result.extraction) {
          // Best-effort background dispatch. Failure is safe: the extraction
          // record + PENDING_DISPATCH row were committed with the workflow and
          // the ExtractionDispatchReconciler retries with backoff.
          this.reconciler
            .dispatchOne(result.extraction.id)
            .catch((err: unknown) =>
              this.logger.error(
                `Workflow dispatch failed for extraction ${result.extraction!.id}: ${(err as Error).message}`,
              ),
            );
        }
        return result;
      }
      throw new ConflictException({
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'Candidate creation is already in progress for this request.',
      });
    } catch (err) {
      // If anything failed before commit, never leave the stored file orphaned.
      await this.storage.delete(storageKey).catch(() => {});
      throw err;
    }
  }

  private async executeWorkflow(
    dto: RecruiterCandidateWorkflowDto,
    companyId: string,
    userId: string,
    membershipId: string,
    file: RecruiterWorkflowResumeFile & { extension: string; storageKey: string; checksumSha256: string; sizeBytes: number },
    tx: Prisma.TransactionClient,
  ): Promise<{ resourceType: string; resourceId: string; responseJson: RecruiterWorkflowResult }> {
    const source = dto.source ?? CandidateSource.RECRUITER_CREATED;
    const normalizedEmail = this.normalizeEmail(dto.email);

    // ── 3. Resolve candidate: reuse existing by normalized email, else create ──
    const existingCandidate = await tx.candidate.findFirst({
      where: {
        normalizedEmail,
        status: { notIn: TERMINAL_CANDIDATE_STATUSES },
      },
      select: { id: true },
    });

    let candidateId: string;
    let candidateCreated = false;
    if (existingCandidate) {
      candidateId = existingCandidate.id;
    } else {
      const fingerprint = this.deduplicationService.calculateFingerprint({
        normalizedEmail,
        normalizedPhone: this.normalizePhone(dto.phone),
        firstName: dto.firstName,
        lastName: dto.lastName,
      });
      const created = await tx.candidate.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email: dto.email.trim(),
          normalizedEmail,
          phone: dto.phone?.trim() ?? null,
          normalizedPhone: this.normalizePhone(dto.phone),
          currentJobTitle: null,
          totalExperienceYears: dto.totalExperienceYears ?? null,
          preferredLocale: 'en',
          timezone: 'UTC',
          source,
          duplicateFingerprint: fingerprint,
          lastProfileUpdatedAt: new Date(),
        },
        select: { id: true },
      });
      candidateId = created.id;
      candidateCreated = true;
    }

    // ── 4. Validate the job (tenant-scoped + accepting applications) ──
    const job = await tx.job.findFirst({
      where: { id: dto.jobId, companyId, deletedAt: null },
      include: {
        pipeline: {
          include: { stages: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!job) {
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Job not found' });
    }
    if (!ACCEPTED_JOB_STATUSES.includes(job.status)) {
      throw new BadRequestException({
        code: 'APPLICATION_JOB_NOT_ACCEPTING',
        message: 'Job is not accepting applications',
      });
    }
    if (job.applicationDeadline && new Date() > job.applicationDeadline) {
      throw new BadRequestException({
        code: 'APPLICATION_DEADLINE_PASSED',
        message: 'Application deadline has passed',
      });
    }

    // ── 5. Duplicate active application guard (same candidate + job) ──
    const duplicate = await tx.application.findFirst({
      where: {
        companyId,
        jobId: dto.jobId,
        candidateId,
        status: { in: ACTIVE_APPLICATION_STATUSES },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'APPLICATION_DUPLICATE',
        message: 'Candidate already has an active application for this job',
      });
    }

    // ── 6. CompanyCandidate link ──
    const cc = await this.companyCandidateService.findOrCreate(
      companyId,
      candidateId,
      source,
      undefined,
      undefined,
      membershipId,
      userId,
      tx,
    );

    // ── 7. Application (initial pipeline stage) ──
    const initialStage = job.pipeline?.stages[0];
    const applicationNumber = await this.numberService.generate(companyId, tx);
    const publicReference = crypto.randomUUID().replace(/-/g, '');
    const application = await tx.application.create({
      data: {
        companyId,
        jobId: dto.jobId,
        candidateId,
        companyCandidateId: cc.id,
        applicationNumber,
        publicReference,
        status: ApplicationStatus.DRAFT,
        currentStageId: initialStage?.id ?? null,
        source,
        sourceDetail: null,
      },
      select: { id: true },
    });

    // ── 8. Resume linkage (StoredFile) ──
    const storedFile = await tx.storedFile.create({
      data: {
        companyId,
        applicationId: application.id,
        uploadedByUserId: userId,
        storageKey: file.storageKey,
        originalName: this.filesService.sanitizeFilename(file.originalName),
        storedName: file.storageKey.split('/').pop() as string,
        extension: file.extension,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksumSha256: file.checksumSha256,
        category: FileCategory.RESUME,
        status: FileStatus.ACTIVE,
      },
      select: { id: true },
    });

    // ── 9. Extraction record (PENDING) + dispatch row — committed atomically ──
    const extraction = await tx.resumeTextExtraction.create({
      data: {
        storedFileId: storedFile.id,
        companyId,
        initiatedByUserId: userId,
        status: 'PENDING',
        mimeType: file.mimeType,
        sourceFileSha256: file.checksumSha256,
      },
      select: { id: true },
    });
    await tx.extractionDispatch.create({
      data: {
        extractionId: extraction.id,
        dispatchStatus: 'PENDING_DISPATCH',
      },
    });

    // ── 10. Audit events ──
    if (candidateCreated) {
      await this.candidateAuditService.record({
        candidateId,
        companyId,
        actorUserId: userId,
        actorMembershipId: membershipId,
        eventType: CandidateAuditEventType.CANDIDATE_CREATED,
        entityType: 'Candidate',
        entityId: candidateId,
        description: `Candidate ${dto.firstName.trim()} ${dto.lastName.trim()} created`,
        metadata: { source, via: 'recruiter-workflow' },
        tx,
      });
    }
    await this.auditService.record({
      companyId,
      applicationId: application.id,
      candidateId,
      companyCandidateId: cc.id,
      actorType: ApplicationActorType.RECRUITER,
      actorUserId: userId,
      actorMembershipId: membershipId,
      eventType: ApplicationAuditEventType.APPLICATION_CREATED,
      entityType: 'Application',
      entityId: application.id,
      description: `Application ${applicationNumber} created`,
      metadata: { jobId: dto.jobId, source, via: 'recruiter-workflow' },
      tx,
    });

    const responseJson: RecruiterWorkflowResult = {
      candidateId,
      candidateCreated,
      applicationId: application.id,
      applicationNumber,
      applicationStatus: ApplicationStatus.DRAFT,
      stageId: initialStage?.id ?? null,
      stageName: initialStage?.name ?? null,
      jobId: dto.jobId,
      jobTitle: job.title,
      storedFileId: storedFile.id,
      extraction: { id: extraction.id, status: 'PENDING' },
    };

    this.logger.log(
      `Recruiter workflow created application ${applicationNumber} (candidate ${candidateId}, file ${storedFile.id}, extraction ${extraction.id})`,
    );

    return {
      resourceType: 'candidate-workflow',
      resourceId: candidateId,
      responseJson,
    };
  }
}