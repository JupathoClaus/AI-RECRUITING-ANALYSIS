import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

const WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  'qwerty123',
  'abc123',
  'letmein',
  'welcome',
  'admin',
  'test',
  'passw0rd',
  'P@ssw0rd',
]);

const SYMBOL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;
const UPPERCASE_REGEX = /[A-Z]/;
const LOWERCASE_REGEX = /[a-z]/;
const DIGIT_REGEX = /\d/;

@Injectable()
export class PasswordService {
  private readonly bcryptRounds: number;

  constructor(private readonly configService: ConfigService) {
    this.bcryptRounds = this.configService.get<number>('auth.bcryptRounds') ?? 10;
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async isSameAsCurrent(plain: string, currentHash: string): Promise<boolean> {
    return this.verifyPassword(plain, currentHash);
  }

  validatePasswordPolicy(
    password: string,
    email?: string,
    firstName?: string,
    lastName?: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must not exceed 128 characters');
    }

    if (!UPPERCASE_REGEX.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!LOWERCASE_REGEX.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!DIGIT_REGEX.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!SYMBOL_REGEX.test(password)) {
      errors.push('Password must contain at least one symbol');
    }

    if (email) {
      const localPart = email.split('@')[0].toLowerCase();
      if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
        errors.push('Password must not contain your email address');
      }
    }

    if (
      firstName &&
      firstName.length >= 2 &&
      password.toLowerCase().includes(firstName.toLowerCase())
    ) {
      errors.push('Password must not contain your first name');
    }

    if (
      lastName &&
      lastName.length >= 2 &&
      password.toLowerCase().includes(lastName.toLowerCase())
    ) {
      errors.push('Password must not contain your last name');
    }

    if (WEAK_PASSWORDS.has(password.toLowerCase())) {
      errors.push('This password is too common and easy to guess');
    }

    return { valid: errors.length === 0, errors };
  }
}
