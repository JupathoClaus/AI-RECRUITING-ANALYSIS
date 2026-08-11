import { Test, TestingModule } from '@nestjs/testing';
import { InterviewConflictService } from '../services/interview-conflict.service';
import { PrismaService } from '@database/prisma/prisma.service';

const mockPrisma = {};

describe('InterviewConflictService', () => {
  let service: InterviewConflictService;
  let tx: any;

  const now = Date.now();
  const at = (hoursFromNow: number) => new Date(now + hoursFromNow * 3600000);

  function makeInterview(
    id: string,
    scheduledAt: Date,
    durationMinutes: number,
    opts: {
      status?: string;
      candidateId?: string;
      participantIds?: string[];
      roles?: string[];
      participantStatuses?: string[];
    } = {},
  ) {
    return {
      id,
      title: `Interview ${id}`,
      scheduledAt,
      durationMinutes,
      status: opts.status ?? 'SCHEDULED',
      application: { candidateId: opts.candidateId ?? 'cand-other' },
      participants: (opts.participantIds ?? []).map((membershipId, i) => ({
        membershipId,
        role: opts.roles?.[i] ?? 'INTERVIEWER',
        status: opts.participantStatuses?.[i] ?? 'CONFIRMED',
      })),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InterviewConflictService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InterviewConflictService>(InterviewConflictService);
    tx = { interview: { findMany: jest.fn() } };
  });

  const input = (
    overrides: Partial<{
      companyId: string;
      candidateId: string;
      membershipIds: string[];
      newStart: Date;
      newEnd: Date;
      excludeInterviewId: string;
    }> = {},
  ) => ({
    companyId: 'company-1',
    candidateId: 'cand-1',
    membershipIds: [],
    newStart: at(1),
    newEnd: at(2),
    ...overrides,
  });

  it('allows adjacent slots (end == start)', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(2), 60, { candidateId: 'cand-1' }),
    ]);
    const conflicts = await service.findConflicts(tx, input({ newStart: at(1), newEnd: at(2) }));
    expect(conflicts).toHaveLength(0);
  });

  it('allows adjacent slots (start == previous end)', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { candidateId: 'cand-1' }),
    ]);
    const conflicts = await service.findConflicts(tx, input({ newStart: at(2), newEnd: at(3) }));
    expect(conflicts).toHaveLength(0);
  });

  it('rejects a partially overlapping candidate slot', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { candidateId: 'cand-1' }), // 1:00-2:00
    ]);
    const conflicts = await service.findConflicts(
      tx,
      input({ newStart: at(1.5), newEnd: at(2.5) }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'CANDIDATE', interviewId: 'i1' });
  });

  it('rejects a containing interval (new inside existing)', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 180, { candidateId: 'cand-1' }), // 1:00-4:00
    ]);
    const conflicts = await service.findConflicts(tx, input({ newStart: at(2), newEnd: at(3) }));
    expect(conflicts).toHaveLength(1);
  });

  it('rejects a contained interval (existing inside new)', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(2), 60, { candidateId: 'cand-1' }), // 2:00-3:00
    ]);
    const conflicts = await service.findConflicts(tx, input({ newStart: at(1), newEnd: at(4) }));
    expect(conflicts).toHaveLength(1);
  });

  it('does not block on cancelled/completed/expired/no-show interviews', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { status: 'CANCELLED', candidateId: 'cand-1' }),
      makeInterview('i2', at(1.5), 60, { status: 'COMPLETED', candidateId: 'cand-1' }),
    ]);
    const conflicts = await service.findConflicts(tx, input({ newStart: at(1), newEnd: at(3) }));
    expect(conflicts).toHaveLength(0);
  });

  it('rejects an overlapping explicitly assigned interviewer', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { participantIds: ['member-9'], roles: ['INTERVIEWER'] }),
    ]);
    const conflicts = await service.findConflicts(
      tx,
      input({ membershipIds: ['member-9'], newStart: at(1), newEnd: at(2) }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'PARTICIPANT',
      participantMembershipId: 'member-9',
      participantRole: 'INTERVIEWER',
    });
  });

  it('ignores declined or cancelled participants', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, {
        participantIds: ['member-9'],
        participantStatuses: ['DECLINED'],
      }),
    ]);
    const conflicts = await service.findConflicts(
      tx,
      input({ membershipIds: ['member-9'], newStart: at(1), newEnd: at(2) }),
    );
    expect(conflicts).toHaveLength(0);
  });

  it('ignores participants that are not in the requested set', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { participantIds: ['member-1'], roles: ['INTERVIEWER'] }),
    ]);
    const conflicts = await service.findConflicts(
      tx,
      input({ membershipIds: ['member-2'], newStart: at(1), newEnd: at(2) }),
    );
    expect(conflicts).toHaveLength(0);
  });

  it('excludes the interview being rescheduled itself', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { candidateId: 'cand-1' }),
    ]);
    const conflicts = await service.findConflicts(
      tx,
      input({ excludeInterviewId: 'i1', newStart: at(1), newEnd: at(2) }),
    );
    expect(conflicts).toHaveLength(0);
  });

  it('checks candidate overlap across their other applications', async () => {
    // Interview belongs to application for the SAME candidate via a different
    // application — application.candidateId is what matters.
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { candidateId: 'cand-1' }),
    ]);
    const conflicts = await service.findConflicts(tx, input({ newStart: at(1), newEnd: at(2) }));
    expect(conflicts).toHaveLength(1);
  });

  it('is tenant-scoped: only queries the requesting company', async () => {
    tx.interview.findMany.mockResolvedValue([]);
    await service.findConflicts(tx, input({ companyId: 'company-1' }));
    expect(tx.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-1' }),
      }),
    );
  });

  it('normalizes timezone offsets (comparison on UTC instants)', async () => {
    // The same instant expressed with a +02:00 offset parses to the same UTC
    // Date, so an offset-bearing slot still conflicts with a UTC-stored one.
    const base = at(1);
    const isoWithOffset = new Date(base.getTime() + 2 * 3600000)
      .toISOString()
      .replace('Z', '+02:00');
    const localStart = new Date(isoWithOffset);
    expect(localStart.getTime()).toBe(base.getTime());

    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', base, 60, { candidateId: 'cand-1' }),
    ]);
    const conflicts = await service.findConflicts(
      tx,
      input({ newStart: localStart, newEnd: new Date(localStart.getTime() + 3600000) }),
    );
    expect(conflicts).toHaveLength(1);
  });

  it('assertNoConflict throws a structured 409 conflict', async () => {
    tx.interview.findMany.mockResolvedValue([
      makeInterview('i1', at(1), 60, { candidateId: 'cand-1' }),
    ]);
    await expect(
      service.assertNoConflict(tx, input({ newStart: at(1), newEnd: at(2) })),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'INTERVIEW_SLOT_CONFLICT',
        conflicts: [expect.objectContaining({ kind: 'CANDIDATE' })],
      },
    });
  });

  it('assertNoConflict passes when no conflicts exist', async () => {
    tx.interview.findMany.mockResolvedValue([]);
    await expect(
      service.assertNoConflict(tx, input({ newStart: at(1), newEnd: at(2) })),
    ).resolves.toBeUndefined();
  });
});
