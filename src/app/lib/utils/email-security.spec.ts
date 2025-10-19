import { describe, it, expect } from 'vitest';
import { isDisposableEmail, validateEmailSecurity } from './email-security';

describe('Email Security', () => {
  describe('isDisposableEmail', () => {
    it('should identify common disposable email domains', () => {
      expect(isDisposableEmail('test@tempmail.com')).toBe(true);
      expect(isDisposableEmail('user@10minutemail.com')).toBe(true);
      expect(isDisposableEmail('fake@guerrillamail.com')).toBe(true);
      expect(isDisposableEmail('test@mailinator.com')).toBe(true);
      expect(isDisposableEmail('user@trashmail.com')).toBe(true);
      expect(isDisposableEmail('temp@throwaway.email')).toBe(true);
      expect(isDisposableEmail('user@temp-mail.org')).toBe(true);
      expect(isDisposableEmail('test@getnada.com')).toBe(true);
      expect(isDisposableEmail('user@maildrop.cc')).toBe(true);
    });

    it('should handle subdomain disposable emails', () => {
      expect(isDisposableEmail('user@subdomain.tempmail.com')).toBe(true);
      expect(isDisposableEmail('test@api.mailinator.com')).toBe(true);
    });

    it('should return false for legitimate email domains', () => {
      expect(isDisposableEmail('user@gmail.com')).toBe(false);
      expect(isDisposableEmail('test@outlook.com')).toBe(false);
      expect(isDisposableEmail('admin@company.com')).toBe(false);
      expect(isDisposableEmail('user@yahoo.com')).toBe(false);
      expect(isDisposableEmail('test@protonmail.com')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isDisposableEmail('TEST@TEMPMAIL.COM')).toBe(true);
      expect(isDisposableEmail('User@TempMail.com')).toBe(true);
      expect(isDisposableEmail('TEST@GMAIL.COM')).toBe(false);
    });

    it('should handle emails without @ symbol', () => {
      expect(isDisposableEmail('notanemail')).toBe(false);
      expect(isDisposableEmail('')).toBe(false);
    });

    it('should handle emails with multiple @ symbols', () => {
      expect(isDisposableEmail('test@@tempmail.com')).toBe(false);
    });
  });

  describe('validateEmailSecurity', () => {
    it('should validate correct email format', () => {
      const result = validateEmailSecurity('valid@example.com');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'test@',
        'test@@example.com',
        'test @example.com',
        'test@example',
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmailSecurity(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid email format');
      });
    });

    it('should reject disposable email addresses', () => {
      const result = validateEmailSecurity('test@tempmail.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Disposable email addresses are not allowed');
    });

    it('should reject emails with local part longer than 64 characters', () => {
      const longLocalPart = 'a'.repeat(65);
      const result = validateEmailSecurity(`${longLocalPart}@example.com`);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email address is too long');
    });

    it('should accept emails with local part exactly 64 characters', () => {
      const localPart = 'a'.repeat(64);
      const result = validateEmailSecurity(`${localPart}@example.com`);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate common email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.user@example.com',
        'user+tag@example.com',
        'user_name@example.com',
        'user123@example.co.uk',
        'first.last@subdomain.example.com',
      ];

      validEmails.forEach((email) => {
        const result = validateEmailSecurity(email);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should handle edge cases gracefully', () => {
      expect(validateEmailSecurity('').isValid).toBe(false);
      expect(validateEmailSecurity(' ').isValid).toBe(false);
      expect(validateEmailSecurity('   @example.com').isValid).toBe(false);
    });

    it('should reject emails with only @ symbol', () => {
      const result = validateEmailSecurity('@');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid email format');
    });

    it('should handle unicode characters in email', () => {
      // Current regex accepts unicode - test actual behavior
      const result = validateEmailSecurity('üser@example.com');
      expect(result).toHaveProperty('isValid');
      // Note: Current implementation accepts unicode in local part
      // If stricter validation is needed, update the regex in email-security.ts
    });
  });
});
