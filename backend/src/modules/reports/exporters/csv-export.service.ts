import { Injectable } from '@nestjs/common';

function sanitizeCsvValue(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

@Injectable()
export class CsvExportService {
  toCsv<T>(headers: { key: keyof T & string; label: string }[], rows: T[]): string {
    const headerLine = headers.map((h) => sanitizeCsvValue(h.label)).join(',');
    const dataLines = rows.map((row) => headers.map((h) => sanitizeCsvValue(row[h.key])).join(','));
    return [headerLine, ...dataLines].join('\r\n');
  }

  getContentType(): string {
    return 'text/csv; charset=utf-8';
  }

  getFilename(reportName: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `${reportName}-${date}.csv`;
  }
}
