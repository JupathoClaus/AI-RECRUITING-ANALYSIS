import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordingPlaybackService } from '../services/recording-playback.service';

const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {},
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  NoSuchBucket: class extends Error {},
  NoSuchKey: class extends Error {},
}));
jest.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: () => ({}),
  fromTemporaryCredentials: () => ({}),
  fromEnv: () => ({}),
}));

describe('RecordingPlaybackService', () => {
  let service: RecordingPlaybackService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'aws.region': 'eu-north-1',
        'aws.recordingBucket': 'ai-recruiter-tavus-recordings',
        'aws.signedUrlTtlSeconds': 600,
        'aws.playbackRoleArn': '',
        'aws.playbackRoleSessionName': 'ai-recruiter-playback',
        'aws.accessKeyId': '',
        'aws.secretAccessKey': '',
      };
      return config[key] ?? undefined;
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordingPlaybackService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get(RecordingPlaybackService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const valid = {
    recordingStatus: 'READY',
    storageProvider: 's3',
    bucketName: 'ai-recruiter-tavus-recordings',
    s3Key: 'tavus/conv-1/1787527151095',
  };

  it('generates a short-lived signed URL for a READY s3 recording', async () => {
    mockGetSignedUrl.mockResolvedValue(
      'https://s3.eu-north-1.amazonaws.com/ai-recruiter-tavus-recordings/tavus/conv-1/1787527151095?X-Amz-Expires=600&X-Amz-Signature=abc',
    );

    const result = await service.getPlaybackUrl(valid);

    expect(mockGetSignedUrl).toHaveBeenCalled();
    expect(result.playbackUrl).toContain('X-Amz-Signature=abc');
    expect(result.expiresAt).toBeDefined();
    const ttlMs = new Date(result.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(9 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(11 * 60 * 1000);
  });

  it('rejects recordings that are not READY', async () => {
    await expect(
      service.getPlaybackUrl({ ...valid, recordingStatus: 'PROCESSING' }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.getPlaybackUrl({ ...valid, recordingStatus: 'FAILED' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects non-s3 providers', async () => {
    await expect(service.getPlaybackUrl({ ...valid, storageProvider: 'gcs' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a bucket that differs from the configured recording bucket', async () => {
    await expect(
      service.getPlaybackUrl({ ...valid, bucketName: 'attacker-controlled-bucket' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed object keys (traversal, absolute, unsafe charset)', async () => {
    for (const key of ['../secrets/x', '/abs/path', 'a b', 'a*b', 'tavus/../other']) {
      await expect(service.getPlaybackUrl({ ...valid, s3Key: key })).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it('rejects missing object key', async () => {
    await expect(service.getPlaybackUrl({ ...valid, s3Key: '' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('fails safely when no region is configured', async () => {
    const noRegionConfig = {
      get: (key: string) => {
        const config: Record<string, any> = {
          'aws.region': '',
          'aws.recordingBucket': 'ai-recruiter-tavus-recordings',
          'aws.signedUrlTtlSeconds': 600,
          'aws.playbackRoleArn': '',
          'aws.playbackRoleSessionName': 'ai-recruiter-playback',
        };
        return config[key] ?? undefined;
      },
    };
    const noRegionService = new RecordingPlaybackService(noRegionConfig as any);
    await expect(noRegionService.getPlaybackUrl(valid)).rejects.toThrow(BadRequestException);
  });

  it('uses the STS playback role when configured', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, any> = {
        'aws.region': 'eu-north-1',
        'aws.recordingBucket': 'ai-recruiter-tavus-recordings',
        'aws.signedUrlTtlSeconds': 600,
        'aws.playbackRoleArn': 'arn:aws:iam::858351789491:role/PlaybackRole',
        'aws.playbackRoleSessionName': 'ai-recruiter-playback',
      };
      return config[key] ?? undefined;
    });
    mockGetSignedUrl.mockResolvedValue('https://s3/signed?X-Amz-Signature=xyz');

    const result = await service.getPlaybackUrl(valid);
    expect(result.playbackUrl).toContain('X-Amz-Signature=xyz');
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, any> = {
        'aws.region': 'eu-north-1',
        'aws.recordingBucket': 'ai-recruiter-tavus-recordings',
        'aws.signedUrlTtlSeconds': 600,
        'aws.playbackRoleArn': '',
        'aws.playbackRoleSessionName': 'ai-recruiter-playback',
      };
      return config[key] ?? undefined;
    });
  });
});
