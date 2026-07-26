export enum AiScreeningRecommendation {
  SHORTLIST = 'SHORTLIST',
  NOT_SHORTLIST = 'NOT_SHORTLIST',
  HUMAN_REVIEW = 'HUMAN_REVIEW',
}

export enum AiScreeningConfidence {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AiScreeningStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
