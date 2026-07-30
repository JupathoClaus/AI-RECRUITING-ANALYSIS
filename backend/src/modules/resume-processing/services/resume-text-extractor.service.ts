import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth = require('mammoth');

export interface ResumeExtractionInput {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export interface ResumeExtractionOutput {
  text: string;
  textSha256: string;
  parserName: string;
  parserVersion: string;
  warnings: string[];
}

@Injectable()
export class ResumeTextExtractorService {
  private readonly logger = new Logger(ResumeTextExtractorService.name);
  private readonly maxTextChars: number;
  private readonly minTextChars: number;
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    this.maxTextChars = configService.get<number>('resumeExtraction.maxTextChars') || 50000;
    this.minTextChars = configService.get<number>('resumeExtraction.minTextChars') || 20;
    this.timeoutMs = configService.get<number>('resumeExtraction.timeoutMs') || 30000;
  }

  async extract(input: ResumeExtractionInput): Promise<ResumeExtractionOutput> {
    if (input.mimeType === 'application/pdf') {
      return this.extractPdf(input);
    }
    if (
      input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return this.extractDocx(input);
    }
    throw new Error(`UNSUPPORTED_MIME_TYPE: ${input.mimeType}`);
  }

  private async extractPdf(input: ResumeExtractionInput): Promise<ResumeExtractionOutput> {
    let data: { text: string };
    let parser: { getText: () => Promise<{ text: string }>; destroy: () => void } | undefined;
    let timeout: NodeJS.Timeout | undefined;
    try {
      const { PDFParse } = await import('pdf-parse');
      const uint8 = new Uint8Array(
        input.buffer.buffer,
        input.buffer.byteOffset,
        input.buffer.byteLength,
      );
      parser = new PDFParse(uint8);
      data = await Promise.race([
        parser.getText(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('PDF_EXTRACTION_TIMEOUT')), this.timeoutMs);
          timeout.unref();
        }),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypted')) {
        throw new Error('ENCRYPTED_PDF');
      }
      if (
        msg.toLowerCase().includes('invalid') ||
        msg.toLowerCase().includes('corrupt') ||
        msg.toLowerCase().includes('file')
      ) {
        throw new Error('INVALID_PDF');
      }
      throw err;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      try {
        parser?.destroy();
      } catch {
        // Best-effort cleanup; preserve the extraction result/error.
      }
    }

    let text = this.normalizeText(data.text);

    if (text.length < this.minTextChars) {
      throw new Error('EMPTY_EXTRACTION');
    }

    if (text.length > this.maxTextChars) {
      text = text.slice(0, this.maxTextChars) + '\n... [truncated]';
    }

    return {
      text,
      textSha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
      parserName: 'pdf-parse',
      parserVersion: '1.1.1',
      warnings: [],
    };
  }

  private async extractDocx(input: ResumeExtractionInput): Promise<ResumeExtractionOutput> {
    let result: { value: string; messages: Array<{ message: string }> };
    try {
      result = await mammoth.extractRawText({ buffer: input.buffer });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('zip') || msg.toLowerCase().includes('corrupt')) {
        throw new Error('CORRUPT_DOCX');
      }
      throw err;
    }

    let text = this.normalizeText(result.value);
    const warnings = result.messages.map((m) => m.message);

    if (text.length < this.minTextChars) {
      throw new Error('EMPTY_EXTRACTION');
    }

    if (text.length > this.maxTextChars) {
      text = text.slice(0, this.maxTextChars) + '\n... [truncated]';
    }

    return {
      text,
      textSha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
      parserName: 'mammoth',
      parserVersion: '1.8.0',
      warnings,
    };
  }

  private normalizeText(raw: string): string {
    const text = raw
      .replace(/\0/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  }
}
