import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../services/password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'auth.bcryptRounds': 10,
      };
      return config[key];
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should accept a valid strong password', () => {
    const result = service.validatePasswordPolicy('Str0ng!Passw0rd');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject a password shorter than 12 characters', () => {
    const result = service.validatePasswordPolicy('Short1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 12 characters long');
  });

  it('should reject a password without uppercase letters', () => {
    const result = service.validatePasswordPolicy('lowercaseonly1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should reject a password without lowercase letters', () => {
    const result = service.validatePasswordPolicy('UPPERCASEONLY1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should reject a password without numbers', () => {
    const result = service.validatePasswordPolicy('OnlyLetters!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should reject a password without symbols', () => {
    const result = service.validatePasswordPolicy('OnlyLetters1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one symbol');
  });

  it('should reject a password containing the email local part', () => {
    const result = service.validatePasswordPolicy('john!Strong1', 'john@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must not contain your email address');
  });

  it('should reject a password containing the first name', () => {
    const result = service.validatePasswordPolicy('Alice!Strong1', 'test@example.com', 'Alice');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must not contain your first name');
  });

  it('should reject known weak passwords', () => {
    const result = service.validatePasswordPolicy('password');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('This password is too common and easy to guess');
  });

  it('should hash and verify passwords correctly', async () => {
    const password = 'Str0ng!P@ssw0rd';
    const hash = await service.hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash).toContain('$2a$');

    const isValid = await service.verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password during verification', async () => {
    const hash = await service.hashPassword('Str0ng!P@ssw0rd');
    const isValid = await service.verifyPassword('WrongPassword1!', hash);
    expect(isValid).toBe(false);
  });

  it('should detect when password is same as current', async () => {
    const password = 'Str0ng!P@ssw0rd!';
    const hash = await service.hashPassword(password);
    const isSame = await service.isSameAsCurrent(password, hash);
    expect(isSame).toBe(true);
  });
});
