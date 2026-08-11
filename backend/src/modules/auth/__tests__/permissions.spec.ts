import { ExecutionContext } from '@nestjs/common';
import { DEFAULT_PERMISSIONS, ROLE_PERMISSIONS } from '../constants/auth.constants';
import { PermissionsGuard } from '../guards/permissions.guard';

const INTERVIEW_SCHEDULING_PERMISSIONS = [
  'interviews.create',
  'interviews.read',
  'interviews.update',
  'interviews.reschedule',
  'interviews.cancel',
  'interviews.complete',
  'interviews.record_result',
  'interviews.manage_participants',
] as const;

const ALL_INTERVIEW_PERMISSIONS = [
  ...INTERVIEW_SCHEDULING_PERMISSIONS,
  'interviews.review',
] as const;

describe('DEFAULT_PERMISSIONS', () => {
  it('defines all interview permissions used by controllers', () => {
    const definedCodes = DEFAULT_PERMISSIONS.map((p) => p.code);
    for (const perm of ALL_INTERVIEW_PERMISSIONS) {
      expect(definedCodes).toContain(perm);
    }
  });

  it('does not have duplicate codes', () => {
    const codes = DEFAULT_PERMISSIONS.map((p) => p.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('has stable resource.action format for all entries', () => {
    for (const p of DEFAULT_PERMISSIONS) {
      expect(p.code).toBe(`${p.resource}.${p.action}`);
    }
  });
});

describe('ROLE_PERMISSIONS', () => {
  describe('COMPANY_ADMIN', () => {
    const perms = ROLE_PERMISSIONS['COMPANY_ADMIN'];
    it('has all interview permissions', () => {
      for (const perm of ALL_INTERVIEW_PERMISSIONS) {
        expect(perms).toContain(perm);
      }
    });
  });

  describe('HR_MANAGER', () => {
    const perms = ROLE_PERMISSIONS['HR_MANAGER'];
    it('has all interview permissions', () => {
      for (const perm of ALL_INTERVIEW_PERMISSIONS) {
        expect(perms).toContain(perm);
      }
    });
    it('does not include company.manage_members', () => {
      expect(perms).not.toContain('company.manage_members');
    });
  });

  describe('RECRUITER', () => {
    const perms = ROLE_PERMISSIONS['RECRUITER'];
    it('has all interview scheduling permissions', () => {
      for (const perm of INTERVIEW_SCHEDULING_PERMISSIONS) {
        expect(perms).toContain(perm);
      }
    });
    it('does not have review permission', () => {
      expect(perms).not.toContain('interviews.review');
    });
  });

  describe('HIRING_MANAGER', () => {
    const perms = ROLE_PERMISSIONS['HIRING_MANAGER'];
    it('has read and review but no write or scheduling permissions', () => {
      expect(perms).toContain('interviews.read');
      expect(perms).toContain('interviews.review');
      for (const perm of INTERVIEW_SCHEDULING_PERMISSIONS) {
        if (perm !== 'interviews.read') {
          expect(perms).not.toContain(perm);
        }
      }
    });
  });

  describe('INTERVIEWER', () => {
    const perms = ROLE_PERMISSIONS['INTERVIEWER'];
    it('has read, update, and record_result', () => {
      expect(perms).toContain('interviews.read');
      expect(perms).toContain('interviews.update');
      expect(perms).toContain('interviews.record_result');
    });
    it('does not have scheduling or review permissions', () => {
      expect(perms).not.toContain('interviews.create');
      expect(perms).not.toContain('interviews.cancel');
      expect(perms).not.toContain('interviews.reschedule');
      expect(perms).not.toContain('interviews.complete');
      expect(perms).not.toContain('interviews.manage_participants');
      expect(perms).not.toContain('interviews.review');
    });
  });

  describe('VIEWER', () => {
    const perms = ROLE_PERMISSIONS['VIEWER'];
    it('only has interviews.read', () => {
      expect(perms).toContain('interviews.read');
      for (const perm of ALL_INTERVIEW_PERMISSIONS) {
        if (perm !== 'interviews.read') {
          expect(perms).not.toContain(perm);
        }
      }
    });
  });

  it('every role permission is defined in DEFAULT_PERMISSIONS', () => {
    const definedCodes = new Set<string>(DEFAULT_PERMISSIONS.map((p) => p.code));
    for (const codes of Object.values(ROLE_PERMISSIONS)) {
      for (const code of codes) {
        expect(definedCodes.has(code)).toBe(true);
      }
    }
  });
});

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    mockReflector = { getAllAndOverride: jest.fn() };
    guard = new PermissionsGuard(mockReflector as any);
  });

  function makeContext(permissions: string[]): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  it('accepts a user with the required permission', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['interviews.create']);
    const ctx = makeContext(['interviews.create', 'interviews.read']);
    expect(() => guard.canActivate(ctx)).not.toThrow();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a user without the required permission', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['interviews.cancel']);
    const ctx = makeContext(['interviews.read', 'interviews.update']);
    expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
  });

  it('rejects a user with no permissions', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['interviews.read']);
    const ctx = makeContext([]);
    expect(() => guard.canActivate(ctx)).toThrow('Insufficient permissions');
  });

  it('throws ForbiddenException when user is not authenticated', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['interviews.read']);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: null }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow('No authenticated user');
  });

  it('allows access when no permissions are required', () => {
    mockReflector.getAllAndOverride.mockReturnValue(null);
    const ctx = makeContext([]);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
