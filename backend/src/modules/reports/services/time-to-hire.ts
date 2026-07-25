/**
 * Pure calculation for time-to-hire metrics.
 * Negative durations return null for both fields.
 */
export function calculateTimeToHire(submittedAt: Date | null, hiredAt: Date | null): { durationHours: number | null; daysToHire: number | null } {
  if (!submittedAt || !hiredAt) return { durationHours: null, daysToHire: null };

  const ms = hiredAt.getTime() - submittedAt.getTime();
  if (ms < 0) return { durationHours: null, daysToHire: null };

  const hours = ms / 3_600_000;
  const days = hours / 24;

  const durationHours = Math.round(hours * 100) / 100;
  const daysToHire = Math.round(days * 100) / 100;

  return { durationHours, daysToHire };
}
