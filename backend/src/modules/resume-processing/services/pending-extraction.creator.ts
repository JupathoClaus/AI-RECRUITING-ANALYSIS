import { Prisma } from '@prisma/client';

const DEFAULT_PARSER_NAME = 'pdf-parse';
const DEFAULT_PARSER_VERSION = '2.4.5';

export interface PendingExtractionInput {
  storedFileId: string;
  companyId: string;
  mimeType: string;
  checksumSha256: string;
  initiatedByUserId?: string | null;
}

/**
 * Creates the PENDING ResumeTextExtraction + PENDING_DISPATCH ExtractionDispatch
 * rows for a freshly stored resume using the given (transaction) client.
 *
 * Deliberately a pure function instead of an injected service: both the
 * authenticated recruiter workflow and the public application flow need it,
 * and a plain import avoids module cycles between applications/files/resume
 * processing modules. The extraction dispatch reconciler scheduler picks the
 * rows up within ~15s and enqueues the BullMQ job; callers with access to the
 * reconciler may additionally call dispatchOne() right after commit.
 */
export async function createPendingExtraction(
  client: Prisma.TransactionClient | { resumeTextExtraction: any; extractionDispatch: any },
  input: PendingExtractionInput,
): Promise<{ id: string }> {
  const extraction = await (client as Prisma.TransactionClient).resumeTextExtraction.create({
    data: {
      storedFileId: input.storedFileId,
      companyId: input.companyId,
      initiatedByUserId: input.initiatedByUserId ?? null,
      status: 'PENDING',
      mimeType: input.mimeType,
      sourceFileSha256: input.checksumSha256,
      parserName: DEFAULT_PARSER_NAME,
      parserVersion: DEFAULT_PARSER_VERSION,
    },
    select: { id: true },
  });

  await (client as Prisma.TransactionClient).extractionDispatch.create({
    data: {
      extractionId: extraction.id,
      dispatchStatus: 'PENDING_DISPATCH',
    },
  });

  return extraction;
}
