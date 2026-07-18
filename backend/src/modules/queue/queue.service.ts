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
    private readonly configService: ConfigService,
  ) {
    this.healthCheckTimeoutMs = this.configService.get<number>('app.healthCheckTimeoutMs') || 3000;
  }

  async onModuleDestroy() {
    this.logger.log('Closing all queues...');
    const queues = [
      { name: QUEUE_NAMES.EMAIL, queue: this.emailQueue },
      { name: QUEUE_NAMES.NOTIFICATIONS, queue: this.notificationsQueue },
      { name: QUEUE_NAMES.ANALYTICS, queue: this.analyticsQueue },
      { name: QUEUE_NAMES.AI_PROCESSING, queue: this.aiProcessingQueue },
      { name: QUEUE_NAMES.INTERVIEW_REMINDER, queue: this.interviewReminderQueue },
      { name: QUEUE_NAMES.INTERVIEW_NOTIFICATION, queue: this.interviewNotificationQueue },
    ];

    const results = await Promise.allSettled(
      queues.map(async ({ name, queue }) => {
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
    const queueNames = [
      QUEUE_NAMES.EMAIL,
      QUEUE_NAMES.NOTIFICATIONS,
      QUEUE_NAMES.ANALYTICS,
      QUEUE_NAMES.AI_PROCESSING,
      QUEUE_NAMES.INTERVIEW_REMINDER,
      QUEUE_NAMES.INTERVIEW_NOTIFICATION,
    ];

    const details: Record<string, string> = {};
    let allUp = true;

    for (const name of queueNames) {
      try {
        const queue = this.getQueue(name);
        const timeoutPromise = queue.waitUntilReady();
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Queue ${name} health check timed out`)),
            this.healthCheckTimeoutMs,
          ),
        );
        await Promise.race([timeoutPromise, timeout]);
        details[name] = 'up';
      } catch {
        details[name] = 'down';
        allUp = false;
      }
    }

    return { healthy: allUp, details };
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
    };

    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue;
  }
}
