import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExternalPostingProvider } from '@prisma/client';
import { ExternalPostingAdapter } from '../interfaces/external-posting-adapter.interface';
import { CompanyCareersPageAdapter } from './company-careers-page.adapter';
import { CustomWebhookAdapter } from './custom-webhook.adapter';

@Injectable()
export class AdapterRegistry implements OnModuleInit {
  private readonly adapters = new Map<ExternalPostingProvider, ExternalPostingAdapter>();

  constructor(
    private readonly careersPageAdapter: CompanyCareersPageAdapter,
    private readonly customWebhookAdapter: CustomWebhookAdapter,
  ) {}

  onModuleInit() {
    this.register(ExternalPostingProvider.COMPANY_CAREERS_PAGE, this.careersPageAdapter);
    this.register(ExternalPostingProvider.CUSTOM_WEBHOOK, this.customWebhookAdapter);
  }

  register(provider: ExternalPostingProvider, adapter: ExternalPostingAdapter): void {
    this.adapters.set(provider, adapter);
  }

  get(provider: ExternalPostingProvider): ExternalPostingAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${provider}`);
    }
    return adapter;
  }

  has(provider: ExternalPostingProvider): boolean {
    return this.adapters.has(provider);
  }

  getAllProviders(): ExternalPostingProvider[] {
    return Array.from(this.adapters.keys());
  }
}
