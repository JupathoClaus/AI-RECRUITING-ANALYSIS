import { Injectable, Logger } from '@nestjs/common';
import {
  ExternalPostingAdapter,
  PublishResult,
} from '../interfaces/external-posting-adapter.interface';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

@Injectable()
export class CustomWebhookAdapter implements ExternalPostingAdapter {
  readonly provider = 'CUSTOM_WEBHOOK';
  private readonly logger = new Logger(CustomWebhookAdapter.name);

  async validateConfiguration(config: Record<string, unknown>): Promise<boolean> {
    const urlStr = config.webhookUrl as string | undefined;
    if (!urlStr) return false;

    try {
      const url = new URL(urlStr);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      return !this.isBlockedHost(url.hostname);
    } catch {
      return false;
    }
  }

  async publish(
    job: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<PublishResult> {
    const webhookUrl = config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      return {
        success: false,
        failureCode: 'INVALID_CONFIG',
        failureMessage: 'Webhook URL not configured',
      };
    }

    const isValid = await this.validateConfiguration(config);
    if (!isValid) {
      return {
        success: false,
        failureCode: 'INVALID_CONFIG',
        failureMessage: 'Invalid or blocked webhook URL',
      };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'job.published',
          job: {
            id: job.id,
            title: job.title,
            slug: job.slug,
            description: job.description,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
            experienceLevel: job.experienceLevel,
            departmentId: job.departmentId,
            locationId: job.locationId,
          },
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          success: false,
          failureCode: 'WEBHOOK_FAILED',
          failureMessage: `Webhook responded with status ${response.status}`,
        };
      }

      return {
        success: true,
        externalPostingId: `wh-${job.id as string}-${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(
        `Webhook publish failed for job ${job.id as string}: ${(error as Error).message}`,
      );
      return {
        success: false,
        failureCode: 'WEBHOOK_ERROR',
        failureMessage: (error as Error).message,
      };
    }
  }

  async update(
    job: Record<string, unknown>,
    externalPostingId: string,
    config: Record<string, unknown>,
  ): Promise<PublishResult> {
    const webhookUrl = config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      return {
        success: false,
        failureCode: 'INVALID_CONFIG',
        failureMessage: 'Webhook URL not configured',
      };
    }

    try {
      await fetch(webhookUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'job.updated',
          job: { id: job.id, title: job.title, slug: job.slug },
          externalPostingId,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        failureCode: 'WEBHOOK_ERROR',
        failureMessage: (error as Error).message,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async unpublish(
    _externalPostingId: string,
    config: Record<string, unknown>,
  ): Promise<PublishResult> {
    const webhookUrl = config.webhookUrl as string | undefined;
    if (!webhookUrl) {
      return {
        success: false,
        failureCode: 'INVALID_CONFIG',
        failureMessage: 'Webhook URL not configured',
      };
    }

    try {
      await fetch(webhookUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'job.unpublished',
          externalPostingId: _externalPostingId,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        failureCode: 'WEBHOOK_ERROR',
        failureMessage: (error as Error).message,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStatus(_externalPostingId: string, _config: Record<string, unknown>): Promise<string> {
    return 'UNKNOWN';
  }

  private isBlockedHost(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(lower)) return true;
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(lower)) return true;
    }
    return false;
  }
}
