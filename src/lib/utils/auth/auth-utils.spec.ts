/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock bcrypt to speed up tests
import { isValidEmail, setUnknownError, EMAIL_REGEX } from './auth-utils';

import type { FormState } from '../../types/form-state';

describe('auth-utils', () => {
  describe('EMAIL_REGEX', () => {
    it('should be defined', () => {
      expect(EMAIL_REGEX).toBeDefined();
      expect(EMAIL_REGEX).toBeInstanceOf(RegExp);
    });

    it('should match valid email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user_name@example-domain.com',
        'firstname.lastname@subdomain.example.com',
      ];

      validEmails.forEach((email) => {
        expect(EMAIL_REGEX.test(email)).toBe(true);
      });
    });

    it('should not match invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..name@example.com',
        'user@.com',
        'user@com',
        '',
      ];

      invalidEmails.forEach((email) => {
        expect(EMAIL_REGEX.test(email)).toBe(false);
      });
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = ['test@example.com', 'user.name@domain.co.uk', 'user+tag@example.org'];

      validEmails.forEach((email) => {
        expect(isValidEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..name@example.com',
        '',
        'a'.repeat(255) + '@example.com', // Too long
        'user@example', // No TLD
        '.user@example.com', // Starts with dot
        'user.@example.com', // Ends with dot
      ];

      invalidEmails.forEach((email) => {
        expect(isValidEmail(email)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('a@b.co')).toBe(true);
      expect(isValidEmail('user@' + 'a'.repeat(250) + '.com')).toBe(false); // Domain too long
    });
  });

  describe('setUnknownError', () => {
    it('should set general error when errors object does not exist', () => {
      const formState: FormState = {
        fields: {},
        success: false,
      };

      setUnknownError(formState);

      expect(formState.errors).toBeDefined();
      expect(formState.errors?.general).toBeDefined();
      expect(formState.errors?.general).toContain('An unknown error occurred');
    });

    it('should set general error when errors object exists but general does not', () => {
      const formState: FormState = {
        fields: {},
        success: false,
        errors: {
          email: ['Some email error'],
        },
      };

      setUnknownError(formState);

      expect(formState.errors?.general).toBeDefined();
      expect(formState.errors?.general).toContain('An unknown error occurred');
      expect(formState.errors?.email).toContain('Some email error'); // Should preserve existing errors
    });

    it('should append to existing general errors', () => {
      const formState: FormState = {
        fields: {},
        success: false,
        errors: {
          general: ['Existing error'],
        },
      };

      setUnknownError(formState);

      expect(formState.errors?.general?.length).toBe(2);
      expect(formState.errors?.general).toContain('Existing error');
      expect(formState.errors?.general).toContain('An unknown error occurred');
    });

    it('should use custom error message when provided', () => {
      const formState: FormState = {
        fields: {},
        success: false,
      };

      const customMessage = 'Custom error message';
      setUnknownError(formState, customMessage);

      expect(formState.errors?.general).toContain(customMessage);
      expect(formState.errors?.general).not.toContain('An unknown error occurred');
    });
  });
});
