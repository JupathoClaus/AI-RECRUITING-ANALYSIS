import { CsvExportService } from '../exporters/csv-export.service';

describe('CsvExportService', () => {
  let service: CsvExportService;

  beforeAll(() => {
    service = new CsvExportService();
  });

  describe('toCsv', () => {
    it('handles formula injection =', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: '=SUM(A1:A10)' }]);
      expect(csv).toContain("'=SUM(A1:A10)");
    });

    it('handles formula injection +', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: '+123' }]);
      expect(csv).toContain("'+123");
    });

    it('handles formula injection -', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: '-123' }]);
      expect(csv).toContain("'-123");
    });

    it('handles formula injection @', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: '@SUM' }]);
      expect(csv).toContain("'@SUM");
    });

    it('escapes commas in values', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: 'a,b,c' }]);
      expect(csv).toContain('"a,b,c"');
    });

    it('escapes double quotes', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: 'say "hello"' }]);
      expect(csv).toContain('"say ""hello"""');
    });

    it('handles newlines', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: 'line1\nline2' }]);
      expect(csv).toContain('"line1\nline2"');
    });

    it('handles null values', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: null }]);
      expect(csv).toMatch(/^Value\r\n$/);
    });

    it('handles undefined values', () => {
      const csv = service.toCsv([{ key: 'val', label: 'Value' }], [{ val: undefined }]);
      expect(csv).toMatch(/^Value\r\n$/);
    });

    it('passes safe ordinary values through', () => {
      const csv = service.toCsv([{ key: 'name', label: 'Name' }], [{ name: 'Alice' }]);
      expect(csv).toContain('Alice');
    });

    it('includes header row', () => {
      const csv = service.toCsv([{ key: 'a', label: 'Alpha' }], [{ a: '1' }]);
      expect(csv).toMatch(/^Alpha\r\n1/);
    });

    it('protects headers from formula injection', () => {
      const csv = service.toCsv([{ key: 'v', label: '=SUM' }], [{ v: '1' }]);
      expect(csv).toContain("'=SUM");
    });
  });

  describe('getContentType', () => {
    it('returns text/csv', () => {
      expect(service.getContentType()).toBe('text/csv; charset=utf-8');
    });
  });

  describe('getFilename', () => {
    it('includes report name and date', () => {
      const name = service.getFilename('candidate-evaluation');
      expect(name).toMatch(/^candidate-evaluation-\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });
});
