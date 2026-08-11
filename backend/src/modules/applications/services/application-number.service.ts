import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';

/**
 * ApplicationNumberService
 *
 * Generates race-safe application numbers per company per year.
 * Format: APP-YYYY-000001
 *
 * Uses ApplicationCounter table with an atomic increment inside a
 * Prisma $transaction to prevent duplicate numbers under concurrent load.
 * Never uses COUNT(*) queries.
 */
@Injectable()
export class ApplicationNumberService {
  private readonly logger = new Logger(ApplicationNumberService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next application number for a company.
   * Must be called inside an existing transaction for atomicity.
   */
  async generate(
    companyId: string,
    tx?: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const year = new Date().getFullYear();

    // Upsert the counter row and atomically increment
    const counter = await (client as any).applicationCounter.upsert({
      where: { companyId_year: { companyId, year } },
      update: { lastValue: { increment: 1 } },
      create: { companyId, year, lastValue: 1 },
    });

    const seq = String(counter.lastValue).padStart(6, '0');
    return `APP-${year}-${seq}`;
  }
}
