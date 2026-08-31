import { BadRequestException } from '@nestjs/common';

/**
 * Pure resume-file validation shared by the recruiter workflow, the public
 * application flow and FilesService. Validates extension whitelist, declared
 * MIME type, size floor and magic-byte signatures. Returns the normalized
 * file extension.
 */
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const PDF_HEADER = Buffer.from('%PDF');
const DOCX_ZIP_MARKER = Buffer.from('PK');

export function validateResumeFile(originalName: string, mimeType: string, buffer: Buffer): string {
  const dotIdx = originalName.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === originalName.length - 1) {
    throw new BadRequestException('FILE_EXTENSION_MISSING');
  }

  const extension = originalName.slice(dotIdx + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException('FILE_EXTENSION_NOT_ALLOWED');
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException('FILE_TYPE_NOT_ALLOWED');
  }

  if (buffer.length < 4) {
    throw new BadRequestException('FILE_TOO_SMALL');
  }

  if (extension === 'pdf') {
    if (buffer.slice(0, 4).compare(PDF_HEADER) !== 0) {
      throw new BadRequestException('FILE_SIGNATURE_MISMATCH');
    }
  } else if (extension === 'docx') {
    if (buffer.slice(0, 2).compare(DOCX_ZIP_MARKER) !== 0) {
      throw new BadRequestException('FILE_SIGNATURE_MISMATCH');
    }
  }

  return extension;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\<>:"|?*\x00-\x1f]/g, '_').substring(0, 255);
}
