import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import * as crypto from 'crypto';

import configuration from '../config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../modules/redis/redis.module';
import { QueueModule } from '../modules/queue/queue.module';
import { HealthModule } from '../modules/health/health.module';
import { AuthModule } from '../modules/auth/auth.module';
import { UsersModule } from '../modules/users/users.module';
import { CompaniesModule } from '../modules/companies/companies.module';
import { OrganizationModule } from '../modules/organization/organization.module';
import { DepartmentsModule } from '../modules/departments/departments.module';
import { LocationsModule } from '../modules/locations/locations.module';
import { InvitationsModule } from '../modules/invitations/invitations.module';
import { RolesModule } from '../modules/roles/roles.module';
import { PermissionsModule } from '../modules/permissions/permissions.module';
import { JobsModule } from '../modules/jobs/jobs.module';
import { JobTemplatesModule } from '../modules/job-templates/job-templates.module';
import { SkillsModule } from '../modules/skills/skills.module';
import { JobPublicationsModule } from '../modules/job-publications/job-publications.module';
import { CandidatesModule } from '../modules/candidates/candidates.module';
import { ApplicationsModule } from '../modules/applications/applications.module';
import { PipelineModule } from '../modules/pipeline/pipeline.module';
import { InterviewsModule } from '../modules/interviews/interviews.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { FilesModule } from '../modules/files/files.module';
import { EmailModule } from '../modules/email/email.module';
import { AiScreeningModule } from '../modules/ai-screening/ai-screening.module';
import { ResumeProcessingModule } from '../modules/resume-processing/resume-processing.module';
import { AiInterviewsModule } from '../modules/ai-interviews/ai-interviews.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: ['.env'],
    }),

    LoggerModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const env = configService.get<string>('app.env') || 'development';
        const logLevel = configService.get<string>('app.logLevel') || 'debug';
        const isProduction = env === 'production';

        return {
          pinoHttp: {
            level: logLevel,
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                },
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              let requestId: string;
              if (typeof incoming === 'string' && UUID_REGEX.test(incoming)) {
                requestId = incoming;
              } else {
                requestId = crypto.randomUUID();
              }
              (req as unknown as Record<string, unknown>).requestId = requestId;
              res.setHeader('x-request-id', requestId);
              return requestId;
            },
            customProps: (req) => ({
              requestId: (req as unknown as Record<string, unknown>).requestId as
                string | undefined,
            }),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url,
                headers: req.headers,
              }),
              res: (res) => ({
                statusCode: res.statusCode,
              }),
              err: (err) => ({
                type: err.type,
                message: err.message,
                stack: err.stack,
              }),
            },
            autoLogging: {
              ignore: (req) => req.url === '/api/v1/health/live',
            },
          },
        };
      },
      inject: [ConfigService],
    }),

    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('security.rateLimitTtl') || 60000,
            limit: configService.get<number>('security.rateLimitMax') || 100,
          },
        ],
      }),
      inject: [ConfigService],
    }),

    DatabaseModule,
    RedisModule,
    QueueModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    OrganizationModule,
    DepartmentsModule,
    LocationsModule,
    InvitationsModule,
    RolesModule,
    PermissionsModule,
    JobsModule,
    JobTemplatesModule,
    SkillsModule,
    JobPublicationsModule,
    CandidatesModule,
    ApplicationsModule,
    PipelineModule,
    InterviewsModule,
    AnalyticsModule,
    ReportsModule,
    NotificationsModule,
    FilesModule,
    EmailModule,
    AiScreeningModule,
    ResumeProcessingModule,
    AiInterviewsModule,
    IdempotencyModule,
  ],
})
export class AppModule {}
