import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        prefix: configService.get<string>('redis.keyPrefix') || 'talentai:',
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          username: configService.get<string>('redis.username') || undefined,
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db'),
          tls: configService.get<boolean>('redis.tls') ? {} : undefined,
          enableOfflineQueue: false,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'notifications' },
      { name: 'analytics' },
      { name: 'ai-processing' },
      { name: 'interview-reminder' },
      { name: 'interview-notification' },
      { name: 'ai-screening' },
      { name: 'resume-processing' },
    ),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
