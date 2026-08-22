import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAiInterviewDto } from '../dto/create-ai-interview.dto';
import { isUUID } from 'class-validator';

describe('CreateAiInterviewDto', () => {
  const VALID_APPLICATION_ID = '00000000-0000-4000-8000-00000000d500';
  const OLD_INVALID_APPLICATION_ID = '00000000-0000-0000-0000-00000000d500';
  const VALID_V4_UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('passes validation with valid seeded application UUID', async () => {
    const dto = plainToInstance(CreateAiInterviewDto, {
      applicationId: VALID_APPLICATION_ID,
      language: 'en',
      estimatedDurationMinutes: 30,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes validation with valid v4 UUID', async () => {
    const dto = plainToInstance(CreateAiInterviewDto, {
      applicationId: VALID_V4_UUID,
      estimatedDurationMinutes: 30,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails validation with version-0 UUID', async () => {
    const dto = plainToInstance(CreateAiInterviewDto, {
      applicationId: OLD_INVALID_APPLICATION_ID,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('applicationId');
    expect(errors[0].constraints).toBeDefined();
  });

  it('fails validation with malformed string', async () => {
    const dto = plainToInstance(CreateAiInterviewDto, {
      applicationId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('applicationId');
  });

  it('fails validation with empty string', async () => {
    const dto = plainToInstance(CreateAiInterviewDto, {
      applicationId: '',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it('fails validation when applicationId is missing', async () => {
    const dto = plainToInstance(CreateAiInterviewDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  describe('estimatedDurationMinutes bounds', () => {
    it.each([0, -1, 4])('rejects duration %i below the 5-minute minimum', async (d) => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        estimatedDurationMinutes: d,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('estimatedDurationMinutes');
    });

    it.each([121, 500, 10000])('rejects duration %i above the 120-minute maximum', async (d) => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        estimatedDurationMinutes: d,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('estimatedDurationMinutes');
    });

    it('rejects non-integer duration', async () => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        estimatedDurationMinutes: 30.5,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('estimatedDurationMinutes');
    });

    it('rejects non-numeric duration string', async () => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        estimatedDurationMinutes: 'abc',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
    });

    it('rejects NaN duration', async () => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        estimatedDurationMinutes: Number.NaN,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('estimatedDurationMinutes');
    });

    it.each([5, 30, 120])('accepts boundary duration %i', async (d) => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        estimatedDurationMinutes: d,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('language', () => {
    it('defaults to undefined when omitted (service applies "en")', async () => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
      });
      expect(dto.language).toBeUndefined();
    });

    it('accepts a language code', async () => {
      const dto = plainToInstance(CreateAiInterviewDto, {
        applicationId: VALID_APPLICATION_ID,
        language: 'es',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.language).toBe('es');
    });
  });
});

describe('isUUID validator with seed UUIDs', () => {
  const seedUuids = [
    '00000000-0000-4000-8000-00000000d001',
    '00000000-0000-4000-8000-00000000d010',
    '00000000-0000-4000-8000-00000000d020',
    '00000000-0000-4000-8000-00000000d030',
    '00000000-0000-4000-8000-00000000d040',
    '00000000-0000-4000-8000-00000000d050',
    '00000000-0000-4000-8000-00000000d060',
    '00000000-0000-4000-8000-00000000d100',
    '00000000-0000-4000-8000-00000000d110',
    '00000000-0000-4000-8000-00000000d111',
    '00000000-0000-4000-8000-00000000d112',
    '00000000-0000-4000-8000-00000000d113',
    '00000000-0000-4000-8000-00000000d114',
    '00000000-0000-4000-8000-00000000d115',
    '00000000-0000-4000-8000-00000000d160',
    '00000000-0000-4000-8000-00000000d170',
    '00000000-0000-4000-8000-00000000d200',
    '00000000-0000-4000-8000-00000000d201',
    '00000000-0000-4000-8000-00000000d202',
    '00000000-0000-4000-8000-00000000d210',
    '00000000-0000-4000-8000-00000000d211',
    '00000000-0000-4000-8000-00000000d212',
    '00000000-0000-4000-8000-00000000d300',
    '00000000-0000-4000-8000-00000000d301',
    '00000000-0000-4000-8000-00000000d302',
    '00000000-0000-4000-8000-00000000d400',
    '00000000-0000-4000-8000-00000000d410',
    '00000000-0000-4000-8000-00000000d500',
  ];

  it.each(seedUuids)('seed UUID %s is valid', (uuid) => {
    expect(isUUID(uuid, 'all')).toBe(true);
  });

  it('version-0 UUID is invalid', () => {
    expect(isUUID('00000000-0000-0000-0000-00000000d500', 'all')).toBe(false);
  });

  it('nil UUID is valid', () => {
    expect(isUUID('00000000-0000-0000-0000-000000000000', 'all')).toBe(true);
  });
});
