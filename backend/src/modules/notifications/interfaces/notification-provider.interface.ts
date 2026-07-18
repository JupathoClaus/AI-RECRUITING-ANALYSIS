/** Provider-agnostic notification abstractions for Phase 2.3.
 *  Real providers (SMTP, Twilio, Firebase) plug in here in a future phase. */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  templateId: string;
  templateData: Record<string, unknown>;
  replyTo?: string;
  cc?: string[];
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface PushMessage {
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationProvider {
  sendEmail(message: EmailMessage): Promise<void>;
  sendSms?(message: SmsMessage): Promise<void>;
  sendPush?(message: PushMessage): Promise<void>;
}

export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';

/** Mock provider — logs only. Replace with real SMTP/Twilio in a future phase. */
export class MockNotificationProvider implements NotificationProvider {
  async sendEmail(message: EmailMessage): Promise<void> {
    console.log('[MockEmailProvider] Would send email:', {
      to: message.to,
      subject: message.subject,
      templateId: message.templateId,
    });
  }

  async sendSms(message: SmsMessage): Promise<void> {
    console.log('[MockSmsProvider] Would send SMS to:', message.to);
  }

  async sendPush(message: PushMessage): Promise<void> {
    console.log('[MockPushProvider] Would send push to:', message.recipientId);
  }
}
