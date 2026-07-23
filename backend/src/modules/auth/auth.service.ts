import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { QueueService } from '@modules/queue/queue.service';
import {
  AuditEventType,
  UserStatus,
  SessionStatus,
  MembershipStatus,
  CompanyStatus,
  VerificationTokenType,
} from '@prisma/client';
import * as crypto from 'crypto';

import { RegisterCompanyDto, LoginDto, ChangePasswordDto, ResetPasswordDto } from './dto';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { VerificationTokenService } from './services/verification-token.service';
import { AuthAuditService } from './services/auth-audit.service';
import { LoginProtectionService } from './services/login-protection.service';
import {
  AUTH_ERROR_CODES,
  ROLE_PERMISSIONS,
  DEFAULT_PERMISSIONS,
} from './constants/auth.constants';
import { slugify } from '@common/utils';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegistrationResult {
  userId: string;
  companyId: string;
  membershipId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly nodeEnv: string;
  private readonly isDevOrTest: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly verificationTokenService: VerificationTokenService,
    private readonly authAuditService: AuthAuditService,
    private readonly loginProtectionService: LoginProtectionService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) {
    this.nodeEnv = this.configService.get<string>('app.env') || 'development';
    this.isDevOrTest = this.nodeEnv === 'development' || this.nodeEnv === 'test';
  }

  async registerCompany(
    dto: RegisterCompanyDto,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<RegistrationResult> {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('Passwords do not match');
    }

    const passwordValidation = this.passwordService.validatePasswordPolicy(
      dto.password,
      dto.email,
      dto.firstName,
      dto.lastName,
    );
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PASSWORD_POLICY_FAILED,
        message: 'Password does not meet policy requirements',
        errors: passwordValidation.errors,
      });
    }

    if (!dto.acceptTerms) {
      throw new BadRequestException('You must accept the terms of service');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException({
        code: 'AUTH_EMAIL_EXISTS',
        message: 'An account with this email already exists',
      });
    }

    const baseSlug = slugify(dto.companyName);
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const slugExists = await this.prisma.company.findUnique({ where: { slug } });
      if (!slugExists) break;
      slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const verificationToken = this.tokenService.generateVerificationToken();

    const result = await this.prisma.$transaction(async (tx) => {
      const existingRole = await tx.role.findFirst({
        where: { code: 'COMPANY_ADMIN', scope: 'COMPANY', isSystem: true },
        include: { rolePermissions: { include: { permission: true } } },
      });

      let adminRoleId: string;
      if (existingRole) {
        adminRoleId = existingRole.id;
      } else {
        const newRole = await tx.role.create({
          data: {
            code: 'COMPANY_ADMIN',
            name: 'Company Administrator',
            description: 'Full access to company resources',
            scope: 'COMPANY',
            isSystem: true,
          },
        });
        adminRoleId = newRole.id;

        const adminPermCodes = ROLE_PERMISSIONS['COMPANY_ADMIN'] || [];
        for (const permCode of adminPermCodes) {
          let permission = await tx.permission.findUnique({ where: { code: permCode } });
          if (!permission) {
            const permConfig = DEFAULT_PERMISSIONS.find((p) => p.code === permCode);
            if (permConfig) {
              permission = await tx.permission.create({ data: { ...permConfig } });
            }
          }
          if (permission) {
            await tx.rolePermission.create({
              data: { roleId: adminRoleId, permissionId: permission.id },
            });
          }
        }
      }

      const company = await tx.company.create({
        data: {
          name: dto.companyName,
          slug,
          country: dto.country ?? null,
          timezone: dto.timezone ?? 'UTC',
          status: 'ACTIVE',
        },
      });

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          normalizedEmail,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'PENDING_VERIFICATION',
          timezone: dto.timezone ?? 'UTC',
        },
      });

      const membership = await tx.companyMembership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          roleId: adminRoleId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      await tx.verificationToken.create({
        data: {
          userId: user.id,
          email: normalizedEmail,
          type: 'EMAIL_VERIFICATION',
          tokenHash: verificationToken.hashedToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.authAuditEvent.create({
        data: {
          eventType: 'USER_REGISTERED',
          success: true,
          userId: user.id,
          companyId: company.id,
          ipAddress: ip,
          userAgent,
          requestId,
          metadata: { companyName: dto.companyName },
        },
      });

      return { user, company, membership };
    });

    this.logger.log(`Company registered: ${result.company.id}, User: ${result.user.id}`);

    await this.queueService.addEmailJob('auth.email-verification', {
      email: normalizedEmail,
      userId: result.user.id,
      token: verificationToken.rawToken,
      firstName: dto.firstName,
      type: 'email-verification',
    });

    return {
      userId: result.user.id,
      companyId: result.company.id,
      membershipId: result.membership.id,
    };
  }

  async login(dto: LoginDto, ip: string, userAgent: string, requestId: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const rateCheck = await this.loginProtectionService.checkLoginRateLimit(ip, normalizedEmail);
    if (!rateCheck.allowed) {
      await this.loginProtectionService.recordLoginAttempt(ip, normalizedEmail);
      throw new HttpException(
        {
          code: AUTH_ERROR_CODES.RATE_LIMITED,
          message: 'Too many login attempts. Please try again later.',
          retryAfterSeconds: rateCheck.resetTimeSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (!user) {
      await this.loginProtectionService.recordLoginAttempt(ip, normalizedEmail);
      await this.authAuditService.record({
        eventType: AuditEventType.LOGIN_FAILED,
        success: false,
        ipAddress: ip,
        userAgent,
        requestId,
        metadata: { reason: 'User not found' },
      });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
        message: 'Account not found',
      });
    }
    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
        message: 'This account has been disabled',
      });
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_SUSPENDED,
        message: 'This account has been suspended',
      });
    }

    const lockout = await this.loginProtectionService.checkLockout(user.id);
    if (lockout.locked) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Account is temporarily locked',
        remainingLockTimeMs: lockout.remainingLockTimeMs,
      });
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.loginProtectionService.recordFailedAttempt(user.id);
      await this.loginProtectionService.recordLoginAttempt(ip, normalizedEmail);

      await this.authAuditService.record({
        eventType: AuditEventType.LOGIN_FAILED,
        success: false,
        userId: user.id,
        ipAddress: ip,
        userAgent,
        requestId,
        metadata: { reason: 'Invalid password' },
      });

      const updatedLockout = await this.loginProtectionService.checkLockout(user.id);
      if (updatedLockout.locked) {
        await this.authAuditService.record({
          eventType: AuditEventType.ACCOUNT_LOCKED,
          success: true,
          userId: user.id,
          ipAddress: ip,
          userAgent,
          requestId,
        });
      }

      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        message: 'Please verify your email address before logging in',
      });
    }

    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      include: {
        company: true,
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (memberships.length === 0) {
      await this.loginProtectionService.recordLoginAttempt(ip, normalizedEmail);
      throw new UnauthorizedException('No active company memberships found');
    }

    let activeMembership = memberships[0];
    if (dto.companyId) {
      const selected = memberships.find((m) => m.companyId === dto.companyId);
      if (selected) {
        activeMembership = selected;
      }
    }

    if (activeMembership.company.status !== CompanyStatus.ACTIVE) {
      throw new UnauthorizedException('Company account is not active');
    }

    const refreshTokenData = this.tokenService.generateRefreshToken();
    const session = await this.sessionService.create({
      userId: user.id,
      activeCompanyId: activeMembership.company.id,
      ipAddress: ip,
      userAgent,
      refreshTokenHash: refreshTokenData.hashedToken,
      refreshTokenFamilyId: refreshTokenData.familyId,
      expiresAt: new Date(Date.now() + this.tokenService.getRefreshTokenExpiresInMs()),
    });

    const permissions = activeMembership.role.rolePermissions.map((rp) => rp.permission.code);

    const accessToken = await this.tokenService.generateAccessToken(
      user.id,
      session.id,
      activeMembership.company.id,
      activeMembership.id,
      activeMembership.role.code,
    );

    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.companyMembership.update({
        where: { id: activeMembership.id },
        data: { lastActiveAt: new Date() },
      }),
    ]);

    await this.loginProtectionService.resetFailedAttempts(user.id);

    await this.authAuditService.record({
      eventType: AuditEventType.LOGIN_SUCCEEDED,
      success: true,
      userId: user.id,
      companyId: activeMembership.company.id,
      sessionId: session.id,
      ipAddress: ip,
      userAgent,
      requestId,
    });

    return {
      tokens: {
        accessToken,
        refreshToken: refreshTokenData.rawToken,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        timezone: user.timezone,
      },
      activeCompany: {
        id: activeMembership.company.id,
        name: activeMembership.company.name,
        slug: activeMembership.company.slug,
        logoUrl: activeMembership.company.logoUrl,
        status: activeMembership.company.status,
      },
      role: activeMembership.role.code,
      permissions,
      sessionId: session.id,
    };
  }

  async selectCompany(
    userId: string,
    sessionId: string,
    companyId: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ) {
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      include: {
        company: true,
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.MEMBERSHIP_INACTIVE,
        message: 'No active membership found for this company',
      });
    }

    if (membership.company.status !== CompanyStatus.ACTIVE) {
      throw new BadRequestException('Company is not active');
    }

    await this.sessionService.updateActiveCompany(sessionId, companyId);

    const permissions = membership.role.rolePermissions.map((rp) => rp.permission.code);

    const accessToken = await this.tokenService.generateAccessToken(
      userId,
      sessionId,
      companyId,
      membership.id,
      membership.role.code,
    );

    await this.authAuditService.record({
      eventType: AuditEventType.COMPANY_SELECTED,
      success: true,
      userId,
      companyId,
      sessionId,
      ipAddress: ip,
      userAgent,
      requestId,
    });

    return {
      accessToken,
      company: {
        id: membership.company.id,
        name: membership.company.name,
        slug: membership.company.slug,
        logoUrl: membership.company.logoUrl,
      },
      role: membership.role.code,
      permissions,
    };
  }

  async refresh(
    refreshToken: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<Tokens> {
    const hashedToken = this.tokenService.hashToken(refreshToken);
    const session = await this.sessionService.findByRefreshTokenHash(hashedToken);

    if (!session) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.SESSION_REVOKED,
        message: 'Invalid refresh token',
      });
    }

    if (
      session.user.status === UserStatus.DELETED ||
      session.user.status === UserStatus.DISABLED ||
      session.user.status === UserStatus.SUSPENDED
    ) {
      throw new UnauthorizedException('Account not accessible');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.SESSION_REVOKED,
        message: 'Session has been revoked',
      });
    }

    if (session.expiresAt <= new Date()) {
      await this.sessionService.revoke(session.id, 'Refresh token expired');
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
        message: 'Refresh token has expired',
      });
    }

    if (session.previousRefreshTokenHash && session.previousRefreshTokenHash === hashedToken) {
      await this.sessionService.revokeFamily(session.refreshTokenFamilyId);
      await this.authAuditService.record({
        eventType: AuditEventType.REFRESH_TOKEN_REUSE_DETECTED,
        success: false,
        userId: session.userId,
        sessionId: session.id,
        ipAddress: ip,
        userAgent,
        requestId,
      });
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.REFRESH_REUSE_DETECTED,
        message: 'Refresh token reuse detected, all family sessions revoked',
      });
    }

    const newRefresh = this.tokenService.generateRefreshToken();
    await this.sessionService.updateRefreshToken(session.id, newRefresh.hashedToken);

    let role = session.user.status === UserStatus.PENDING_VERIFICATION ? 'VIEWER' : 'COMPANY_ADMIN';
    let membershipId: string | null = null;

    if (session.activeCompanyId) {
      const membership = await this.prisma.companyMembership.findUnique({
        where: {
          userId_companyId: {
            userId: session.userId,
            companyId: session.activeCompanyId,
          },
        },
        include: { role: true },
      });
      if (membership && membership.status === MembershipStatus.ACTIVE) {
        role = membership.role.code;
        membershipId = membership.id;
      }
    }

    const accessToken = await this.tokenService.generateAccessToken(
      session.userId,
      session.id,
      session.activeCompanyId,
      membershipId,
      role,
    );

    await this.sessionService.updateLastActivity(session.id);

    await this.authAuditService.record({
      eventType: AuditEventType.TOKEN_REFRESHED,
      success: true,
      userId: session.userId,
      sessionId: session.id,
      ipAddress: ip,
      userAgent,
      requestId,
    });

    return {
      accessToken,
      refreshToken: newRefresh.rawToken,
    };
  }

  async logout(
    sessionId: string,
    userId: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    await this.sessionService.revoke(sessionId, 'User logged out');

    await this.authAuditService.record({
      eventType: AuditEventType.LOGOUT,
      success: true,
      userId,
      sessionId,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  async logoutAll(
    userId: string,
    exceptCurrentSessionId?: string,
    ip?: string,
    userAgent?: string,
    requestId?: string,
  ): Promise<void> {
    const count = await this.sessionService.revokeAllUserSessions(userId, exceptCurrentSessionId);

    await this.authAuditService.record({
      eventType: AuditEventType.LOGOUT_ALL,
      success: true,
      userId,
      sessionId: exceptCurrentSessionId ?? null,
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      requestId: requestId ?? null,
      metadata: { revokedCount: count, exceptCurrent: !!exceptCurrentSessionId },
    });
  }

  async getMe(userId: string, activeCompanyId?: string, membershipId?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        status: true,
        timezone: true,
        preferredLocale: true,
        createdAt: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    let company: Record<string, unknown> | null = null;
    let role: string | null = null;
    let permissions: string[] = [];

    if (membershipId) {
      const membership = await this.prisma.companyMembership.findUnique({
        where: { id: membershipId },
        include: {
          company: {
            select: { id: true, name: true, slug: true, logoUrl: true, status: true },
          },
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      });

      if (membership) {
        company = {
          id: membership.company.id,
          name: membership.company.name,
          slug: membership.company.slug,
          logoUrl: membership.company.logoUrl,
          status: membership.company.status,
        };
        role = membership.role.code;
        permissions = membership.role.rolePermissions.map((rp) => rp.permission.code);
      }
    }

    return { user, company, role, permissions };
  }

  async getSessions(userId: string) {
    return this.sessionService.listUserSessions(userId);
  }

  async revokeSession(
    sessionId: string,
    userId: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    const session = await this.sessionService.findActiveById(sessionId);

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.sessionService.revoke(sessionId, 'Manually revoked by user');

    await this.authAuditService.record({
      eventType: AuditEventType.SESSION_REVOKED,
      success: true,
      userId,
      sessionId,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  async verifyEmail(
    token: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    const hashedToken = this.tokenService.hashToken(token);
    const verificationToken = await this.verificationTokenService.findValid(
      hashedToken,
      VerificationTokenType.EMAIL_VERIFICATION,
    );

    if (!verificationToken) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.VERIFICATION_TOKEN_INVALID,
        message: 'Invalid or expired verification token',
      });
    }

    if (!verificationToken.userId) {
      throw new BadRequestException('Verification token has no associated user');
    }

    await this.prisma.user.update({
      where: { id: verificationToken.userId },
      data: {
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    await this.verificationTokenService.markUsed(verificationToken.id);

    await this.authAuditService.record({
      eventType: AuditEventType.EMAIL_VERIFIED,
      success: true,
      userId: verificationToken.userId,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  async resendVerification(
    email: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const rateLimited = await this.checkGenericRateLimit(
      `ratelimit:resend-verification:${crypto.createHash('sha256').update(normalizedEmail).digest('hex')}`,
      3,
      300,
    );
    if (rateLimited) return;

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return;

    await this.verificationTokenService.invalidateOlder(
      normalizedEmail,
      VerificationTokenType.EMAIL_VERIFICATION,
    );

    const { rawToken } = await this.verificationTokenService.create(
      normalizedEmail,
      VerificationTokenType.EMAIL_VERIFICATION,
      user.id,
    );

    await this.queueService.addEmailJob('auth.email-verification', {
      email: normalizedEmail,
      userId: user.id,
      token: rawToken,
      firstName: user.firstName,
      type: 'email-verification',
    });

    await this.authAuditService.record({
      eventType: AuditEventType.EMAIL_VERIFICATION_SENT,
      success: true,
      userId: user.id,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  async forgotPassword(
    email: string,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const rateLimited = await this.checkGenericRateLimit(
      `ratelimit:forgot-password:${crypto.createHash('sha256').update(normalizedEmail).digest('hex')}`,
      3,
      300,
    );
    if (rateLimited) return;

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (
      !user ||
      user.status === UserStatus.DELETED ||
      user.status === UserStatus.PENDING_VERIFICATION
    ) {
      return;
    }

    await this.verificationTokenService.invalidateOlder(
      normalizedEmail,
      VerificationTokenType.PASSWORD_RESET,
    );

    const { rawToken } = await this.verificationTokenService.create(
      normalizedEmail,
      VerificationTokenType.PASSWORD_RESET,
      user.id,
    );

    await this.queueService.addEmailJob('auth.password-reset', {
      email: normalizedEmail,
      userId: user.id,
      token: rawToken,
      type: 'password-reset',
    });

    await this.authAuditService.record({
      eventType: AuditEventType.PASSWORD_RESET_REQUESTED,
      success: true,
      userId: user.id,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  async resetPassword(
    dto: ResetPasswordDto,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    if (dto.newPassword !== dto.passwordConfirmation) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedToken = this.tokenService.hashToken(dto.token);
    const verificationToken = await this.verificationTokenService.findValid(
      hashedToken,
      VerificationTokenType.PASSWORD_RESET,
    );

    if (!verificationToken) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.VERIFICATION_TOKEN_INVALID,
        message: 'Invalid or expired reset token',
      });
    }

    if (!verificationToken.userId) {
      throw new BadRequestException('Reset token has no associated user');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: verificationToken.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordValidation = this.passwordService.validatePasswordPolicy(
      dto.newPassword,
      user.email,
      user.firstName,
      user.lastName,
    );
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PASSWORD_POLICY_FAILED,
        message: 'Password does not meet policy requirements',
        errors: passwordValidation.errors,
      });
    }

    const isSame = await this.passwordService.isSameAsCurrent(dto.newPassword, user.passwordHash);
    if (isSame) {
      throw new BadRequestException('New password must be different from your current password');
    }

    const newPasswordHash = await this.passwordService.hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
      },
    });

    await this.sessionService.revokeAllUserSessions(user.id);
    await this.loginProtectionService.resetFailedAttempts(user.id);
    await this.verificationTokenService.markUsed(verificationToken.id);

    await this.authAuditService.record({
      eventType: AuditEventType.PASSWORD_RESET_COMPLETED,
      success: true,
      userId: user.id,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
    ip: string,
    userAgent: string,
    requestId: string,
  ): Promise<void> {
    if (dto.newPassword !== dto.passwordConfirmation) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await this.passwordService.verifyPassword(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const isSame = await this.passwordService.isSameAsCurrent(dto.newPassword, user.passwordHash);
    if (isSame) {
      throw new BadRequestException('New password must be different from your current password');
    }

    const passwordValidation = this.passwordService.validatePasswordPolicy(
      dto.newPassword,
      user.email,
      user.firstName,
      user.lastName,
    );
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PASSWORD_POLICY_FAILED,
        message: 'Password does not meet policy requirements',
        errors: passwordValidation.errors,
      });
    }

    const newPasswordHash = await this.passwordService.hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
      },
    });

    if (dto.revokeOtherSessions) {
      await this.sessionService.revokeAllUserSessions(userId, sessionId);
    }

    await this.authAuditService.record({
      eventType: AuditEventType.PASSWORD_CHANGED,
      success: true,
      userId,
      ipAddress: ip,
      userAgent,
      requestId,
    });
  }

  private async checkGenericRateLimit(
    key: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const current = await this.redisService.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= maxAttempts) return true;

    if (count === 0) {
      await this.redisService.setWithExpiry(key, '1', windowSeconds);
    } else {
      await this.redisService.increment(key);
    }

    return false;
  }
}
