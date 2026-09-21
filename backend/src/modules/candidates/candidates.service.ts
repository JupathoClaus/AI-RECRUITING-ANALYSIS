import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { ApplicationStatus, CandidateStatus, InterviewStatus, Prisma } from '@prisma/client';
import { CandidateAuditService } from './candidate-audit.service';
import { CandidateDeduplicationService } from './candidate-deduplication.service';
import { CreateCandidateDto, UpdateCandidateDto } from './dto/create-candidate.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { mapCandidateToResponse, mapCandidateToDetail } from './mappers/candidate.mapper';
import {
  buildScreeningSummaryMap,
  CandidateScreeningSummary,
} from './mappers/screening-summary.mapper';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import * as crypto from 'crypto';

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: CandidateAuditService,
    private readonly deduplicationService: CandidateDeduplicationService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  normalizeEmail(email?: string | null): string | null {
    if (!email) return null;
    return email.trim().toLowerCase();
  }

  normalizePhone(phone?: string | null): string | null {
    if (!phone) return null;
    const cleaned = phone.replace(/[\s\-\(\)\.]+/g, '');
    const digits = cleaned.replace(/[^\d+]/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return digits;
  }

  private computeRequestHash(dto: CreateCandidateDto): string {
    const normalized = {
      firstName: dto.firstName?.trim() ?? '',
      lastName: dto.lastName?.trim() ?? '',
      email: dto.email?.trim()?.toLowerCase() ?? '',
      phone: dto.phone?.trim() ?? '',
      source: dto.source ?? '',
      currentJobTitle: dto.currentJobTitle?.trim() ?? '',
      totalExperienceYears: dto.totalExperienceYears ?? null,
    };
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  async create(
    dto: CreateCandidateDto,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey && companyId && actorUserId) {
      const claim = await this.idempotencyService.executeTransactional<
        ReturnType<typeof mapCandidateToDetail>
      >({
        key: idempotencyKey,
        companyId,
        userId: actorUserId,
        operation: 'CANDIDATE_CREATE',
        requestHash: this.computeRequestHash(dto),
        execute: async (tx) => {
          const result = await this.executeCreate(
            dto,
            actorUserId,
            actorMembershipId,
            companyId,
            requestId,
            tx,
          );
          const detail = result as ReturnType<typeof mapCandidateToDetail>;
          return { resourceType: 'candidate', resourceId: detail.id, responseJson: detail };
        },
      });

      if (claim.status === 'COMPLETED') {
        return claim.responseJson;
      }
      throw new ConflictException({
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'Candidate creation is already in progress for this request.',
      });
    }

    return this.executeCreate(dto, actorUserId, actorMembershipId, companyId, requestId);
  }

  private async executeCreate(
    dto: CreateCandidateDto,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    if (!dto.email && !dto.phone) {
      throw new BadRequestException('At least email or phone is required');
    }

    const normalizedEmail = this.normalizeEmail(dto.email);
    const normalizedPhone = this.normalizePhone(dto.phone);

    const duplicateCheck = await this.deduplicationService.checkBeforeCreate({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      normalizedEmail,
      normalizedPhone,
    });

    if (duplicateCheck.blocked) {
      throw new ConflictException({
        code: 'CANDIDATE_DUPLICATE_EXACT',
        message: 'Candidate with this contact information already exists',
        duplicates: duplicateCheck.duplicates,
      });
    }

    const fingerprint = this.deduplicationService.calculateFingerprint({
      normalizedEmail,
      normalizedPhone,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    const salaryMin = dto.salaryExpectationMin;
    const salaryMax = dto.salaryExpectationMax;

    if (salaryMin !== undefined && salaryMax !== undefined && salaryMax < salaryMin) {
      throw new BadRequestException('Salary maximum cannot be less than minimum');
    }

    const candidate = await client.candidate.create({
      data: {
        firstName: dto.firstName.trim(),
        middleName: dto.middleName?.trim() ?? null,
        lastName: dto.lastName.trim(),
        email: dto.email?.trim() ?? null,
        normalizedEmail,
        phone: dto.phone?.trim() ?? null,
        normalizedPhone,
        alternatePhone: dto.alternatePhone?.trim() ?? null,
        city: dto.city?.trim() ?? null,
        stateOrProvince: dto.stateOrProvince?.trim() ?? null,
        countryCode: dto.countryCode ?? null,
        postalCode: dto.postalCode?.trim() ?? null,
        headline: dto.headline?.trim() ?? null,
        summary: dto.summary?.trim() ?? null,
        currentJobTitle: dto.currentJobTitle?.trim() ?? null,
        currentEmployer: dto.currentEmployer?.trim() ?? null,
        totalExperienceYears: dto.totalExperienceYears ?? null,
        preferredLocale: dto.preferredLocale ?? 'en',
        timezone: dto.timezone ?? 'UTC',
        source: dto.source,
        sourceDetail: dto.sourceDetail?.trim() ?? null,
        linkedInUrl: dto.linkedInUrl?.trim() ?? null,
        portfolioUrl: dto.portfolioUrl?.trim() ?? null,
        personalWebsiteUrl: dto.personalWebsiteUrl?.trim() ?? null,
        willingToRelocate: dto.willingToRelocate ?? null,
        remoteWorkPreference: dto.remoteWorkPreference ?? null,
        salaryExpectationMin: salaryMin ?? null,
        salaryExpectationMax: salaryMax ?? null,
        salaryCurrency: dto.salaryCurrency?.trim() ?? null,
        noticePeriodDays: dto.noticePeriodDays ?? null,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        duplicateFingerprint: fingerprint,
        lastProfileUpdatedAt: new Date(),
        skills: dto.skills?.length
          ? {
              create: dto.skills.map((s) => ({
                skillId: s.skillId,
                proficiencyLevel: s.proficiencyLevel ?? null,
                yearsOfExperience: s.yearsOfExperience ?? null,
                lastUsedAt: s.lastUsedAt ? new Date(s.lastUsedAt) : null,
              })),
            }
          : undefined,
        languages: dto.languages?.length
          ? {
              create: dto.languages.map((l) => ({
                languageCode: l.languageCode,
                proficiency: l.proficiency,
                preferredInterviewLanguage: l.preferredInterviewLanguage ?? false,
              })),
            }
          : undefined,
      },
      include: {
        skills: { include: { skill: true } },
        languages: true,
        employmentRecords: true,
        educationRecords: true,
        certifications: true,
      },
    });

    await this.auditService.record({
      candidateId: candidate.id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_CREATED',
      entityType: 'Candidate',
      entityId: candidate.id,
      description: `Candidate ${candidate.firstName} ${candidate.lastName} created`,
      metadata: { source: dto.source, hasEmail: !!dto.email, hasPhone: !!dto.phone },
      requestId,
      tx,
    });

    // Auto-create CompanyCandidate so recruiter-created candidates appear in company list
    if (companyId) {
      await client.companyCandidate.upsert({
        where: { companyId_candidateId: { companyId, candidateId: candidate.id } },
        update: { lastActivityAt: new Date() },
        create: {
          companyId,
          candidateId: candidate.id,
          status: 'ACTIVE',
          source: dto.source,
          sourceDetail: dto.sourceDetail?.trim() ?? null,
          createdByMembershipId: actorMembershipId ?? null,
          firstSeenAt: new Date(),
          lastActivityAt: new Date(),
        },
      });
    }

    this.logger.log(`Candidate ${candidate.id} created`);
    return mapCandidateToDetail(candidate, false);
  }

  async findAll(query: CandidateQueryDto, hasSensitivePermission: boolean, companyId?: string) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      source,
      jobId,
      applicationStatus,
      minRating,
      exactRating,
      unrated,
      skillId,
      languageCode,
      city,
      countryCode,
      currentJobTitle,
      currentEmployer,
      minimumExperience,
      maximumExperience,
      willingToRelocate,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      archived,
      sortBy,
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    // Applications in these statuses are not "current" pipeline applications.
    // Mirrors the client selection rule (and the ApplicationStatus values that
    // isActiveStatus / selectCurrentApplication treat as terminal on the UI).
    const terminalApplicationStatuses: ApplicationStatus[] = [
      ApplicationStatus.HIRED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
      ApplicationStatus.DISQUALIFIED,
      ApplicationStatus.ARCHIVED,
    ];

    // ── CURRENT-APPLICATION FILTERS (jobId / applicationStatus) ──────────────
    // The candidate table displays each candidate's *current* application,
    // resolved exactly like the client's selectCurrentApplication: the newest
    // active (non-terminal, non-archived) application, or — when the candidate
    // has no active application — the newest application of any status. Prisma
    // `distinct` keeps the first row of each candidateId group AFTER ordering,
    // so two tenant-scoped queries resolve that set: active-newest first (it
    // wins for candidates that have one), then any-status-newest fills the
    // gaps. Pagination and counts then filter by candidateId, so the result is
    // exact, consistent and free of N+1.
    let currentApplicationCandidateIds: string[] | null = null;
    const applicationStatusArr = Array.isArray(applicationStatus)
      ? applicationStatus
      : applicationStatus
        ? [applicationStatus]
        : [];
    if (companyId && (jobId || applicationStatusArr.length)) {
      const currentOrderBy = [
        { updatedAt: 'desc' as const },
        { createdAt: 'desc' as const },
        { id: 'desc' as const },
      ];
      const openApplicationWhere: Prisma.ApplicationWhereInput = {
        companyId,
        deletedAt: null,
        status: { notIn: terminalApplicationStatuses },
      };
      const anyApplicationWhere: Prisma.ApplicationWhereInput = {
        companyId,
        deletedAt: null,
      };
      const currentSelect = { candidateId: true, jobId: true, status: true };

      const [activeNewest, anyNewest] = await Promise.all([
        this.prisma.application.findMany({
          where: openApplicationWhere,
          orderBy: currentOrderBy,
          distinct: ['candidateId'],
          select: currentSelect,
        }),
        this.prisma.application.findMany({
          where: anyApplicationWhere,
          orderBy: currentOrderBy,
          distinct: ['candidateId'],
          select: currentSelect,
        }),
      ]);

      const currentByCandidate = new Map<string, { jobId: string; status: ApplicationStatus }>();
      for (const application of activeNewest) {
        currentByCandidate.set(application.candidateId, application);
      }
      for (const application of anyNewest) {
        if (!currentByCandidate.has(application.candidateId)) {
          currentByCandidate.set(application.candidateId, application);
        }
      }

      currentApplicationCandidateIds = [...currentByCandidate.entries()]
        .filter(
          ([, application]) =>
            (!jobId || application.jobId === jobId) &&
            (!applicationStatusArr.length || applicationStatusArr.includes(application.status)),
        )
        .map(([candidateId]) => candidateId);
    }

    const conditions: Prisma.CandidateWhereInput[] = [];

    // ── COMPANY-SCOPED: only return candidates linked to this company ──────────
    const ratingCondition: Prisma.CompanyCandidateWhereInput = {
      ...(minRating !== undefined ? { rating: { gte: minRating } } : {}),
      ...(exactRating !== undefined ? { rating: { equals: exactRating } } : {}),
      ...(unrated ? { OR: [{ rating: null }, { rating: 0 }] } : {}),
    };
    const hasRatingFilter = Object.keys(ratingCondition).length > 0;
    if (companyId) {
      conditions.push({
        companyCandidates: {
          some: { companyId, deletedAt: null, ...ratingCondition },
        },
      });
    } else if (hasRatingFilter) {
      conditions.push({ companyCandidates: { some: ratingCondition } });
    }

    if (currentApplicationCandidateIds !== null) {
      if (currentApplicationCandidateIds.length === 0) {
        return {
          data: [],
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        };
      }
      conditions.push({ id: { in: currentApplicationCandidateIds } });
    }

    conditions.push({
      status: archived
        ? { in: ['INACTIVE', 'BLOCKED'] as any }
        : { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] as any },
    });

    if (search) {
      conditions.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { headline: { contains: search, mode: 'insensitive' } },
          { currentJobTitle: { contains: search, mode: 'insensitive' } },
          { currentEmployer: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const statusArr = Array.isArray(status) ? status : status ? [status] : [];
    if (statusArr.length) conditions.push({ status: { in: statusArr } });
    const sourceArr = Array.isArray(source) ? source : source ? [source] : [];
    if (sourceArr.length) conditions.push({ source: { in: sourceArr } });
    if (skillId) conditions.push({ skills: { some: { skillId } } });
    if (languageCode) conditions.push({ languages: { some: { languageCode } } });
    if (city) conditions.push({ city: { contains: city, mode: 'insensitive' } });
    if (countryCode) conditions.push({ countryCode });
    if (currentJobTitle)
      conditions.push({ currentJobTitle: { contains: currentJobTitle, mode: 'insensitive' } });
    if (currentEmployer)
      conditions.push({ currentEmployer: { contains: currentEmployer, mode: 'insensitive' } });
    if (minimumExperience !== undefined)
      conditions.push({ totalExperienceYears: { gte: minimumExperience } });
    if (maximumExperience !== undefined)
      conditions.push({ totalExperienceYears: { lte: maximumExperience } });
    if (willingToRelocate !== undefined) conditions.push({ willingToRelocate });
    if (createdFrom) conditions.push({ createdAt: { gte: new Date(createdFrom) } });
    if (createdTo) conditions.push({ createdAt: { lte: new Date(createdTo) } });
    if (updatedFrom) conditions.push({ updatedAt: { gte: new Date(updatedFrom) } });
    if (updatedTo) conditions.push({ updatedAt: { lte: new Date(updatedTo) } });

    const where: Prisma.CandidateWhereInput =
      conditions.length > 1 ? { AND: conditions } : conditions[0];

    const allowedSortFields = [
      'firstName',
      'lastName',
      'createdAt',
      'updatedAt',
      'totalExperienceYears',
      'currentJobTitle',
      'status',
    ];
    const orderField = sortBy && allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderBy = { [orderField]: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          skills: { include: { skill: true }, take: 5 },
          languages: true,
          companyCandidates: companyId
            ? {
                where: { companyId, deletedAt: null },
                select: { rating: true },
              }
            : false,
          applications: companyId
            ? {
                where: { companyId, deletedAt: null },
                orderBy: [
                  { updatedAt: 'desc' as const },
                  { createdAt: 'desc' as const },
                  { id: 'desc' as const },
                ],
                select: { id: true, status: true },
              }
            : false,
        },
      }),
      this.prisma.candidate.count({ where }),
    ]);

    // Attach a tenant-scoped screening summary to every listed candidate.
    // One extra query (no N+1): fetch screening results for all listed
    // candidate ids in a single call and fold them into per-candidate
    // summaries newest-first.
    let screeningMap = new Map<string, CandidateScreeningSummary>();
    if (companyId && data.length > 0) {
      const terminalSet = new Set<ApplicationStatus>(terminalApplicationStatuses);
      const applicationToCandidate = new Map<string, string>();
      for (const candidate of data) {
        const applications = candidate.applications ?? [];
        const current =
          applications.find((application) => !terminalSet.has(application.status)) ??
          applications[0];
        if (current) applicationToCandidate.set(current.id, candidate.id);
      }

      const screeningResults = await this.prisma.aiScreeningResult.findMany({
        where: {
          companyId,
          applicationId: { in: [...applicationToCandidate.keys()] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          applicationId: true,
          candidateId: true,
          status: true,
          overallScore: true,
          recommendation: true,
          confidence: true,
          completedAt: true,
          createdAt: true,
        },
      });
      screeningMap = buildScreeningSummaryMap(
        screeningResults.map((result) => ({
          ...result,
          candidateId: applicationToCandidate.get(result.applicationId)!,
        })),
      );
    }

    return {
      data: data.map((c) =>
        mapCandidateToResponse(
          { ...c, screeningSummary: screeningMap.get(c.id) ?? null },
          hasSensitivePermission,
        ),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Whole-company screening score summary for dashboards. Mirrors the
  // per-candidate semantics of findAll: for each tenant candidate the score
  // comes from the LATEST COMPLETED screening of their current application.
  // Candidates without a completed screening are excluded from the average
  // (a real score of 0 is preserved — only NULL is treated as "not scored").
  // Top candidates are the 5 highest-scoring candidates, deterministically
  // ordered (score desc, id asc as tiebreak). The response is bounded, so the
  // dashboard never needs an unbounded list fetch. This implementation still
  // scans the tenant's candidates in memory; server-side batching or a SQL
  // aggregate is a scalability follow-up for very large tenants.
  async getScreeningScoreSummary(companyId?: string) {
    if (!companyId) {
      throw new BadRequestException('Active company context is required');
    }

    // Interviews scheduled "today" is independent of the candidate set, so it
    // is resolved up front against the tenant's own timezone. This is a real
    // tenant-wide COUNT — not a slice of the dashboard's paged interview list.
    const interviewsToday = await this.countInterviewsScheduledToday(companyId);

    const conditions: Prisma.CandidateWhereInput[] = [];

    // ── COMPANY-SCOPED: only candidates linked to this company ──────────
    conditions.push({
      companyCandidates: { some: { companyId, deletedAt: null } },
    });

    conditions.push({
      status: {
        notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] as CandidateStatus[],
      },
    });

    const where: Prisma.CandidateWhereInput =
      conditions.length > 1 ? { AND: conditions } : conditions[0];

    const candidates = await this.prisma.candidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        currentJobTitle: true,
      },
    });

    const totalCandidates = candidates.length;
    if (totalCandidates === 0) {
      return {
        totalCandidates: 0,
        scoredCandidates: 0,
        averageScore: null,
        topCandidates: [],
        attention: { newApplications: 0, awaitingScreening: 0, interviewsToday },
      };
    }

    const candidateIds = candidates.map((c) => c.id);

    // Current (non-terminal first, newest first) application per candidate —
    // same selection rule as findAll so the aggregate matches the aiScore a
    // user sees on the candidates page.
    const applications = await this.prisma.application.findMany({
      where: { companyId, candidateId: { in: candidateIds }, deletedAt: null },
      orderBy: [
        { updatedAt: 'desc' as const },
        { createdAt: 'desc' as const },
        { id: 'desc' as const },
      ],
      select: { id: true, candidateId: true, status: true, job: { select: { title: true } } },
    });

    const terminalStatuses = new Set<ApplicationStatus>([
      ApplicationStatus.HIRED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
      ApplicationStatus.DISQUALIFIED,
      ApplicationStatus.ARCHIVED,
    ]);

    const appsByCandidateId = new Map<string, typeof applications>();
    for (const app of applications) {
      const list = appsByCandidateId.get(app.candidateId) ?? [];
      list.push(app);
      appsByCandidateId.set(app.candidateId, list);
    }

    const currentAppByCandidate = new Map<
      string,
      { id: string; status: string; jobTitle: string | null }
    >();
    const applicationToCandidate = new Map<string, string>();
    for (const [candidateId, apps] of appsByCandidateId) {
      const current = apps.find((app) => !terminalStatuses.has(app.status)) ?? apps[0];
      if (current) {
        currentAppByCandidate.set(candidateId, {
          id: current.id,
          status: current.status,
          jobTitle: current.job?.title ?? null,
        });
        applicationToCandidate.set(current.id, candidateId);
      }
    }

    // Latest-result semantics per candidate via the shared summary builder
    // (one tenant-scoped screening query, no N+1).
    let screeningMap = new Map<string, CandidateScreeningSummary>();
    if (applicationToCandidate.size > 0) {
      const screeningResults = await this.prisma.aiScreeningResult.findMany({
        where: {
          companyId,
          applicationId: { in: [...applicationToCandidate.keys()] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          applicationId: true,
          candidateId: true,
          status: true,
          overallScore: true,
          recommendation: true,
          confidence: true,
          completedAt: true,
          createdAt: true,
        },
      });
      screeningMap = buildScreeningSummaryMap(
        screeningResults.map((result) => ({
          ...result,
          candidateId: applicationToCandidate.get(result.applicationId)!,
        })),
      );
    }

    let scoreSum = 0;
    let scoredCount = 0;
    const scored: {
      candidateId: string;
      displayName: string;
      currentJobTitle: string | null;
      jobTitle: string | null;
      status: string | null;
      overallScore: number;
    }[] = [];

    for (const candidate of candidates) {
      const summary = screeningMap.get(candidate.id);
      if (!summary || summary.overallScore === null) continue;
      scoreSum += summary.overallScore;
      scoredCount++;
      // Top-candidate parity with the dashboard: candidates whose current
      // application is terminal (hired/rejected/withdrawn/disqualified) or
      // who have no application are excluded from the ranking, but still
      // count toward the average.
      const currentApp = currentAppByCandidate.get(candidate.id);
      if (currentApp && !terminalStatuses.has(currentApp.status as ApplicationStatus)) {
        scored.push({
          candidateId: candidate.id,
          displayName: `${candidate.firstName} ${candidate.lastName}`.trim(),
          currentJobTitle: candidate.currentJobTitle,
          jobTitle: currentApp.jobTitle,
          status: currentApp.status,
          overallScore: summary.overallScore,
        });
      }
    }

    scored.sort(
      (a, b) => b.overallScore - a.overallScore || a.candidateId.localeCompare(b.candidateId),
    );

    // Attention counts are tenant-wide totals over every candidate, not the
    // first page the dashboard happens to hold. "Applied" mirrors the
    // frontend display mapping (DRAFT/SUBMITTED/ON_HOLD); "awaiting screening"
    // mirrors the per-candidate `!screening || screening.status !== COMPLETED`
    // rule so the card agrees with the candidates table.
    const appliedStatuses = new Set<string>([
      ApplicationStatus.DRAFT,
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.ON_HOLD,
    ]);
    let newApplications = 0;
    let awaitingScreening = 0;
    for (const candidate of candidates) {
      const currentApp = currentAppByCandidate.get(candidate.id);
      if (currentApp && appliedStatuses.has(currentApp.status)) {
        newApplications++;
      }
      const summary = screeningMap.get(candidate.id);
      if (!summary || summary.status !== 'COMPLETED') {
        awaitingScreening++;
      }
    }

    return {
      totalCandidates,
      scoredCandidates: scoredCount,
      averageScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : null,
      topCandidates: scored.slice(0, 5),
      attention: { newApplications, awaitingScreening, interviewsToday },
    };
  }

  // Counts tenant interviews scheduled for the tenant's current calendar day.
  // "Today" is resolved in the company's configured timezone (falling back to
  // UTC) so the count matches the recruiter's local day rather than the
  // server's. Active states match the frontend "Scheduled" group
  // (SCHEDULED/CONFIRMED/RESCHEDULED/IN_PROGRESS); completed, cancelled,
  // no-show and expired interviews are excluded.
  private async countInterviewsScheduledToday(companyId: string): Promise<number> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    const { start, end } = this.getLocalDayBounds(new Date(), company?.timezone || 'UTC');

    return this.prisma.interview.count({
      where: {
        companyId,
        deletedAt: null,
        status: {
          in: [
            InterviewStatus.SCHEDULED,
            InterviewStatus.CONFIRMED,
            InterviewStatus.RESCHEDULED,
            InterviewStatus.IN_PROGRESS,
          ],
        },
        scheduledAt: { gte: start, lt: end },
      },
    });
  }

  // UTC instants bounding the local calendar day of `now` in `timeZone`.
  // Resolves the local date via Intl, then removes the zone offset at that
  // instant to recover the corresponding UTC midnight. Invalid timezones fall
  // back to UTC.
  private getLocalDayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
    const resolveParts = (tz: string) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);

    let parts: Intl.DateTimeFormatPart[];
    let zone = timeZone;
    try {
      parts = resolveParts(zone);
    } catch {
      zone = 'UTC';
      parts = resolveParts(zone);
    }

    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const localMidnightAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'));
    const offsetMs = this.getTimeZoneOffsetMs(new Date(localMidnightAsUtc), zone);
    const start = new Date(localMidnightAsUtc - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }

  // Milliseconds to add to a UTC instant to reach `timeZone` wall-clock time.
  private getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour') % 24,
      value('minute'),
      value('second'),
    );
    return asUtc - date.getTime();
  }

  async findById(id: string, hasSensitivePermission: boolean, companyId?: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        skills: { include: { skill: true }, orderBy: { createdAt: 'desc' } },
        employmentRecords: { orderBy: { sortOrder: 'asc' } },
        educationRecords: { orderBy: { sortOrder: 'asc' } },
        certifications: true,
        languages: true,
        consents: { orderBy: { createdAt: 'desc' } },
        mergeRecordsAsPrimary: true,
      },
    });

    if (!candidate || candidate.status === 'DELETED' || candidate.status === 'ANONYMIZED') {
      throw new NotFoundException(`Candidate with ID ${id} not found`);
    }

    // Tenant isolation: if companyId is provided, ensure the candidate
    // belongs to the requesting company via a non-deleted CompanyCandidate link.
    if (companyId) {
      const link = await this.prisma.companyCandidate.findFirst({
        where: { candidateId: id, companyId, deletedAt: null },
      });
      if (!link) {
        throw new NotFoundException(`Candidate with ID ${id} not found`);
      }
    }

    return mapCandidateToDetail(candidate, hasSensitivePermission);
  }

  async update(
    id: string,
    dto: UpdateCandidateDto,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.candidate.findUnique({ where: { id } });

    if (!existing || existing.status === 'DELETED' || existing.status === 'ANONYMIZED') {
      throw new NotFoundException(`Candidate with ID ${id} not found`);
    }

    if (existing.status === 'MERGED') {
      throw new BadRequestException('Cannot update a merged candidate');
    }

    if (existing.version !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'CANDIDATE_STALE_VERSION',
        message: 'Candidate was modified by another user. Refresh and retry.',
        currentVersion: existing.version,
      });
    }

    const normalizedEmail = this.normalizeEmail(dto.email ?? existing.email);
    const normalizedPhone = this.normalizePhone(dto.phone ?? existing.phone);

    const contactChanged =
      (dto.email !== undefined && this.normalizeEmail(dto.email) !== existing.normalizedEmail) ||
      (dto.phone !== undefined && this.normalizePhone(dto.phone) !== existing.normalizedPhone);

    if (contactChanged) {
      const check = await this.deduplicationService.checkBeforeCreate({
        firstName: dto.firstName ?? existing.firstName,
        lastName: dto.lastName ?? existing.lastName,
        email: dto.email ?? existing.email,
        phone: dto.phone ?? existing.phone,
        normalizedEmail,
        normalizedPhone,
        excludeCandidateId: id,
      });
      if (check.blocked) {
        throw new ConflictException({
          code: 'CANDIDATE_DUPLICATE_EXACT',
          message: 'Updated contact information matches an existing candidate',
          duplicates: check.duplicates,
        });
      }
    }

    const salaryMin = dto.salaryExpectationMin;
    const salaryMax = dto.salaryExpectationMax;
    if (salaryMin !== undefined && salaryMax !== undefined && salaryMax < salaryMin) {
      throw new BadRequestException('Salary maximum cannot be less than minimum');
    }

    const changedFields: string[] = [];
    const fieldsToCheck = [
      'firstName',
      'middleName',
      'lastName',
      'email',
      'phone',
      'alternatePhone',
      'city',
      'stateOrProvince',
      'countryCode',
      'postalCode',
      'headline',
      'summary',
      'currentJobTitle',
      'currentEmployer',
      'totalExperienceYears',
      'preferredLocale',
      'timezone',
      'linkedInUrl',
      'portfolioUrl',
      'personalWebsiteUrl',
      'willingToRelocate',
      'remoteWorkPreference',
      'salaryExpectationMin',
      'salaryExpectationMax',
      'salaryCurrency',
      'noticePeriodDays',
      'availableFrom',
      'source',
      'sourceDetail',
    ];

    for (const field of fieldsToCheck) {
      if ((dto as any)[field] !== undefined && (dto as any)[field] !== (existing as any)[field]) {
        changedFields.push(field);
      }
    }

    const fingerprint = this.deduplicationService.calculateFingerprint({
      normalizedEmail,
      normalizedPhone,
      firstName: dto.firstName ?? existing.firstName,
      lastName: dto.lastName ?? existing.lastName,
    });

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.middleName !== undefined ? { middleName: dto.middleName?.trim() ?? null } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() ?? null, normalizedEmail } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() ?? null, normalizedPhone } : {}),
        ...(dto.alternatePhone !== undefined
          ? { alternatePhone: dto.alternatePhone?.trim() ?? null }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() ?? null } : {}),
        ...(dto.stateOrProvince !== undefined
          ? { stateOrProvince: dto.stateOrProvince?.trim() ?? null }
          : {}),
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode ?? null } : {}),
        ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode?.trim() ?? null } : {}),
        ...(dto.headline !== undefined ? { headline: dto.headline?.trim() ?? null } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary?.trim() ?? null } : {}),
        ...(dto.currentJobTitle !== undefined
          ? { currentJobTitle: dto.currentJobTitle?.trim() ?? null }
          : {}),
        ...(dto.currentEmployer !== undefined
          ? { currentEmployer: dto.currentEmployer?.trim() ?? null }
          : {}),
        ...(dto.totalExperienceYears !== undefined
          ? { totalExperienceYears: dto.totalExperienceYears }
          : {}),
        ...(dto.preferredLocale !== undefined ? { preferredLocale: dto.preferredLocale } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.sourceDetail !== undefined
          ? { sourceDetail: dto.sourceDetail?.trim() ?? null }
          : {}),
        ...(dto.linkedInUrl !== undefined ? { linkedInUrl: dto.linkedInUrl?.trim() ?? null } : {}),
        ...(dto.portfolioUrl !== undefined
          ? { portfolioUrl: dto.portfolioUrl?.trim() ?? null }
          : {}),
        ...(dto.personalWebsiteUrl !== undefined
          ? { personalWebsiteUrl: dto.personalWebsiteUrl?.trim() ?? null }
          : {}),
        ...(dto.willingToRelocate !== undefined
          ? { willingToRelocate: dto.willingToRelocate }
          : {}),
        ...(dto.remoteWorkPreference !== undefined
          ? { remoteWorkPreference: dto.remoteWorkPreference }
          : {}),
        ...(dto.salaryExpectationMin !== undefined
          ? { salaryExpectationMin: dto.salaryExpectationMin }
          : {}),
        ...(dto.salaryExpectationMax !== undefined
          ? { salaryExpectationMax: dto.salaryExpectationMax }
          : {}),
        ...(dto.salaryCurrency !== undefined
          ? { salaryCurrency: dto.salaryCurrency?.trim() ?? null }
          : {}),
        ...(dto.noticePeriodDays !== undefined ? { noticePeriodDays: dto.noticePeriodDays } : {}),
        ...(dto.availableFrom !== undefined
          ? { availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null }
          : {}),
        duplicateFingerprint: fingerprint,
        version: existing.version + 1,
        lastProfileUpdatedAt: new Date(),
      },
      include: {
        skills: { include: { skill: true } },
        languages: true,
        employmentRecords: { orderBy: { sortOrder: 'asc' } },
        educationRecords: { orderBy: { sortOrder: 'asc' } },
        certifications: true,
      },
    });

    await this.auditService.record({
      candidateId: id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_UPDATED',
      entityType: 'Candidate',
      entityId: id,
      description: `Candidate ${updated.firstName} ${updated.lastName} updated`,
      metadata: { changedFields },
      requestId,
    });

    this.logger.log(`Candidate ${id} updated (v${updated.version})`);
    return mapCandidateToDetail(updated, false);
  }

  async archive(
    id: string,
    expectedVersion: number,
    reason?: string,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.candidate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Candidate with ID ${id} not found`);
    if (
      existing.status === 'MERGED' ||
      existing.status === 'DELETED' ||
      existing.status === 'ANONYMIZED'
    ) {
      throw new BadRequestException('Cannot archive a merged, deleted, or anonymized candidate');
    }
    if (existing.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: existing.version,
      });
    }
    if (existing.status === 'INACTIVE') return { archived: true, status: 'already_archived' };

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: { status: 'INACTIVE', version: existing.version + 1, deletedAt: new Date() },
    });

    await this.auditService.record({
      candidateId: id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_ARCHIVED',
      entityType: 'Candidate',
      entityId: id,
      description: `Candidate ${updated.firstName} ${updated.lastName} archived`,
      metadata: reason ? { reason } : undefined,
      requestId,
    });

    return { archived: true, version: updated.version };
  }

  async restore(
    id: string,
    expectedVersion: number,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.candidate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Candidate with ID ${id} not found`);
    if (existing.status === 'MERGED' || existing.status === 'ANONYMIZED') {
      throw new BadRequestException('Cannot restore a merged or anonymized candidate');
    }
    if (existing.status !== 'INACTIVE') return { restored: true, status: 'already_active' };
    if (existing.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: existing.version,
      });
    }

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: { status: 'ACTIVE', version: existing.version + 1, deletedAt: null },
    });

    await this.auditService.record({
      candidateId: id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_RESTORED',
      entityType: 'Candidate',
      entityId: id,
      description: `Candidate ${updated.firstName} ${updated.lastName} restored`,
      requestId,
    });

    return { restored: true, version: updated.version };
  }

  /**
   * Soft-delete a candidate (status DELETED + deletedAt). The candidate and its
   * company-scoped applications/links disappear from every active UI, report
   * and metric while the historical recruitment records remain intact in the
   * database for audit/reporting integrity.
   */
  async deleteCandidate(
    id: string,
    expectedVersion: number,
    reason: string | undefined,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.candidate.findFirst({
      where: {
        id,
        // Tenant scope: a candidate must be linked to this company. The link's
        // deletedAt is intentionally NOT filtered so a repeat delete on an
        // already-soft-deleted candidate still resolves it (idempotent
        // already_deleted) while cross-company ids keep returning 404.
        ...(companyId ? { companyCandidates: { some: { companyId } } } : {}),
      },
    });
    if (!existing) throw new NotFoundException('Candidate not found');
    if (existing.status === 'DELETED') return { deleted: true, status: 'already_deleted' };
    if (existing.status === 'MERGED' || existing.status === 'ANONYMIZED') {
      throw new BadRequestException('Cannot delete a merged or anonymized candidate');
    }
    if (existing.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: existing.version,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.candidate.update({
        where: { id },
        data: { status: 'DELETED', version: existing.version + 1, deletedAt: new Date() },
      });
      if (companyId) {
        await tx.application.updateMany({
          where: { companyId, candidateId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await tx.companyCandidate.updateMany({
          where: { companyId, candidateId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }
    });

    await this.auditService.record({
      candidateId: id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_DELETED',
      entityType: 'Candidate',
      entityId: id,
      description: `Candidate ${existing.firstName} ${existing.lastName} deleted`,
      metadata: reason ? { reason } : undefined,
      requestId,
    });

    return { deleted: true, version: existing.version + 1 };
  }

  async block(
    id: string,
    reasonCode: string,
    reason: string,
    expectedVersion: number,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.candidate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Candidate with ID ${id} not found`);
    if (
      existing.status === 'MERGED' ||
      existing.status === 'DELETED' ||
      existing.status === 'ANONYMIZED'
    ) {
      throw new BadRequestException('Cannot block a merged, deleted, or anonymized candidate');
    }
    if (existing.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: existing.version,
      });
    }

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: { status: 'BLOCKED', version: existing.version + 1 },
    });

    await this.auditService.record({
      candidateId: id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_BLOCKED',
      entityType: 'Candidate',
      entityId: id,
      description: `Candidate ${updated.firstName} ${updated.lastName} blocked`,
      metadata: { reasonCode, reason },
      requestId,
    });

    return { blocked: true, version: updated.version };
  }

  async unblock(
    id: string,
    expectedVersion: number,
    actorUserId?: string,
    actorMembershipId?: string | null,
    companyId?: string,
    requestId?: string,
  ) {
    const existing = await this.prisma.candidate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Candidate with ID ${id} not found`);
    if (existing.status !== 'BLOCKED') return { unblocked: true, status: 'not_blocked' };
    if (existing.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CANDIDATE_STALE_VERSION',
        message: 'Stale version',
        currentVersion: existing.version,
      });
    }

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: { status: 'ACTIVE', version: existing.version + 1 },
    });

    await this.auditService.record({
      candidateId: id,
      companyId,
      actorUserId,
      actorMembershipId,
      eventType: 'CANDIDATE_UNBLOCKED',
      entityType: 'Candidate',
      entityId: id,
      description: `Candidate ${updated.firstName} ${updated.lastName} unblocked`,
      requestId,
    });

    return { unblocked: true, version: updated.version };
  }

  async getActivity(id: string, page = 1, limit = 20, eventType?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CandidateAuditEventWhereInput = { candidateId: id };
    if (eventType) where.eventType = eventType as any;

    const [data, total] = await Promise.all([
      this.prisma.candidateAuditEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.candidateAuditEvent.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
