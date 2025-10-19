import signupSchema, { type FormSchemaType } from './signup-schema';

describe('signup-schema', () => {
  describe('email validation', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'firstname.lastname@subdomain.example.com',
      ];

      validEmails.forEach((email) => {
        const result = signupSchema.safeParse({
          email,
          termsAndConditions: true,
        });
        expect(result.success).toBe(true);
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
        const result = signupSchema.safeParse({
          email,
          termsAndConditions: true,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const emailErrors = result.error.issues.filter((issue) => issue.path[0] === 'email');
          expect(emailErrors.length).toBeGreaterThan(0);
        }
      });
    });

    it('should require email field', () => {
      const result = signupSchema.safeParse({
        termsAndConditions: true,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const emailErrors = result.error.issues.filter((issue) => issue.path[0] === 'email');
        expect(emailErrors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('termsAndConditions validation', () => {
    it('should accept true value', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
        termsAndConditions: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject false value', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
        termsAndConditions: false,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const termsErrors = result.error.issues.filter(
          (issue) => issue.path[0] === 'termsAndConditions'
        );
        expect(termsErrors.length).toBeGreaterThan(0);
        expect(termsErrors[0].message).toBe('You must accept the terms and conditions');
      }
    });

    it('should require termsAndConditions field', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const termsErrors = result.error.issues.filter(
          (issue) => issue.path[0] === 'termsAndConditions'
        );
        expect(termsErrors.length).toBeGreaterThan(0);
      }
    });

    it('should reject non-boolean values', () => {
      const invalidValues = ['true', 'false', 1, 0, 'yes', 'no', null, undefined];

      invalidValues.forEach((value) => {
        const result = signupSchema.safeParse({
          email: 'test@example.com',
          termsAndConditions: value,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('general field validation', () => {
    it('should accept optional general field', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
        termsAndConditions: true,
        general: 'some general info',
      });
      expect(result.success).toBe(true);
    });

    it('should accept missing general field', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
        termsAndConditions: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty string for general field', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
        termsAndConditions: true,
        general: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-string values for general field', () => {
      const invalidValues = [123, true, false, {}, []];

      invalidValues.forEach((value) => {
        const result = signupSchema.safeParse({
          email: 'test@example.com',
          termsAndConditions: true,
          general: value,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('complete form validation', () => {
    it('should validate complete valid form', () => {
      const validForm: FormSchemaType = {
        email: 'test@example.com',
        termsAndConditions: true,
        general: 'Optional info',
      };

      const result = signupSchema.safeParse(validForm);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
        expect(result.data.termsAndConditions).toBe(true);
        expect(result.data.general).toBe('Optional info');
      }
    });

    it('should reject form with multiple invalid fields', () => {
      const invalidForm = {
        email: 'invalid-email',
        termsAndConditions: false,
        general: 123,
      };

      const result = signupSchema.safeParse(invalidForm);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(2); // Should have errors for email, terms, and general

        const fieldErrors = result.error.issues.map((issue) => issue.path[0]);
        expect(fieldErrors).toContain('email');
        expect(fieldErrors).toContain('termsAndConditions');
        expect(fieldErrors).toContain('general');
      }
    });

    it('should reject completely empty form', () => {
      const result = signupSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(2); // email and termsAndConditions required
      }
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript types', () => {
      const result = signupSchema.safeParse({
        email: 'test@example.com',
        termsAndConditions: true,
        general: 'info',
      });

      if (result.success) {
        // TypeScript should infer these types correctly
        const email: string = result.data.email;
        const terms: boolean = result.data.termsAndConditions;
        const general: string | undefined = result.data.general;

        expect(typeof email).toBe('string');
        expect(typeof terms).toBe('boolean');
        expect(typeof general === 'string' || typeof general === 'undefined').toBe(true);
      }
    });
  });
});
