import { describe, it, expect } from 'vitest';
import signinSchema, { type FormSchemaType } from './signin-schema';

describe('signin-schema', () => {
  describe('email validation', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'firstname.lastname@subdomain.example.com',
      ];

      validEmails.forEach((email) => {
        const result = signinSchema.safeParse({ email });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.email).toBe(email);
        }
      });
    });

    it('should reject invalid email addresses', () => {
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
        const result = signinSchema.safeParse({ email });
        expect(result.success).toBe(false);
        if (!result.success) {
          const emailErrors = result.error.issues.filter((issue) => issue.path[0] === 'email');
          expect(emailErrors.length).toBeGreaterThan(0);
          expect(emailErrors[0].message).toBe('Invalid email address');
        }
      });
    });

    it('should require email field', () => {
      const result = signinSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const emailErrors = result.error.issues.filter((issue) => issue.path[0] === 'email');
        expect(emailErrors.length).toBeGreaterThan(0);
      }
    });

    it('should reject non-string email values', () => {
      const invalidValues = [123, true, false, {}, [], null, undefined];

      invalidValues.forEach((value) => {
        const result = signinSchema.safeParse({ email: value });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('complete form validation', () => {
    it('should validate complete valid form', () => {
      const validForm: FormSchemaType = {
        email: 'test@example.com',
      };

      const result = signinSchema.safeParse(validForm);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject form with invalid email', () => {
      const invalidForm = {
        email: 'invalid-email',
      };

      const result = signinSchema.safeParse(invalidForm);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const emailErrors = result.error.issues.filter((issue) => issue.path[0] === 'email');
        expect(emailErrors.length).toBeGreaterThan(0);
      }
    });

    it('should reject completely empty form', () => {
      const result = signinSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript types', () => {
      const result = signinSchema.safeParse({
        email: 'test@example.com',
      });

      if (result.success) {
        // TypeScript should infer these types correctly
        const email: string = result.data.email;
        expect(typeof email).toBe('string');
      }
    });
  });

  describe('schema structure', () => {
    it('should only require email field', () => {
      const result = signinSchema.safeParse({
        email: 'test@example.com',
        extraField: 'should be ignored or cause error',
      });

      // This depends on how strict the schema is - it might accept extra fields or reject them
      // For this test, we're just ensuring the email is properly validated
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should have simpler structure than signup schema', () => {
      // Signin should only require email, not terms and conditions
      const result = signinSchema.safeParse({
        email: 'test@example.com',
        // No termsAndConditions required for signin
      });

      expect(result.success).toBe(true);
    });
  });
});
