import { Injectable, ConflictException } from '@nestjs/common';
import { InterviewStatus, InterviewParticipantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';

// Tenant-scoped overlap validation for interviews.
//
// Semantics:
// - Only NON-terminal interviews block a slot (CANCELLED, COMPLETED, NO_SHOW,
//   EXPIRED interviews do not).
// - The CANDIDATE is blocked across all of their applications in the company.
// - Explicitly assigned participants (membershipId) block the slot unless
//   their participant status is DECLINED or CANCELLED.
// - Adjacent slots are allowed: [a, b) and [b, c) do not conflict.
// - All comparisons are performed on normalized UTC instants (Date objects),
//   so timezone offset is irrelevant.
// - P1 (documented, not implemented): provider capacity (meetingProvider) is
//   not modeled — capacity is assumed 1 and provider-level concurrency is not
//   validated. The check intentionally prevents candidate and explicitly
//   assigned interviewer overlap only.
//
// Concurrency: callers run this check INSIDE a Serializable transaction, so
// two simultaneous requests for the same exclusive participant cannot both
// pass; the loser aborts with a serialization failure which callers convert
// into a 409 conflict.

export type InterviewConflictKind = 'CANDIDATE' | 'PARTICIPANT';

export interface InterviewConflict {
  kind: InterviewConflictKind;
  interviewId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  participantMembershipId?: string;
  participantRole?: string;
}

export interface ConflictCheckInput {
  companyId: string;
  candidateId: string;
  /** Explicitly assigned participants (interviewers, hiring managers, ...) */
  membershipIds: string[];
  newStart: Date;
  newEnd: Date;
  /** Interview to ignore (used when rescheduling itself) */
  excludeInterviewId?: string;
}

export const CONFLICT_TERMINAL_STATUSES: InterviewStatus[] = [
  InterviewStatus.CANCELLED,
  InterviewStatus.COMPLETED,
  InterviewStatus.EXPIRED,
  InterviewStatus.NO_SHOW,
];

const EXCLUDED_PARTICIPANT_STATUSES: InterviewParticipantStatus[] = [
  InterviewParticipantStatus.DECLINED,
  InterviewParticipantStatus.CANCELLED,
];

// Matches the DTO max duration (480 min); bounds the fetch window to
// [newStart - MAX_DURATION, newEnd) so the query stays small.
const MAX_DURATION_MINUTES = 480;

@Injectable()
export class InterviewConflictService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds all tenant-scoped conflicts for the requested slot.
   * Never queries outside the given company, so no cross-tenant data is
   * exposed through the response.
   */
  async findConflicts(
    tx: Prisma.TransactionClient,
    input: ConflictCheckInput,
  ): Promise<InterviewConflict[]> {
    const { companyId, candidateId, membershipIds, newStart, newEnd, excludeInterviewId } = input;
    const searchStart = new Date(newStart.getTime() - MAX_DURATION_MINUTES * 60000);

    const candidates = new Set(membershipIds.filter((id): id is string => Boolean(id)));

    const interviews = await tx.interview.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { notIn: CONFLICT_TERMINAL_STATUSES },
        ...(excludeInterviewId ? { id: { not: excludeInterviewId } } : {}),
        // Lower bound keeps the query bounded; exact end overlap is filtered
        // in memory because end = scheduledAt + durationMinutes is not
        // expressible as a Prisma where clause.
        scheduledAt: { gte: searchStart, lt: newEnd },
      },
      include: {
        application: { select: { candidateId: true } },
        participants: {
          where: { status: { notIn: EXCLUDED_PARTICIPANT_STATUSES } },
          select: { membershipId: true, role: true, status: true },
        },
      },
    });

    const conflicts: InterviewConflict[] = [];

    for (const interview of interviews) {
      // Defensive in-memory guards (the query filters these too, but this
      // keeps the semantics exact regardless of query drift or test mocks).
      if (CONFLICT_TERMINAL_STATUSES.includes(interview.status as InterviewStatus)) continue;
      if (excludeInterviewId && interview.id === excludeInterviewId) continue;

      const existingEnd = new Date(
        interview.scheduledAt.getTime() + interview.durationMinutes * 60000,
      );
      // Adjacent slots are allowed; only real overlaps conflict.
      if (existingEnd <= newStart || interview.scheduledAt >= newEnd) continue;

      if (interview.application?.candidateId === candidateId) {
        conflicts.push({
          kind: 'CANDIDATE',
          interviewId: interview.id,
          title: interview.title,
          scheduledAt: interview.scheduledAt.toISOString(),
          durationMinutes: interview.durationMinutes,
        });
        continue; // candidate conflict is the highest-priority signal for this interview
      }

      for (const p of interview.participants) {
        if (!p.membershipId || !candidates.has(p.membershipId)) continue;
        if (
          p.status &&
          EXCLUDED_PARTICIPANT_STATUSES.includes(p.status as InterviewParticipantStatus)
        ) {
          continue;
        }
        conflicts.push({
          kind: 'PARTICIPANT',
          interviewId: interview.id,
          title: interview.title,
          scheduledAt: interview.scheduledAt.toISOString(),
          durationMinutes: interview.durationMinutes,
          participantMembershipId: p.membershipId,
          participantRole: p.role,
        });
      }
    }

    return conflicts;
  }

  /**
   * Same as findConflicts but throws a structured 409 ConflictException when
   * any conflict exists.
   */
  async assertNoConflict(tx: Prisma.TransactionClient, input: ConflictCheckInput): Promise<void> {
    const conflicts = await this.findConflicts(tx, input);
    if (conflicts.length === 0) return;

    const kinds = [...new Set(conflicts.map((c) => c.kind))];
    const detail = kinds.includes('CANDIDATE')
      ? 'The candidate already has an interview in this time slot.'
      : 'One or more participants already have an interview in this time slot.';

    throw new ConflictException({
      code: 'INTERVIEW_SLOT_CONFLICT',
      message: `Interview slot conflict: ${detail}`,
      conflicts,
    });
  }
}
