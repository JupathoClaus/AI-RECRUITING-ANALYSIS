import { registerAs } from '@nestjs/config';

export default registerAs('tavus', () => ({
  enabled: process.env.TAVUS_ENABLED === 'true',
  apiKey: process.env.TAVUS_API_KEY || '',
  personaId: process.env.TAVUS_PERSONA_ID || '',
  replicaId: process.env.TAVUS_REPLICA_ID || '',
  callbackBaseUrl: process.env.TAVUS_CALLBACK_BASE_URL || '',
  maxCallDurationSeconds: parseInt(process.env.TAVUS_MAX_CALL_DURATION_SECONDS || '600', 10),
  participantAbsentTimeoutSeconds: parseInt(process.env.TAVUS_PARTICIPANT_ABSENT_TIMEOUT_SECONDS || '120', 10),
  participantLeftTimeoutSeconds: parseInt(process.env.TAVUS_PARTICIPANT_LEFT_TIMEOUT_SECONDS || '60', 10),
}));
