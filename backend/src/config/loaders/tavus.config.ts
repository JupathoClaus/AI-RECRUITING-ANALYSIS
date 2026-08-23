import { registerAs } from '@nestjs/config';

export default registerAs('tavus', () => ({
  enabled: process.env.TAVUS_ENABLED === 'true',
  apiKey: process.env.TAVUS_API_KEY || '',
  personaId: process.env.TAVUS_PERSONA_ID || '',
  replicaId: process.env.TAVUS_REPLICA_ID || '',
  callbackBaseUrl: process.env.TAVUS_CALLBACK_BASE_URL || '',
  callbackSecret: process.env.TAVUS_CALLBACK_SECRET || '',
  testMode: process.env.TAVUS_TEST_MODE === 'true',
  maxCallDurationSeconds: parseInt(process.env.TAVUS_MAX_CALL_DURATION_SECONDS || '600', 10),
  participantAbsentTimeoutSeconds: parseInt(
    process.env.TAVUS_PARTICIPANT_ABSENT_TIMEOUT_SECONDS || '120',
    10,
  ),
  participantLeftTimeoutSeconds: parseInt(
    process.env.TAVUS_PARTICIPANT_LEFT_TIMEOUT_SECONDS || '60',
    10,
  ),
  recording: {
    enabled: process.env.TAVUS_RECORDING_ENABLED === 'true',
    provider: process.env.TAVUS_RECORDING_PROVIDER || 's3',
    bucketName: process.env.TAVUS_RECORDING_BUCKET_NAME || '',
    bucketRegion: process.env.TAVUS_RECORDING_BUCKET_REGION || '',
    assumeRoleArn: process.env.TAVUS_RECORDING_ASSUME_ROLE_ARN || '',
    externalId: process.env.TAVUS_RECORDING_EXTERNAL_ID || '',
    workloadIdentityProvider: process.env.TAVUS_RECORDING_WORKLOAD_IDENTITY_PROVIDER || '',
    serviceAccountEmail: process.env.TAVUS_RECORDING_SERVICE_ACCOUNT_EMAIL || '',
  },
  artifactSyncIntervalMs: parseInt(
    process.env.TAVUS_ARTIFACT_SYNC_INTERVAL_MS || '120000',
    10,
  ),
  artifactSyncCooldownMs: parseInt(process.env.TAVUS_ARTIFACT_SYNC_COOLDOWN_MS || '60000', 10),
  artifactSyncMaxPerCycle: parseInt(process.env.TAVUS_ARTIFACT_SYNC_MAX_PER_CYCLE || '5', 10),
  artifactSyncMaxAgeHours: parseInt(process.env.TAVUS_ARTIFACT_SYNC_MAX_AGE_HOURS || '72', 10),
}));
