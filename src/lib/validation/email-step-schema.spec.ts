/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { emailStepSchema } from '@/lib/validation/email-step-schema';
import type { EmailStepFormSchemaType } from '@/lib/validation/email-step-schema';

describe('emailStepSchema', () => {
  const validData: EmailStepFormSchemaType = {
    email: 'test@example.com',
    termsAndConditions: true,
  };

  describe('email field', () => {
    it('should accept a valid email address', () => {
      const result = emailStepSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject an empty email', () => {
      const result = emailStepSchema.safeParse({ ...validData, email: '' });
      expect(result.success).toBe(false);
    });

    it('should reject an invalid email format', () => {
      const result = emailStepSchema.safeParse({ ...validData, email: 'not-an-email' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'email');
      expect(errors?.[0]?.message).toBe('Invalid email address');
    });

    it('should reject an email without a domain', () => {
      const result = emailStepSchema.safeParse({ ...validData, email: 'user@' });
      expect(result.success).toBe(false);
    });

    it('should reject an email without a local part', () => {
      const result = emailStepSchema.safeParse({ ...validData, email: '@example.com' });
      expect(result.success).toBe(false);
    });

    it('should accept emails with subdomains', () => {
      const result = emailStepSchema.safeParse({
        ...validData,
        email: 'user@mail.example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept emails with plus addressing', () => {
      const result = emailStepSchema.safeParse({
        ...validData,
        email: 'user+tag@example.com',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('termsAndConditions field', () => {
    it('should accept true', () => {
      const result = emailStepSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject false', () => {
      const result = emailStepSchema.safeParse({ ...validData, termsAndConditions: false });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'termsAndConditions');
      expect(errors?.[0]?.message).toBe('You must accept the terms and conditions');
    });

    it('should reject when missing', () => {
      const { termsAndConditions: _, ...withoutTerms } = validData;
      const result = emailStepSchema.safeParse(withoutTerms);
      expect(result.success).toBe(false);
    });
  });

  describe('full form validation', () => {
    it('should accept complete valid data', () => {
      const result = emailStepSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject an empty object', () => {
      const result = emailStepSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error?.issues.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject when both fields are invalid', () => {
      const result = emailStepSchema.safeParse({
        email: 'bad',
        termsAndConditions: false,
      });
      expect(result.success).toBe(false);
      const paths = result.error?.issues.map((i) => i.path[0]);
      expect(paths).toContain('email');
      expect(paths).toContain('termsAndConditions');
    });
  });
});
