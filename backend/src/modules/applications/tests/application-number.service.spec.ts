import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationNumberService } from '../services/application-number.service';
import { PrismaService } from '@database/prisma/prisma.service';

describe('ApplicationNumberService', () => {
  let service: ApplicationNumberService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      applicationCounter: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApplicationNumberService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ApplicationNumberService>(ApplicationNumberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate format APP-YYYY-000001 for first entry', async () => {
    const year = new Date().getFullYear();
    prisma.applicationCounter.upsert.mockResolvedValue({ companyId: 'c1', year, lastValue: 1 });
    const result = await service.generate('c1', prisma);
    expect(result).toBe(`APP-${year}-000001`);
  });

  it('should pad sequence to 6 digits', async () => {
    const year = new Date().getFullYear();
    prisma.applicationCounter.upsert.mockResolvedValue({ companyId: 'c1', year, lastValue: 42 });
    const result = await service.generate('c1', prisma);
    expect(result).toBe(`APP-${year}-000042`);
  });

  it('should use upsert with increment for race safety', async () => {
    const year = new Date().getFullYear();
    prisma.applicationCounter.upsert.mockResolvedValue({ lastValue: 1 });
    await service.generate('c1', prisma);
    expect(prisma.applicationCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_year: { companyId: 'c1', year } },
        update: { lastValue: { increment: 1 } },
      }),
    );
  });

  it('should scope counter per company', async () => {
    const year = new Date().getFullYear();
    prisma.applicationCounter.upsert
      .mockResolvedValueOnce({ lastValue: 1 })
      .mockResolvedValueOnce({ lastValue: 1 });
    await service.generate('company-a', prisma);
    await service.generate('company-b', prisma);
    const calls = prisma.applicationCounter.upsert.mock.calls;
    expect(calls[0][0].where.companyId_year.companyId).toBe('company-a');
    expect(calls[1][0].where.companyId_year.companyId).toBe('company-b');
  });
});
