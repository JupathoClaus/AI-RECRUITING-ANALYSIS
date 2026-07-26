import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export interface ResumeTextData {
  parsedText: string;
  checksumSha256: string;
}

@Injectable()
export class ResumeTextLoaderService {
  private readonly uploadDir: string;
  private readonly parserSuffix: string;

  constructor(configService: ConfigService) {
    this.uploadDir = configService.get<string>('app.uploadDir') || './uploads';
    this.parserSuffix = configService.get<string>('app.resumeTextParserSuffix') || '_parsed.txt';
  }

  async load(storageKey: string): Promise<ResumeTextData | null> {
    const parsedPath = resolve(this.uploadDir, `${storageKey}${this.parserSuffix}`);
    try {
      const parsedText = await readFile(parsedPath, 'utf-8');
      return { parsedText, checksumSha256: '' };
    } catch {
      return null;
    }
  }
}
