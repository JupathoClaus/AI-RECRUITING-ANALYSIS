import { AiInterviewCodeService } from '../services/ai-interview-code.service';

describe('AiInterviewCodeService', () => {
  let service: AiInterviewCodeService;

  beforeEach(() => {
    service = new AiInterviewCodeService();
  });

  describe('generate', () => {
    it('should return a code in ABCD-EFGH format', () => {
      const code = service.generate();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    });

    it('should not contain ambiguous characters (O, 0, I, 1)', () => {
      for (let i = 0; i < 100; i++) {
        const code = service.generate();
        expect(code).not.toContain('O');
        expect(code).not.toContain('0');
        expect(code).not.toContain('I');
        expect(code).not.toContain('1');
      }
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(service.generate());
      }
      expect(codes.size).toBe(100);
    });
  });

  describe('hash', () => {
    it('should return a SHA-256 hex string', () => {
      const hash = service.hash('ABCD-EFGH');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should normalize before hashing', () => {
      const hash1 = service.hash('ABCD-EFGH');
      const hash2 = service.hash('abcdefgh');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different codes', () => {
      const hash1 = service.hash('ABCD-EFGH');
      const hash2 = service.hash('WXYZ-2345');
      expect(hash1).not.toBe(hash2);
    });

    it('should not return the raw code', () => {
      const rawCode = 'ABCD-EFGH';
      const hash = service.hash(rawCode);
      expect(hash).not.toBe(rawCode);
      expect(hash).not.toContain(rawCode);
    });
  });

  describe('normalize', () => {
    it('should convert to uppercase', () => {
      expect(service.normalize('abcd-efgh')).toBe('ABCDEFGH');
    });

    it('should remove hyphens and spaces', () => {
      expect(service.normalize('ABCD-EFGH')).toBe('ABCDEFGH');
      expect(service.normalize('ABCD EFGH')).toBe('ABCDEFGH');
    });

    it('should strip ambiguous characters', () => {
      expect(service.normalize('ABCO-EFGH')).toBe('ABCEFGH');
      expect(service.normalize('ABC0-EFGH')).toBe('ABCEFGH');
      expect(service.normalize('ABCI-EFGH')).toBe('ABCEFGH');
      expect(service.normalize('ABC1-EFGH')).toBe('ABCEFGH');
    });
  });

  describe('validate', () => {
    it('should accept valid formatted code', () => {
      expect(service.validate('ABCD-EFGH')).toBe(true);
    });

    it('should accept valid unformatted code', () => {
      expect(service.validate('ABCDEFGH')).toBe(true);
    });

    it('should reject codes with ambiguous characters', () => {
      expect(service.validate('ABCO-EFGH')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(service.validate('')).toBe(false);
    });

    it('should reject short codes', () => {
      expect(service.validate('ABC')).toBe(false);
    });

    it('should reject long codes', () => {
      expect(service.validate('ABCD-EFGH-XYZ')).toBe(false);
    });
  });

  describe('displayHint', () => {
    it('should mask all but last 4 chars', () => {
      expect(service.displayHint('ABCDEFGH')).toBe('****-EFGH');
    });

    it('should normalize before masking', () => {
      expect(service.displayHint('abcdefgh')).toBe('****-EFGH');
    });
  });

  describe('verify code flow', () => {
    it('should verify a generated code', () => {
      const rawCode = service.generate();
      const hash = service.hash(rawCode);
      const inputHash = service.hash(rawCode);
      expect(inputHash).toBe(hash);
    });

    it('should reject an invalid code', () => {
      const rawCode = service.generate();
      const hash = service.hash(rawCode);
      const wrongHash = service.hash('XXXX-XXXX');
      expect(wrongHash).not.toBe(hash);
    });
  });
});
