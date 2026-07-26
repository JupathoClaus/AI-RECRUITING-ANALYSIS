import { registerAs } from '@nestjs/config';

export interface ResumeExtractionConfig {
  maxFileBytes: number;
  maxTextChars: number;
  minTextChars: number;
  timeoutMs: number;
  parserName: string;
  parserVersion: string;
}

export default registerAs('resumeExtraction', (): ResumeExtractionConfig => {
  const maxFileBytesRaw = parseInt(process.env.RESUME_EXTRACTION_MAX_FILE_BYTES || '10485760', 10);
  const maxFileBytes = Math.max(1024, Math.min(52428800, isNaN(maxFileBytesRaw) ? 10485760 : maxFileBytesRaw));

  const maxTextCharsRaw = parseInt(process.env.RESUME_EXTRACTION_MAX_TEXT_CHARS || '50000', 10);
  const maxTextChars = Math.max(100, Math.min(500000, isNaN(maxTextCharsRaw) ? 50000 : maxTextCharsRaw));

  const minTextCharsRaw = parseInt(process.env.RESUME_EXTRACTION_MIN_TEXT_CHARS || '20', 10);
  const minTextChars = Math.max(1, Math.min(1000, isNaN(minTextCharsRaw) ? 20 : minTextCharsRaw));

  const timeoutMsRaw = parseInt(process.env.RESUME_EXTRACTION_TIMEOUT_MS || '30000', 10);
  const timeoutMs = Math.max(1000, Math.min(120000, isNaN(timeoutMsRaw) ? 30000 : timeoutMsRaw));

  return {
    maxFileBytes,
    maxTextChars,
    minTextChars,
    timeoutMs,
    parserName: process.env.RESUME_EXTRACTION_PARSER_NAME || 'pdf-parse',
    parserVersion: process.env.RESUME_EXTRACTION_PARSER_VERSION || '1.1.1',
  };
});
