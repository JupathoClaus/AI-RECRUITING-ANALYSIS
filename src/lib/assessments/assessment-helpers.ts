import type { AssessmentSessionStatus } from '@/lib/api/assessments.api'

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function assignmentStatusLabel(status: string): string {
  switch (status) {
    case 'ASSIGNED': return 'Awaiting candidate';
    case 'IN_PROGRESS': return 'In progress';
    case 'SUBMITTED': return 'Submitted';
    case 'EXPIRED': return 'Expired';
    case 'CANCELLED': return 'Cancelled';
    case 'EVALUATED': return 'Evaluated';
    default: return status.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function sessionStatusLabel(status: AssessmentSessionStatus | string): string {
  switch (status) {
    case 'NOT_STARTED': return 'Not started';
    case 'IN_PROGRESS': return 'In progress';
    case 'SUBMITTED': return 'Submitted';
    case 'EVALUATING': return 'Evaluating';
    case 'EVALUATED': return 'Evaluated';
    case 'EXPIRED': return 'Expired';
    case 'CANCELLED': return 'Cancelled';
    default: return String(status);
  }
}

export function thresholdNote(totalScore: number, passingScore: number | null | undefined): string | null {
  if (passingScore == null) return null;
  return totalScore >= passingScore
    ? `Meets the configured passing threshold (${passingScore}/100).`
    : `Below the configured passing threshold (${passingScore}/100).`;
}

/** Positions of answered questions, for progress + review screens. */
export function answeredPositions(args: {
  questions: { id: string; type: string; required: boolean }[];
  answers: Map<string, { selectedOptionIds?: string[]; textAnswer?: string | null }>;
}): { answered: number; total: number; missingRequired: string[] } {
  let answered = 0;
  const missingRequired: string[] = [];
  for (const q of args.questions) {
    const a = args.answers.get(q.id);
    const has =
      q.type === 'SHORT_TEXT' || q.type === 'LONG_TEXT'
        ? (a?.textAnswer ?? '').trim().length > 0
        : (a?.selectedOptionIds ?? []).length > 0;
    if (has) answered++;
    else if (q.required) missingRequired.push(q.id);
  }
  return { answered, total: args.questions.length, missingRequired };
}
