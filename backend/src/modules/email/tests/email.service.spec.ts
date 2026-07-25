import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

var mockSendMail: jest.Mock;

jest.mock('nodemailer', () => {
  mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
  return { createTransport: () => ({ sendMail: mockSendMail }) };
});

import { EmailService } from '../email.service';

describe('EmailService', () => {
  let service: EmailService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'app.frontendUrl': 'http://localhost:3001',
        'email.from': 'noreply@ai-recruiter.test',
        'email.smtpHost': 'localhost',
        'email.smtpPort': 1025,
        'email.smtpSecure': false,
        'email.smtpUser': '',
        'email.smtpPass': '',
      };
      return config[key];
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends verification email', async () => {
    await service.sendVerificationEmail('test@test.com', 'token123', 'John');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@test.com', subject: 'Verify your AI Recruiter account' }),
    );
  });

  it('sends password reset email', async () => {
    await service.sendPasswordResetEmail('test@test.com', 'resettoken', 'John');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@test.com', subject: 'Reset your AI Recruiter password' }),
    );
  });

  it('sends invitation email', async () => {
    await service.sendInvitationEmail('test@test.com', 'invitetoken', 'Alice', 'Acme Inc');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@test.com', subject: "You've been invited to join Acme Inc" }),
    );
  });

  it('sends application received email', async () => {
    await service.sendApplicationReceivedEmail('c@t.com', 'Jane', 'Engineer', 'Acme');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Application received: Engineer' }),
    );
  });

  it('sends stage changed email', async () => {
    await service.sendApplicationStageChangedEmail('c@t.com', 'Jane', 'Engineer', 'Interview', 'Acme');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Application update: Engineer - Interview' }),
    );
  });

  it('sends interview scheduled email', async () => {
    await service.sendInterviewScheduledEmail('c@t.com', 'Jane', 'Engineer', 'Technical', '2026-08-01', 'UTC', 60, 'Rm 1', ['Alice'], 'Bring laptop');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Interview scheduled: Engineer' }),
    );
  });

  it('sends interview rescheduled email', async () => {
    await service.sendInterviewRescheduledEmail('c@t.com', 'Jane', 'Engineer', '2026-08-02', 'UTC', 'Conflict');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Interview rescheduled: Engineer' }),
    );
  });

  it('sends interview cancelled email', async () => {
    await service.sendInterviewCancelledEmail('c@t.com', 'Jane', 'Engineer', 'Filled');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Interview cancelled: Engineer' }),
    );
  });

  it('sends interview completed email', async () => {
    await service.sendInterviewCompletedEmail('c@t.com', 'Jane', 'Engineer');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Interview completed: Engineer' }),
    );
  });

  it('sends interview reminder email', async () => {
    await service.sendInterviewReminderEmail('c@t.com', 'Jane', 'Engineer', '2026-08-01', 'UTC', 30, 'Rm 1');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Reminder: Interview in 30 minutes' }),
    );
  });

  it('sends offer sent email', async () => {
    await service.sendOfferSentEmail('c@t.com', 'Jane', 'Engineer', 'Acme', 'http://o/123');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'c@t.com', subject: 'Offer sent: Engineer at Acme' }),
    );
  });

  it('throws when sendMail fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));
    await expect(service.sendVerificationEmail('t@t.com', 't', 'J')).rejects.toThrow('SMTP error');
  });

  it('includes plain text fallback', async () => {
    await service.sendApplicationReceivedEmail('c@t.com', 'Jane', 'Engineer', 'Acme');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Jane') }),
    );
  });
});
