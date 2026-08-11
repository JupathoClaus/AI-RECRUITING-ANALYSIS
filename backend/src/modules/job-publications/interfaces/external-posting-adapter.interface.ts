export interface PublishResult {
  success: boolean;
  externalPostingId?: string;
  externalUrl?: string;
  failureCode?: string;
  failureMessage?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobLike = any;

export interface ExternalPostingAdapter {
  readonly provider: string;
  validateConfiguration(config: Record<string, unknown>): Promise<boolean>;
  publish(job: JobLike, config: Record<string, unknown>): Promise<PublishResult>;
  update(
    job: JobLike,
    externalPostingId: string,
    config: Record<string, unknown>,
  ): Promise<PublishResult>;
  unpublish(externalPostingId: string, config: Record<string, unknown>): Promise<PublishResult>;
  getStatus(externalPostingId: string, config: Record<string, unknown>): Promise<string>;
}
