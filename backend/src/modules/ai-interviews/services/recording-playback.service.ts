import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand, NoSuchBucket, NoSuchKey } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  fromNodeProviderChain,
  fromTemporaryCredentials,
  fromEnv,
} from '@aws-sdk/credential-providers';

export interface RecordingPlaybackResult {
  playbackUrl: string;
  expiresAt: string;
}

/**
 * Generates short-lived signed URLs for interview recordings stored in the
 * company's S3 bucket.
 *
 * Security model:
 * - The bucket is never public; playback uses SigV4 presigned URLs (TTL-bounded).
 * - The bucket and object key always come from the authoritative AiInterview
 *   record — never from client input.
 * - The bucket must match the configured recording bucket, and the object key
 *   is validated (no traversal, no alternate bucket).
 * - Credentials come from the standard AWS chain (env vars, shared profile,
 *   ECS/EC2 instance role) or an STS AssumeRole into a least-privilege
 *   playback role when AWS_PLAYBACK_ROLE_ARN is set.
 */
@Injectable()
export class RecordingPlaybackService {
  private readonly logger = new Logger(RecordingPlaybackService.name);
  private readonly region: string;
  private readonly expectedBucket: string;
  private readonly ttlSeconds: number;
  private readonly roleArn: string;
  private readonly roleSessionName: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('aws.region') || '';
    this.expectedBucket = this.configService.get<string>('aws.recordingBucket') || '';
    this.ttlSeconds = this.configService.get<number>('aws.signedUrlTtlSeconds') ?? 600;
    this.roleArn = this.configService.get<string>('aws.playbackRoleArn') || '';
    this.roleSessionName =
      this.configService.get<string>('aws.playbackRoleSessionName') || 'ai-recruiter-playback';
  }

  private buildClient(): S3Client {
    if (!this.region) {
      throw new BadRequestException({
        code: 'PLAYBACK_NOT_CONFIGURED',
        message: 'Recording playback is not configured on the server.',
      });
    }

    let credentials = fromNodeProviderChain();
    if (this.roleArn) {
      credentials = fromTemporaryCredentials({
        params: {
          RoleArn: this.roleArn,
          RoleSessionName: this.roleSessionName,
        },
        masterCredentials: this.hasStaticCredentials() ? fromEnv() : fromNodeProviderChain(),
      });
    }

    return new S3Client({ region: this.region, credentials });
  }

  private hasStaticCredentials(): boolean {
    const accessKeyId = this.configService.get<string>('aws.accessKeyId') || '';
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey') || '';
    return !!accessKeyId && !!secretAccessKey;
  }

  async getPlaybackUrl(params: {
    recordingStatus: string | null;
    storageProvider?: string;
    bucketName?: string;
    s3Key?: string;
  }): Promise<RecordingPlaybackResult> {
    if (params.recordingStatus !== 'READY') {
      throw new BadRequestException({
        code: 'RECORDING_NOT_READY',
        message: 'The recording is not ready yet.',
      });
    }
    if (params.storageProvider !== 's3') {
      throw new BadRequestException({
        code: 'RECORDING_NOT_S3',
        message: 'The recording is not stored in S3.',
      });
    }
    if (!this.expectedBucket) {
      throw new BadRequestException({
        code: 'PLAYBACK_NOT_CONFIGURED',
        message: 'Recording playback is not configured on the server.',
      });
    }
    if (params.bucketName !== this.expectedBucket) {
      throw new BadRequestException({
        code: 'RECORDING_BUCKET_MISMATCH',
        message: 'The recording bucket could not be resolved.',
      });
    }

    const key = (params.s3Key || '').trim();
    if (!key) {
      throw new BadRequestException({
        code: 'RECORDING_KEY_MISSING',
        message: 'The recording object key is missing.',
      });
    }
    // Object key safety: no leading slash, no traversal, safe charset only.
    if (
      key.startsWith('/') ||
      key.split('/').some((segment) => segment === '..' || segment === '.') ||
      !/^[A-Za-z0-9._\-\/]+$/.test(key)
    ) {
      throw new BadRequestException({
        code: 'RECORDING_KEY_INVALID',
        message: 'The recording object key is invalid.',
      });
    }

    try {
      const client = this.buildClient();
      const command = new GetObjectCommand({
        Bucket: params.bucketName,
        Key: key,
      });
      const playbackUrl = await getSignedUrl(client, command, {
        expiresIn: this.ttlSeconds,
      });
      return {
        playbackUrl,
        expiresAt: new Date(Date.now() + this.ttlSeconds * 1000).toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (
        error instanceof NoSuchBucket ||
        error instanceof NoSuchKey ||
        (error as { name?: string })?.name === 'NoSuchBucket' ||
        (error as { name?: string })?.name === 'NoSuchKey'
      ) {
        throw new BadRequestException({
          code: 'RECORDING_OBJECT_MISSING',
          message: 'The recording object could not be found in storage.',
        });
      }
      this.logger.error(`S3 playback URL generation failed: ${error}`);
      throw new BadRequestException({
        code: 'PLAYBACK_GENERATION_FAILED',
        message: 'The recording could not be prepared for playback.',
      });
    }
  }
}
