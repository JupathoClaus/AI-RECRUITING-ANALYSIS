import { Injectable } from '@nestjs/common';
import {
  ExternalPostingAdapter,
  PublishResult,
} from '../interfaces/external-posting-adapter.interface';

@Injectable()
export class CompanyCareersPageAdapter implements ExternalPostingAdapter {
  readonly provider = 'COMPANY_CAREERS_PAGE';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validateConfiguration(_config: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async publish(
    job: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<PublishResult> {
    const careersPageUrl = (config.careersPageUrl as string) || 'https://careers.example.com';
    const publicUrl = `${careersPageUrl}/jobs/${job.slug}`;

    return {
      success: true,
      externalPostingId: job.id as string,
      externalUrl: publicUrl,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(
    _job: Record<string, unknown>,
    _externalPostingId: string,
    _config: Record<string, unknown>,
  ): Promise<PublishResult> {
    return { success: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async unpublish(
    _externalPostingId: string,
    _config: Record<string, unknown>,
  ): Promise<PublishResult> {
    return { success: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStatus(_externalPostingId: string, _config: Record<string, unknown>): Promise<string> {
    return 'PUBLISHED';
  }
}
