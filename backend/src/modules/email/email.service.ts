import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    this.from = this.configService.get<string>('email.from') || 'noreply@ai-recruiter.com';

    const host = this.configService.get<string>('email.smtpHost') || 'localhost';
    const port = this.configService.get<number>('email.smtpPort') || 1025;
    const secure = this.configService.get<boolean>('email.smtpSecure') || false;
    const user = this.configService.get<string>('email.smtpUser') || '';
    const pass = this.configService.get<string>('email.smtpPass') || '';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      tls: { rejectUnauthorized: false },
    });

    this.logger.log(`Email service initialized: ${host}:${port}`);
  }

  async sendVerificationEmail(
    to: string,
    token: string,
    firstName: string,
  ): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    const subject = 'Verify your AI Recruiter account';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding:40px 40px 20px 40px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#1a1a2e;">AI Recruiter</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 40px 30px 40px;text-align:center;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Verify your email address</h2>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
                Hi ${firstName},<br><br>
                Thank you for creating your account. Please verify your email by clicking the button below.
              </p>
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 40px;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
                Verify Email
              </a>
              <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#718096;">
                If the button does not work, copy and paste this link into your browser:<br>
                <a href="${verifyUrl}" style="color:#6366f1;word-break:break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#f8f9fa;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">
                This verification link expires in 24 hours.<br>
                If you did not create this account, you may ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Hi ${firstName},

Verify your email address by visiting: ${verifyUrl}

This link expires in 24 hours.

If you did not create this account, you may ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
        text,
      });
      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}: ${error}`);
      throw error;
    }
  }
}
