import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  AI_PROCESSING: 'ai-processing',
  INTERVIEW_REMINDER: 'interview-reminder',
  INTERVIEW_NOTIFICATION: 'interview-notification',
  AI_SCREENING: 'ai-screening',
  RESUME_PROCESSING: 'resume-processing',
} as const;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly healthCheckTimeoutMs: number;

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ANALYTICS) private readonly analyticsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AI_PROCESSING)
    private readonly aiProcessingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INTERVIEW_REMINDER)
    private readonly interviewReminderQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INTERVIEW_NOTIFICATION)
    private readonly interviewNotificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AI_SCREENING) private readonly aiScreeningQueue: Queue,
    @InjectQueue(QUEUE_NAMES.RESUME_PROCESSING) private readonly resumeProcessingQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.healthCheckTimeoutMs = this.configService.get<number>('app.healthCheckTimeoutMs') || 3000;
  }

  private queueEntries(): { name: string; queue: Queue }[] {
    return [
      { name: QUEUE_NAMES.EMAIL, queue: this.emailQueue },
      { name: QUEUE_NAMES.NOTIFICATIONS, queue: this.notificationsQueue },
      { name: QUEUE_NAMES.ANALYTICS, queue: this.analyticsQueue },
      { name: QUEUE_NAMES.AI_PROCESSING, queue: this.aiProcessingQueue },
      { name: QUEUE_NAMES.INTERVIEW_REMINDER, queue: this.interviewReminderQueue },
      { name: QUEUE_NAMES.INTERVIEW_NOTIFICATION, queue: this.interviewNotificationQueue },
      { name: QUEUE_NAMES.AI_SCREENING, queue: this.aiScreeningQueue },
      { name: QUEUE_NAMES.RESUME_PROCESSING, queue: this.resumeProcessingQueue },
    ];
  }

  async onModuleDestroy() {
    this.logger.log('Closing all queues...');
    const results = await Promise.allSettled(
      this.queueEntries().map(async ({ name, queue }) => {
        try {
          await queue.close();
        } catch {
          /* ignore errors during shutdown */
        }
        return name;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.logger.log(`Queue closed: ${result.value}`);
      } else {
        this.logger.warn(`Queue close failed: ${result.reason?.message || result.reason}`);
      }
    }
  }

  async isHealthy(): Promise<{ healthy: boolean; details: Record<string, string> }> {
    const details: Record<string, string> = {};
    let allUp = true;

    const checks = await Promise.allSettled(
      this.queueEntries().map(async ({ name, queue }) => {
        await this.pingQueue(name, queue);
        return name;
      }),
    );

    for (const check of checks) {
      const name = check.status === 'fulfilled' ? check.value : undefined;
      if (check.status === 'fulfilled' && name) {
        details[name] = 'up';
      }
    }

    for (const { name } of this.queueEntries()) {
      if (details[name] !== 'up') {
        details[name] = 'down';
        allUp = false;
      }
    }

    return { healthy: allUp, details };
  }

  private async pingQueue(name: string, queue: Queue): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const ping = (async () => {
        const client = await queue.client;
        await client.info();
      })();
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Queue ${name} health check timed out`)),
          this.healthCheckTimeoutMs,
        );
      });
      await Promise.race([ping, timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async addEmailJob(name: string, data: Record<string, unknown>) {
    return this.emailQueue.add(name, data);
  }

  async addNotificationJob(name: string, data: Record<string, unknown>) {
    return this.notificationsQueue.add(name, data);
  }

  async addInterviewNotificationJob(name: string, data: Record<string, unknown>) {
    return this.interviewNotificationQueue.add(name, data);
  }

  async addInterviewReminderJob(name: string, data: Record<string, unknown>) {
    return this.interviewReminderQueue.add(name, data);
  }

  async addAnalyticsJob(name: string, data: Record<string, unknown>) {
    return this.analyticsQueue.add(name, data);
  }

  async addAiProcessingJob(name: string, data: Record<string, unknown>) {
    return this.aiProcessingQueue.add(name, data);
  }

  async getQueueStats(queueName: string) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  private getQueue(queueName: string): Queue {
    const queues: Record<string, Queue> = {
      [QUEUE_NAMES.EMAIL]: this.emailQueue,
      [QUEUE_NAMES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUE_NAMES.ANALYTICS]: this.analyticsQueue,
      [QUEUE_NAMES.AI_PROCESSING]: this.aiProcessingQueue,
      [QUEUE_NAMES.INTERVIEW_REMINDER]: this.interviewReminderQueue,
      [QUEUE_NAMES.INTERVIEW_NOTIFICATION]: this.interviewNotificationQueue,
      [QUEUE_NAMES.AI_SCREENING]: this.aiScreeningQueue,
      [QUEUE_NAMES.RESUME_PROCESSING]: this.resumeProcessingQueue,
    };

    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue;
  }
}
