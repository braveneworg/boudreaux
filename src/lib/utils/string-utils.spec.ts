import { toPascalCase } from './string-utils';

describe('toPascalCase', () => {
  describe('basic conversions', () => {
    it('should convert single word to PascalCase', () => {
      expect(toPascalCase('hello')).toBe('Hello');
    });

    it('should convert multiple words separated by spaces', () => {
      expect(toPascalCase('hello world')).toBe('HelloWorld');
    });

    it('should convert three or more words', () => {
      expect(toPascalCase('hello world test')).toBe('HelloWorldTest');
    });

    it('should handle already PascalCase strings', () => {
      expect(toPascalCase('HelloWorld')).toBe('HelloWorld');
    });
  });

  describe('case handling', () => {
    it('should convert lowercase to PascalCase', () => {
      expect(toPascalCase('lowercase string')).toBe('LowercaseString');
    });

    it('should convert UPPERCASE to PascalCase', () => {
      expect(toPascalCase('UPPERCASE STRING')).toBe('UPPERCASESTRING');
    });

    it('should convert mixedCase to PascalCase', () => {
      expect(toPascalCase('mIxEd CaSe')).toBe('MIxEdCaSe');
    });

    it('should convert camelCase to PascalCase', () => {
      expect(toPascalCase('camelCase')).toBe('CamelCase');
    });

    it('should convert snake_case-like string to PascalCase', () => {
      expect(toPascalCase('snake case')).toBe('SnakeCase');
    });
  });

  describe('whitespace handling', () => {
    it('should remove single spaces between words', () => {
      expect(toPascalCase('hello world')).toBe('HelloWorld');
    });

    it('should remove multiple spaces between words', () => {
      expect(toPascalCase('hello    world')).toBe('HelloWorld');
    });

    it('should trim leading spaces', () => {
      expect(toPascalCase('  hello world')).toBe('HelloWorld');
    });

    it('should trim trailing spaces', () => {
      expect(toPascalCase('hello world  ')).toBe('HelloWorld');
    });

    it('should handle tabs as whitespace', () => {
      expect(toPascalCase('hello\tworld')).toBe('HelloWorld');
    });

    it('should handle newlines as whitespace', () => {
      expect(toPascalCase('hello\nworld')).toBe('HelloWorld');
    });

    it('should handle mixed whitespace characters', () => {
      expect(toPascalCase('hello \t\n world')).toBe('HelloWorld');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(toPascalCase('')).toBe('');
    });

    it('should handle string with only spaces', () => {
      expect(toPascalCase('   ')).toBe('');
    });

    it('should handle single character', () => {
      expect(toPascalCase('a')).toBe('A');
    });

    it('should handle single uppercase character', () => {
      expect(toPascalCase('A')).toBe('A');
    });

    it('should handle numbers at start of words', () => {
      expect(toPascalCase('1st place')).toBe('1stPlace');
    });

    it('should handle numbers within words', () => {
      expect(toPascalCase('test123 string')).toBe('Test123String');
    });

    it('should handle special characters by treating them as word boundaries', () => {
      expect(toPascalCase('hello-world')).toBe('HelloWorld');
    });

    it('should handle apostrophes', () => {
      expect(toPascalCase("don't stop")).toBe("Don'TStop");
    });
  });

  describe('real-world examples', () => {
    it('should convert user profile to UserProfile', () => {
      expect(toPascalCase('user profile')).toBe('UserProfile');
    });

    it('should convert admin dashboard to AdminDashboard', () => {
      expect(toPascalCase('admin dashboard')).toBe('AdminDashboard');
    });

    it('should convert react component name to ReactComponentName', () => {
      expect(toPascalCase('react component name')).toBe('ReactComponentName');
    });

    it('should convert database table name to DatabaseTableName', () => {
      expect(toPascalCase('database table name')).toBe('DatabaseTableName');
    });

    it('should convert http request handler to HttpRequestHandler', () => {
      expect(toPascalCase('http request handler')).toBe('HttpRequestHandler');
    });
  });

  describe('type safety', () => {
    it('should accept and return string type', () => {
      const input = 'test string';
      const result: string = toPascalCase(input);
      expect(typeof result).toBe('string');
    });
  });
});
