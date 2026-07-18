import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { RequestWithId } from '@common/types/request.types';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfProtected } from './decorators/csrf-protected.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { AuthenticatedPrincipal } from './interfaces/auth.interface';
import {
  RegisterCompanyDto,
  LoginDto,
  RefreshTokenDto,
  SelectCompanyDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  LogoutAllDto,
} from './dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register-company')
  @Public()
  @ApiOperation({ summary: 'Register a new company with first admin user' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Company registered, verification required',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or passwords do not match',
  })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already registered' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  @ApiBody({ type: RegisterCompanyDto })
  @HttpCode(HttpStatus.CREATED)
  async registerCompany(@Body() dto: RegisterCompanyDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    const result = await this.authService.registerCompany(dto, ip, userAgent, requestId);

    return {
      userId: result.userId,
      companyId: result.companyId,
      membershipId: result.membershipId,
      verificationRequired: true,
      ...(result.verificationToken && { verificationToken: result.verificationToken }),
    };
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Login successful' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials or email not verified',
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  @ApiBody({ type: LoginDto })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    const result = await this.authService.login(dto, ip, userAgent, requestId);

    this.setRefreshCookie(res, result.tokens.refreshToken, dto.rememberMe);

    return {
      tokens: result.tokens,
      user: result.user,
      activeCompany: result.activeCompany,
      role: result.role,
      permissions: result.permissions,
      sessionId: result.sessionId,
    };
  }

  @Post('select-company')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Select active company for multi-company users' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Company selected' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async selectCompany(
    @Body() dto: SelectCompanyDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    return this.authService.selectCompany(
      user.userId,
      user.sessionId,
      dto.companyId,
      ip,
      userAgent,
      requestId,
    );
  }

  @Post('refresh')
  @Public()
  @CsrfProtected()
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tokens refreshed' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid or expired refresh token' })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body?: RefreshTokenDto,
  ) {
    const cookieName =
      this.configService.get<string>('auth.refreshCookieName') || 'talentai_refresh';
    let refreshToken = (req as unknown as Record<string, unknown>).cookies?.[cookieName] as
      string | undefined;

    if (!refreshToken && body?.refreshToken) {
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    const result = await this.authService.refresh(refreshToken, ip, userAgent, requestId);

    this.setRefreshCookie(res, result.refreshToken);

    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged out' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.logout(user.sessionId, user.userId, ip, userAgent, requestId);

    this.clearRefreshCookie(res);

    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'All sessions logged out' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Body() dto: LogoutAllDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    const exceptCurrent = dto.exceptCurrentSession ?? false;
    await this.authService.logoutAll(
      user.userId,
      exceptCurrent ? user.sessionId : undefined,
      ip,
      userAgent,
      requestId,
    );

    if (!exceptCurrent) {
      this.clearRefreshCookie(res);
    }

    return { message: exceptCurrent ? 'Logged out all other sessions' : 'Logged out all sessions' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile with active context' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Current user profile' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.getMe(user.userId, user.activeCompanyId, user.membershipId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List current user sessions' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of active sessions' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async getSessions(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.getSessions(user.userId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID to revoke' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session revoked' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.revokeSession(sessionId, user.userId, ip, userAgent, requestId);

    return { message: 'Session revoked successfully' };
  }

  @Post('verify-email')
  @Public()
  @ApiOperation({ summary: 'Verify email address with token' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email verified' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired token' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.verifyEmail(dto.token, ip, userAgent, requestId);

    return { message: 'Email verified successfully' };
  }

  @Post('resend-verification')
  @Public()
  @ApiOperation({ summary: 'Resend email verification' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Verification email resent (if eligible)' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.resendVerification(dto.email, ip, userAgent, requestId);

    return {
      message:
        'If the email exists and requires verification, a new verification link has been sent',
    };
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reset link sent (if account exists)' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.forgotPassword(dto.email, ip, userAgent, requestId);

    return { message: 'If the email is registered, a password reset link has been sent' };
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password reset' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired token, or weak password',
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.resetPassword(dto, ip, userAgent, requestId);

    return { message: 'Password has been reset successfully' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current password' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password changed' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid current password or weak new password',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required' })
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestId = (req as unknown as RequestWithId)?.requestId || '';

    await this.authService.changePassword(
      user.userId,
      user.sessionId,
      dto,
      ip,
      userAgent,
      requestId,
    );

    return { message: 'Password changed successfully' };
  }

  private setRefreshCookie(res: Response, refreshToken: string, rememberMe?: boolean): void {
    const cookieName =
      this.configService.get<string>('auth.refreshCookieName') || 'talentai_refresh';
    const secure = this.configService.get<boolean>('auth.refreshCookieSecure') || false;
    const sameSite = this.configService.get<string>('auth.refreshCookieSameSite') || 'lax';
    const maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : (this.configService.get<number>('auth.refreshCookieMaxAgeMs') ?? 7 * 24 * 60 * 60 * 1000);

    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: sameSite as 'lax' | 'strict' | 'none',
      path: '/api/v1/auth',
      maxAge,
    });
  }

  private clearRefreshCookie(res: Response): void {
    const cookieName =
      this.configService.get<string>('auth.refreshCookieName') || 'talentai_refresh';
    res.clearCookie(cookieName, { path: '/api/v1/auth' });
  }
}
