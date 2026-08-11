import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class CandidateDeduplicationService {
  constructor(private readonly prisma: PrismaService) {}

  calculateFingerprint(data: {
    normalizedEmail?: string | null;
    normalizedPhone?: string | null;
    firstName?: string;
    lastName?: string;
  }): string | null {
    const signals: string[] = [];
    if (data.normalizedEmail) signals.push(`email:${data.normalizedEmail}`);
    if (data.normalizedPhone) signals.push(`phone:${data.normalizedPhone}`);
    if (data.firstName && data.lastName) {
      signals.push(
        `name:${data.firstName.toLowerCase().trim()}:${data.lastName.toLowerCase().trim()}`,
      );
    }
    if (signals.length === 0) return null;
    return crypto.createHash('sha256').update(signals.join('|')).digest('hex');
  }

  async findExactMatches(data: {
    normalizedEmail?: string | null;
    normalizedPhone?: string | null;
    excludeCandidateId?: string;
  }) {
    const conditions: Array<{ normalizedEmail?: string; normalizedPhone?: string }> = [];
    if (data.normalizedEmail) {
      conditions.push({ normalizedEmail: data.normalizedEmail });
    }
    if (data.normalizedPhone) {
      conditions.push({ normalizedPhone: data.normalizedPhone });
    }
    if (conditions.length === 0) return [];

    const where: Record<string, unknown> = {
      OR: conditions,
      status: { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] },
    };
    if (data.excludeCandidateId) {
      where.id = { not: data.excludeCandidateId };
    }

    return this.prisma.candidate.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        headline: true,
        currentJobTitle: true,
        currentEmployer: true,
        city: true,
        countryCode: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async findPotentialMatches(data: {
    firstName?: string;
    lastName?: string;
    normalizedEmail?: string | null;
    normalizedPhone?: string | null;
  }) {
    const conditions: Array<Record<string, unknown>> = [];

    if (data.normalizedEmail && data.firstName && data.lastName) {
      conditions.push({
        normalizedEmail: data.normalizedEmail,
        firstName: { contains: data.firstName, mode: 'insensitive' },
        lastName: { contains: data.lastName, mode: 'insensitive' },
      });
    }

    if (data.normalizedPhone && data.firstName && data.lastName) {
      conditions.push({
        normalizedPhone: data.normalizedPhone,
        firstName: { contains: data.firstName, mode: 'insensitive' },
        lastName: { contains: data.lastName, mode: 'insensitive' },
      });
    }

    if (data.firstName && data.lastName) {
      conditions.push({
        firstName: { equals: data.firstName, mode: 'insensitive' },
        lastName: { equals: data.lastName, mode: 'insensitive' },
        currentEmployer: { not: null },
      });
    }

    if (conditions.length === 0) return [];

    return this.prisma.candidate.findMany({
      where: {
        AND: [{ status: { notIn: ['MERGED', 'DELETED', 'ANONYMIZED'] } }, { OR: conditions }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        headline: true,
        currentJobTitle: true,
        currentEmployer: true,
        city: true,
        countryCode: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async checkBeforeCreate(data: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    normalizedEmail?: string | null;
    normalizedPhone?: string | null;
    excludeCandidateId?: string;
  }) {
    const exactMatches = await this.findExactMatches({
      normalizedEmail: data.normalizedEmail,
      normalizedPhone: data.normalizedPhone,
      excludeCandidateId: data.excludeCandidateId,
    });

    if (exactMatches.length > 0) {
      return {
        blocked: true,
        duplicates: exactMatches.map((m) => ({
          candidateId: m.id,
          matchCategory: 'EXACT' as const,
          reasons: [`Same ${data.normalizedEmail ? 'email' : 'phone'} as existing candidate`],
          displayName: `${m.firstName} ${m.lastName}`,
          createdAt: m.createdAt,
          status: m.status,
        })),
      };
    }

    const potentialMatches = await this.findPotentialMatches({
      firstName: data.firstName,
      lastName: data.lastName,
      normalizedEmail: data.normalizedEmail,
      normalizedPhone: data.normalizedPhone,
    });

    if (potentialMatches.length > 0) {
      return {
        blocked: false,
        duplicates: potentialMatches.map((m) => ({
          candidateId: m.id,
          matchCategory: 'POSSIBLE' as const,
          reasons: ['Similar name or contact information'],
          displayName: `${m.firstName} ${m.lastName}`,
          createdAt: m.createdAt,
          status: m.status,
        })),
      };
    }

    return { blocked: false, duplicates: [] };
  }
}
