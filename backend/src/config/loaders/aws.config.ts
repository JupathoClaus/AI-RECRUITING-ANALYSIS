import { registerAs } from '@nestjs/config';

export default registerAs('aws', () => ({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  sessionToken: process.env.AWS_SESSION_TOKEN || '',
  profile: process.env.AWS_PROFILE || '',
  playbackRoleArn: process.env.AWS_PLAYBACK_ROLE_ARN || '',
  playbackRoleSessionName: process.env.AWS_PLAYBACK_ROLE_SESSION_NAME || 'ai-recruiter-playback',
  recordingBucket: process.env.TAVUS_RECORDING_BUCKET_NAME || '',
  signedUrlTtlSeconds: parseInt(process.env.AWS_PLAYBACK_SIGNED_URL_TTL_SECONDS || '600', 10),
}));
