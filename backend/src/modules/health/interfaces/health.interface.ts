export interface HealthCheckResult {
  status: 'ok' | 'error' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
  checks: {
    database: ServiceHealth;
    redis: ServiceHealth;
    queues: QueueHealth;
    memory: MemoryHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface QueueHealth {
  status: 'up' | 'down';
  details?: Record<string, string>;
}

export interface MemoryHealth {
  status: 'up' | 'down';
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  externalMb: number;
}

export interface LivenessResult {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: ServiceHealth;
    redis: ServiceHealth;
    queues: QueueHealth;
  };
}

export interface VersionResult {
  name: string;
  version: string;
  apiVersion: string;
  environment: string;
  nodeVersion: string;
  uptimeSeconds: number;
}
