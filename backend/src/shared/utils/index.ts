import { plainToInstance, instanceToPlain } from 'class-transformer';
import { validate } from 'class-validator';

export const transformToDto = <T>(plain: Record<string, unknown>, dtoClass: new () => T): T => {
  return plainToInstance(dtoClass, plain, {
    enableImplicitConversion: true,
    excludeExtraneousValues: true,
  });
};

export const transformToPlain = <T>(instance: T): Record<string, unknown> => {
  return instanceToPlain(instance) as Record<string, unknown>;
};

export const validateDto = async <T extends object>(
  data: unknown,
  dtoClass: new () => T,
): Promise<{ isValid: boolean; errors?: string[] }> => {
  const dto = plainToInstance(dtoClass, data, {
    enableImplicitConversion: true,
  });

  const errors = await validate(dto);

  if (errors.length > 0) {
    const errorMessages = errors.flatMap((error) => Object.values(error.constraints || []));
    return { isValid: false, errors: errorMessages };
  }

  return { isValid: true };
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const generateRandomId = (length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const removeUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
};

export const flattenObject = (
  obj: Record<string, unknown>,
  prefix: string = '',
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
};
