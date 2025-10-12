import { describe, it, expect } from 'vitest';
import { splitFullName, formatPhoneNumber } from './profile-utils';

describe('profile-utils', () => {
  describe('splitFullName', () => {
    it('should split a full name into first and last name', () => {
      expect(splitFullName('John Doe')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    it('should handle single names', () => {
      expect(splitFullName('John')).toEqual({
        firstName: 'John',
        lastName: ''
      });
    });

    it('should handle multiple middle names', () => {
      expect(splitFullName('John Michael Doe')).toEqual({
        firstName: 'John',
        lastName: 'Michael Doe'
      });
    });

    it('should handle empty or null names', () => {
      expect(splitFullName('')).toEqual({
        firstName: '',
        lastName: ''
      });

      expect(splitFullName(null)).toEqual({
        firstName: '',
        lastName: ''
      });

      expect(splitFullName(undefined)).toEqual({
        firstName: '',
        lastName: ''
      });
    });

    it('should handle names with extra whitespace', () => {
      expect(splitFullName('  John   Doe  ')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format 10-digit US phone numbers', () => {
      expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
      expect(formatPhoneNumber('123-456-7890')).toBe('(123) 456-7890');
      expect(formatPhoneNumber('(123) 456-7890')).toBe('(123) 456-7890');
    });

    it('should format 11-digit US phone numbers with country code', () => {
      expect(formatPhoneNumber('11234567890')).toBe('+1 (123) 456-7890');
      expect(formatPhoneNumber('+1-123-456-7890')).toBe('+1 (123) 456-7890');
    });

    it('should handle empty or null phone numbers', () => {
      expect(formatPhoneNumber('')).toBe('');
      expect(formatPhoneNumber(null)).toBe('');
      expect(formatPhoneNumber(undefined)).toBe('');
    });

    it('should return original format for unrecognized patterns', () => {
      expect(formatPhoneNumber('123')).toBe('123');
      expect(formatPhoneNumber('123456789012')).toBe('123456789012');
    });
  });
});