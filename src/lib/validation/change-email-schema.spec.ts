import changeEmailSchema, { type ChangeEmailFormData } from './change-email-schema';

describe('changeEmailSchema', () => {
  describe('valid data', () => {
    it('should accept valid email data without previousEmail', () => {
      const validData: ChangeEmailFormData = {
        email: 'new@example.com',
        confirmEmail: 'new@example.com',
      };

      const result = changeEmailSchema.safeParse(validData);
      expect(result).toMatchObject({ success: true, data: validData });
    });

    it('should accept valid email data with previousEmail', () => {
      const validData = {
        email: 'new@example.com',
        confirmEmail: 'new@example.com',
        previousEmail: 'old@example.com',
      };

      const result = changeEmailSchema.safeParse(validData);
      expect(result).toMatchObject({ success: true, data: validData });
    });

    it('should accept previousEmail as undefined', () => {
      const validData = {
        email: 'new@example.com',
        confirmEmail: 'new@example.com',
        previousEmail: undefined,
      };

      const result = changeEmailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid data', () => {
    it('should reject invalid email format', () => {
      const invalidData = {
        email: 'invalid-email',
        confirmEmail: 'invalid-email',
      };

      const result = changeEmailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('Invalid email address');
    });

    it('should reject mismatched emails', () => {
      const invalidData = {
        email: 'first@example.com',
        confirmEmail: 'second@example.com',
      };

      const result = changeEmailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ message: string; path: string[] }> };
      };
      expect(errorResult.error.issues[0].message).toBe('Email addresses do not match');
      expect(errorResult.error.issues[0].path).toEqual(['confirmEmail']);
    });

    it('should require email field', () => {
      const invalidData = {
        confirmEmail: 'test@example.com',
      };

      const result = changeEmailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should require confirmEmail field', () => {
      const invalidData = {
        email: 'test@example.com',
      };

      const result = changeEmailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings in email fields', () => {
      const invalidData = {
        email: '',
        confirmEmail: '',
      };

      const result = changeEmailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should handle whitespace-only emails', () => {
      const invalidData = {
        email: '   ',
        confirmEmail: '   ',
      };

      const result = changeEmailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
