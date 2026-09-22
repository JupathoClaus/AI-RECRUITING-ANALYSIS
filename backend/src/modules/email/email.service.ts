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

  async sendVerificationEmail(to: string, token: string, firstName: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    const subject = 'Verify your AI Recruiter account';

    const html = this.baseHtml(`
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
      <p style="margin:20px 0 0 0;font-size:12px;color:#a0aec0;">
        This verification link expires in 24 hours. If you did not create this account, you may ignore this email.
      </p>
    `);

    const text = `Hi ${firstName},\n\nVerify your email address by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create this account, you may ignore this email.`;

    await this.send({ to, subject, html, text });
  }

  async sendPasswordResetEmail(to: string, token: string, firstName: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/auth/reset-password?token=${token}`;
    const subject = 'Reset your AI Recruiter password';

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Reset your password</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${firstName},<br><br>
        We received a request to reset your password. Click the button below to set a new one.
      </p>
      <a href="${resetUrl}" style="display:inline-block;padding:14px 40px;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
        Reset Password
      </a>
      <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#718096;">
        If the button does not work, copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color:#6366f1;word-break:break-all;">${resetUrl}</a>
      </p>
      <p style="margin:20px 0 0 0;font-size:12px;color:#a0aec0;">
        This link expires in 1 hour. If you did not request a password reset, you may ignore this email.
      </p>
    `);

    const text = `Hi ${firstName},\n\nReset your password by visiting: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request a password reset, you may ignore this email.`;

    await this.send({ to, subject, html, text });
  }

  async sendInvitationEmail(
    to: string,
    token: string,
    inviterName: string,
    companyName: string,
  ): Promise<void> {
    const acceptUrl = `${this.frontendUrl}/accept-invitation?token=${token}`;
    const subject = `You've been invited to join ${companyName}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">You're invited!</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi there,<br><br>
        ${inviterName} has invited you to join <strong>${companyName}</strong> on AI Recruiter. Click below to accept.
      </p>
      <a href="${acceptUrl}" style="display:inline-block;padding:14px 40px;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
        Accept Invitation
      </a>
      <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#718096;">
        If the button does not work, copy and paste this link into your browser:<br>
        <a href="${acceptUrl}" style="color:#6366f1;word-break:break-all;">${acceptUrl}</a>
      </p>
      <p style="margin:20px 0 0 0;font-size:12px;color:#a0aec0;">
        This invitation expires in 7 days.
      </p>
    `);

    const text = `Hi there,\n\n${inviterName} has invited you to join ${companyName} on AI Recruiter.\n\nAccept by visiting: ${acceptUrl}\n\nThis invitation expires in 7 days.`;

    await this.send({ to, subject, html, text });
  }

  async sendApplicationReceivedEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    companyName: string,
  ): Promise<void> {
    const subject = `Application received: ${jobTitle}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Application received</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        Thank you for applying to <strong>${jobTitle}</strong> at ${companyName}.<br><br>
        We have received your application and the team will review it shortly.
      </p>
    `);

    const text = `Hi ${candidateName},\n\nThank you for applying to ${jobTitle} at ${companyName}.\n\nWe have received your application and the team will review it shortly.`;

    await this.send({ to, subject, html, text });
  }

  async sendAssessmentAssignedEmail(
    to: string,
    candidateName: string,
    assessmentName: string,
    jobTitle: string,
    companyName: string,
    code: string,
  ): Promise<void> {
    const startUrl = `${this.frontendUrl}/assessments/start`;
    const subject = `Assessment invited: ${assessmentName}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Complete your assessment</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        You have been invited to complete the assessment <strong>${assessmentName}</strong>
        for <strong>${jobTitle}</strong> at ${companyName}.<br><br>
        Your access code is: <strong style="font-size:18px;letter-spacing:2px;">${code}</strong><br><br>
        Enter it at <a href="${startUrl}" style="color:#6366f1;">${startUrl}</a> to begin.
        Your answers save automatically as you go.
      </p>
    `);

    const text = `Hi ${candidateName},\n\nYou have been invited to complete the assessment "${assessmentName}" for ${jobTitle} at ${companyName}.\n\nYour access code is: ${code}\n\nEnter it at ${startUrl} to begin. Your answers save automatically as you go.`;

    await this.send({ to, subject, html, text });
  }

  async sendApplicationStageChangedEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    stage: string,
    companyName: string,
  ): Promise<void> {
    const subject = `Application update: ${jobTitle} - ${stage}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Application status update</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        Your application for <strong>${jobTitle}</strong> at ${companyName} has moved to: <strong>${stage}</strong>
      </p>
    `);

    const text = `Hi ${candidateName},\n\nYour application for ${jobTitle} at ${companyName} has moved to: ${stage}`;

    await this.send({ to, subject, html, text });
  }

  async sendInterviewScheduledEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    interviewType: string,
    scheduledAt: string,
    timezone: string,
    durationMinutes: number,
    location: string | undefined,
    interviewerNames: string[],
    instructions: string | undefined,
  ): Promise<void> {
    const subject = `Interview scheduled: ${jobTitle}`;

    const details = [
      `Type: ${interviewType}`,
      `Date: ${scheduledAt}`,
      `Timezone: ${timezone}`,
      `Duration: ${durationMinutes} minutes`,
    ];
    if (location) details.push(`Location: ${location}`);
    if (interviewerNames?.length) details.push(`Interviewers: ${interviewerNames.join(', ')}`);

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Interview scheduled</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        Your interview for <strong>${jobTitle}</strong> has been scheduled.
      </p>
      <table style="margin:0 auto 24px auto;font-size:14px;color:#4a5568;">
        ${details.map((d) => `<tr><td style="padding:4px 16px 4px 0;font-weight:600;">${d.split(':')[0]}:</td><td>${d.split(':').slice(1).join(':')}</td></tr>`).join('')}
      </table>
      ${instructions ? `<p style="font-size:14px;color:#4a5568;">${instructions}</p>` : ''}
    `);

    const text = `Hi ${candidateName},\n\nYour interview for ${jobTitle} has been scheduled.\n\n${details.join('\n')}${instructions ? `\n\n${instructions}` : ''}`;

    await this.send({ to, subject, html, text });
  }

  async sendInterviewRescheduledEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    scheduledAt: string,
    timezone: string,
    reason: string | undefined,
  ): Promise<void> {
    const subject = `Interview rescheduled: ${jobTitle}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Interview rescheduled</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        Your interview for <strong>${jobTitle}</strong> has been rescheduled.<br><br>
        <strong>New date:</strong> ${scheduledAt} (${timezone})
        ${reason ? `<br><br><strong>Reason:</strong> ${reason}` : ''}
      </p>
    `);

    const text = `Hi ${candidateName},\n\nYour interview for ${jobTitle} has been rescheduled.\n\nNew date: ${scheduledAt} (${timezone})${reason ? `\n\nReason: ${reason}` : ''}`;

    await this.send({ to, subject, html, text });
  }

  async sendInterviewCancelledEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    reason: string | undefined,
  ): Promise<void> {
    const subject = `Interview cancelled: ${jobTitle}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Interview cancelled</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        Your interview for <strong>${jobTitle}</strong> has been cancelled.
        ${reason ? `<br><br><strong>Reason:</strong> ${reason}` : ''}
      </p>
    `);

    const text = `Hi ${candidateName},\n\nYour interview for ${jobTitle} has been cancelled.${reason ? `\n\nReason: ${reason}` : ''}`;

    await this.send({ to, subject, html, text });
  }

  async sendInterviewCompletedEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
  ): Promise<void> {
    const subject = `Interview completed: ${jobTitle}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Interview completed</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        Thank you for completing your interview for <strong>${jobTitle}</strong>.<br><br>
        The team will be in touch with next steps.
      </p>
    `);

    const text = `Hi ${candidateName},\n\nThank you for completing your interview for ${jobTitle}.\n\nThe team will be in touch with next steps.`;

    await this.send({ to, subject, html, text });
  }

  async sendInterviewReminderEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    scheduledAt: string,
    timezone: string,
    minutesUntilInterview: number,
    location: string | undefined,
  ): Promise<void> {
    const subject = `Reminder: Interview in ${minutesUntilInterview} minutes`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Interview reminder</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        This is a reminder that your interview for <strong>${jobTitle}</strong> is in <strong>${minutesUntilInterview} minutes</strong>.<br><br>
        <strong>Scheduled time:</strong> ${scheduledAt} (${timezone})
        ${location ? `<br><strong>Location:</strong> ${location}` : ''}
      </p>
    `);

    const text = `Hi ${candidateName},\n\nThis is a reminder that your interview for ${jobTitle} is in ${minutesUntilInterview} minutes.\n\nScheduled time: ${scheduledAt} (${timezone})${location ? `\nLocation: ${location}` : ''}`;

    await this.send({ to, subject, html, text });
  }

  async sendAiInterviewInvitationEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    companyName: string,
    interviewLink: string,
    interviewCode: string,
    durationMinutes: number,
    expiresAt: Date | null,
    recruiterNote?: string,
  ): Promise<void> {
    const subject = `AI interview invitation — ${jobTitle}`;
    const expiryText = expiresAt
      ? `\n\nThis invitation expires on ${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`
      : '';
    const noteHtml = recruiterNote
      ? `<p style="margin:16px 0 0 0;font-size:14px;color:#4a5568;font-style:italic;">Note from the recruiter: ${recruiterNote}</p>`
      : '';
    const noteText = recruiterNote ? `\n\nNote from the recruiter: ${recruiterNote}` : '';

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">AI Interview Invitation</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Hi ${candidateName},<br><br>
        You have been invited to complete an <strong>AI-powered interview</strong> for the position of
        <strong>${jobTitle}</strong> at ${companyName}.<br><br>
        This interview will be conducted by an AI interviewer. Your responses will be transcribed and
        reviewed by authorized recruitment staff.
      </p>
      <div style="background-color:#f0f4ff;border-radius:8px;padding:20px;margin:0 0 24px 0;text-align:center;">
        <p style="margin:0 0 8px 0;font-size:14px;color:#4a5568;font-weight:600;">Your interview code</p>
        <p style="margin:0 0 16px 0;font-size:28px;font-weight:700;color:#6366f1;letter-spacing:4px;font-family:monospace;">${interviewCode}</p>
        <a href="${interviewLink}" style="display:inline-block;padding:14px 40px;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
          Start Your Interview
        </a>
      </div>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#4a5568;">
        <strong>Duration:</strong> Approximately ${durationMinutes} minutes<br>
        <strong>Estimated completion:</strong> You can complete it at your convenience${expiryText}
      </p>
      <h3 style="margin:24px 0 12px 0;font-size:16px;font-weight:600;color:#1a1a2e;">Preparation tips</h3>
      <ul style="margin:0 0 16px 0;font-size:14px;line-height:1.8;color:#4a5568;padding-left:20px;">
        <li>Use a stable internet connection</li>
        <li>Choose a quiet, well-lit room</li>
        <li>Ensure your camera and microphone are working</li>
        <li>Use a modern browser (Chrome, Firefox, or Edge)</li>
        <li>Close unnecessary applications</li>
      </ul>
      <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#718096;">
        By proceeding, you agree that your spoken answers may be transcribed and reviewed by
        authorized recruitment staff at ${companyName}. Your data will be handled according to
        our privacy policy.
      </p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#718096;">
        Questions? Contact the recruitment team at ${companyName}.
      </p>
      ${noteHtml}
    `);

    const text = `Hi ${candidateName},\n\nYou have been invited to complete an AI-powered interview for the position of ${jobTitle} at ${companyName}.\n\nThis interview will be conducted by an AI interviewer. Your responses will be transcribed and reviewed by authorized recruitment staff.\n\nYour interview code: ${interviewCode}\n\nStart your interview: ${interviewLink}\n\nDuration: Approximately ${durationMinutes} minutes${expiryText}\n\nPreparation tips:\n- Use a stable internet connection\n- Choose a quiet, well-lit room\n- Ensure your camera and microphone are working\n- Use a modern browser (Chrome, Firefox, or Edge)\n- Close unnecessary applications\n\nBy proceeding, you agree that your spoken answers may be transcribed and reviewed by authorized recruitment staff at ${companyName}.\n\nQuestions? Contact the recruitment team.${noteText}`;

    await this.send({ to, subject, html, text });
  }

  async sendOfferSentEmail(
    to: string,
    candidateName: string,
    jobTitle: string,
    companyName: string,
    offerUrl: string,
  ): Promise<void> {
    const subject = `Offer sent: ${jobTitle} at ${companyName}`;

    const html = this.baseHtml(`
      <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1a1a2e;">Offer sent</h2>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4a5568;">
        Congratulations ${candidateName}!<br><br>
        We are pleased to inform you that an offer has been sent for <strong>${jobTitle}</strong> at ${companyName}.<br><br>
        Click below to review and respond to your offer.
      </p>
      <a href="${offerUrl}" style="display:inline-block;padding:14px 40px;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
        Review Offer
      </a>
    `);

    const text = `Congratulations ${candidateName}!\n\nWe are pleased to inform you that an offer has been sent for ${jobTitle} at ${companyName}.\n\nReview your offer by visiting: ${offerUrl}`;

    await this.send({ to, subject, html, text });
  }

  /* ───── internal helpers ───── */

  private baseHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="padding:40px 40px 0;text-align:center;"><h1 style="margin:0;font-size:24px;font-weight:700;color:#1a1a2e;">AI Recruiter</h1></td></tr>
<tr><td style="padding:10px 40px 30px;text-align:center;">${body}</td></tr>
<tr><td style="padding:20px 40px;background-color:#f8f9fa;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">AI Recruiter &mdash; streamline your hiring</p></td></tr>
</table>
</td></tr></table></body></html>`;
  }

  private async send(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, ...opts });
      this.logger.log(`Email sent to ${opts.to}: ${opts.subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${opts.to}: ${error}`);
      throw error;
    }
  }
}
