import { splitFullName } from './split-full-name';

describe('splitFullName', () => {
  describe('basic splitting', () => {
    it('should split a simple first and last name', () => {
      const result = splitFullName('John Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should handle three-part names', () => {
      const result = splitFullName('John Michael Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Michael Doe' });
    });

    it('should handle four-part names', () => {
      const result = splitFullName('John Michael William Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Michael William Doe' });
    });
  });

  describe('single name', () => {
    it('should handle a single name (first name only)', () => {
      const result = splitFullName('Madonna');
      expect(result).toEqual({ firstName: 'Madonna', lastName: '' });
    });

    it('should handle a single name with spaces before/after', () => {
      const result = splitFullName('  Prince  ');
      expect(result).toEqual({ firstName: 'Prince', lastName: '' });
    });
  });

  describe('edge cases', () => {
    it('should return empty strings for empty input', () => {
      const result = splitFullName('');
      expect(result).toEqual({ firstName: '', lastName: '' });
    });

    it('should return empty strings for whitespace-only input', () => {
      const result = splitFullName('   ');
      expect(result).toEqual({ firstName: '', lastName: '' });
    });

    it('should handle multiple spaces between names', () => {
      const result = splitFullName('John   Doe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should trim leading and trailing whitespace', () => {
      const result = splitFullName('  John Doe  ');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should handle tabs as whitespace', () => {
      const result = splitFullName('John\tDoe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should handle newlines as whitespace', () => {
      const result = splitFullName('John\nDoe');
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });
  });

  describe('hyphenated names', () => {
    it('should keep hyphenated last names together', () => {
      const result = splitFullName('Mary Jane Watson-Parker');
      expect(result).toEqual({ firstName: 'Mary', lastName: 'Jane Watson-Parker' });
    });

    it('should keep hyphenated first names together', () => {
      const result = splitFullName('Jean-Pierre Blanc');
      expect(result).toEqual({ firstName: 'Jean-Pierre', lastName: 'Blanc' });
    });
  });

  describe('names with special characters', () => {
    it('should handle names with apostrophes', () => {
      const result = splitFullName("Patrick O'Brien");
      expect(result).toEqual({ firstName: 'Patrick', lastName: "O'Brien" });
    });

    it('should handle names with accented characters', () => {
      const result = splitFullName('José García');
      expect(result).toEqual({ firstName: 'José', lastName: 'García' });
    });
  });
});
