export function parseNonNegativeIntegerHeader(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function sanitizeDownloadFilename(filename: string, fallback: string): string {
  // Remove path traversal and control characters
  let safe = filename
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  // Remove surrounding quotes
  if (safe.startsWith('"') && safe.endsWith('"')) safe = safe.slice(1, -1);

  if (!safe || !safe.includes('.')) return fallback;
  return safe;
}

export function parseContentDispositionFilename(disposition: string | null, reportName: string): string {
  if (!disposition) return `${reportName}.csv`;

  // RFC 5987 filename*=UTF-8''value
  const starMatch = /filename\*=(?:UTF-8|utf-8)''([^;\s]+)/i.exec(disposition);
  if (starMatch) {
    try {
      const decoded = decodeURIComponent(starMatch[1]);
      const safe = sanitizeDownloadFilename(decoded, `${reportName}.csv`);
      if (safe) return safe;
    } catch {
      // fall through
    }
  }

  // filename="value"
  const plainMatch = /filename="?([^";\n]+)"?/i.exec(disposition);
  if (plainMatch) {
    const safe = sanitizeDownloadFilename(plainMatch[1], `${reportName}.csv`);
    if (safe) return safe;
  }

  return `${reportName}.csv`;
}
