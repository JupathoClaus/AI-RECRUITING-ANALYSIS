import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { EmailWorker } from '../email.worker';
import { EmailService } from '../email.service';

describe('EmailWorker', () => {
  let worker: EmailWorker;
  let emailService: jest.Mocked<EmailService>;

  const mockEmailService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    sendApplicationReceivedEmail: jest.fn().mockResolvedValue(undefined),
    sendApplicationStageChangedEmail: jest.fn().mockResolvedValue(undefined),
    sendInterviewScheduledEmail: jest.fn().mockResolvedValue(undefined),
    sendInterviewRescheduledEmail: jest.fn().mockResolvedValue(undefined),
    sendInterviewCancelledEmail: jest.fn().mockResolvedValue(undefined),
    sendInterviewCompletedEmail: jest.fn().mockResolvedValue(undefined),
    sendInterviewReminderEmail: jest.fn().mockResolvedValue(undefined),
    sendOfferSentEmail: jest.fn().mockResolvedValue(undefined),
  };

  const makeJob = (name: string, data: Record<string, unknown> = {}): Job =>
    ({
      id: 'test-job-id',
      name,
      data,
    }) as unknown as Job;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailWorker, { provide: EmailService, useValue: mockEmailService }],
    }).compile();

    worker = module.get<EmailWorker>(EmailWorker);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth.email-verification', () => {
    it('should call sendVerificationEmail', async () => {
      await worker.process(
        makeJob('auth.email-verification', { email: 'a@b.com', token: 't', firstName: 'John' }),
      );
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', 't', 'John');
    });

    it('should default firstName to User', async () => {
      await worker.process(makeJob('auth.email-verification', { email: 'a@b.com', token: 't' }));
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', 't', 'User');
    });
  });

  describe('auth.password-reset', () => {
    it('should call sendPasswordResetEmail', async () => {
      await worker.process(
        makeJob('auth.password-reset', { email: 'a@b.com', token: 't', firstName: 'Jane' }),
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', 't', 'Jane');
    });
  });

  describe('organization.invitation', () => {
    it('should call sendInvitationEmail', async () => {
      await worker.process(
        makeJob('organization.invitation', {
          email: 'a@b.com',
          token: 't',
          inviterName: 'Alice',
          companyName: 'Acme',
        }),
      );
      expect(mockEmailService.sendInvitationEmail).toHaveBeenCalledWith(
        'a@b.com',
        't',
        'Alice',
        'Acme',
      );
    });
  });

  describe('recruitment.application-received', () => {
    it('should call sendApplicationReceivedEmail', async () => {
      await worker.process(
        makeJob('recruitment.application-received', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          companyName: 'Acme',
        }),
      );
      expect(mockEmailService.sendApplicationReceivedEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        'Acme',
      );
    });
  });

  describe('recruitment.application-stage-changed', () => {
    it('should call sendApplicationStageChangedEmail', async () => {
      await worker.process(
        makeJob('recruitment.application-stage-changed', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          stage: 'Interview',
          companyName: 'Acme',
        }),
      );
      expect(mockEmailService.sendApplicationStageChangedEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        'Interview',
        'Acme',
      );
    });
  });

  describe('recruitment.interview-scheduled', () => {
    it('should call sendInterviewScheduledEmail', async () => {
      await worker.process(
        makeJob('recruitment.interview-scheduled', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          interviewType: 'Technical',
          scheduledAt: '2026-08-01 10:00',
          timezone: 'UTC',
          durationMinutes: 60,
          location: 'Room 101',
          interviewerNames: ['Alice', 'Bob'],
          instructions: 'Bring laptop',
        }),
      );
      expect(mockEmailService.sendInterviewScheduledEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        'Technical',
        '2026-08-01 10:00',
        'UTC',
        60,
        'Room 101',
        ['Alice', 'Bob'],
        'Bring laptop',
      );
    });
  });

  describe('recruitment.interview-rescheduled', () => {
    it('should call sendInterviewRescheduledEmail', async () => {
      await worker.process(
        makeJob('recruitment.interview-rescheduled', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          scheduledAt: '2026-08-02 14:00',
          timezone: 'UTC',
          reason: 'Conflict',
        }),
      );
      expect(mockEmailService.sendInterviewRescheduledEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        '2026-08-02 14:00',
        'UTC',
        'Conflict',
      );
    });
  });

  describe('recruitment.interview-cancelled', () => {
    it('should call sendInterviewCancelledEmail', async () => {
      await worker.process(
        makeJob('recruitment.interview-cancelled', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          reason: 'Position filled',
        }),
      );
      expect(mockEmailService.sendInterviewCancelledEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        'Position filled',
      );
    });
  });

  describe('recruitment.interview-completed', () => {
    it('should call sendInterviewCompletedEmail', async () => {
      await worker.process(
        makeJob('recruitment.interview-completed', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
        }),
      );
      expect(mockEmailService.sendInterviewCompletedEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
      );
    });
  });

  describe('recruitment.interview-reminder', () => {
    it('should call sendInterviewReminderEmail', async () => {
      await worker.process(
        makeJob('recruitment.interview-reminder', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          scheduledAt: '2026-08-01 10:00',
          timezone: 'UTC',
          minutesUntilInterview: 30,
          location: 'Room 101',
        }),
      );
      expect(mockEmailService.sendInterviewReminderEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        '2026-08-01 10:00',
        'UTC',
        30,
        'Room 101',
      );
    });
  });

  describe('recruitment.offer-sent', () => {
    it('should call sendOfferSentEmail', async () => {
      await worker.process(
        makeJob('recruitment.offer-sent', {
          email: 'a@b.com',
          candidateName: 'Jane',
          jobTitle: 'Engineer',
          companyName: 'Acme',
          offerUrl: 'http://localhost:3001/offers/123',
        }),
      );
      expect(mockEmailService.sendOfferSentEmail).toHaveBeenCalledWith(
        'a@b.com',
        'Jane',
        'Engineer',
        'Acme',
        'http://localhost:3001/offers/123',
      );
    });
  });

  describe('unknown job type', () => {
    it('should not throw for unknown job type', async () => {
      await worker.process(makeJob('unknown.job', { email: 'a@b.com' }));
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should rethrow when email service fails', async () => {
      mockEmailService.sendVerificationEmail.mockRejectedValueOnce(new Error('Send failed'));
      await expect(
        worker.process(makeJob('auth.email-verification', { email: 'a@b.com', token: 't' })),
      ).rejects.toThrow('Send failed');
    });
  });
});
