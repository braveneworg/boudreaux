import { z } from 'zod';

import getActionState from './get-action-state';

describe('get-action-state', () => {
  const mockSchema = z.object({
    email: z.string().email(),
    termsAndConditions: z.boolean(),
    username: z.string().optional(),
  });

  // Schema for testing boolean conversion in isolation
  const booleanTestSchema = z.object({
    termsAndConditions: z.boolean(),
  });

  // Schema for testing mixed field conversion
  const mixedTestSchema = z.object({
    email: z.string().email(),
    username: z.string().optional(),
  });

  let formData: FormData;

  beforeEach(() => {
    formData = new FormData();
  });

  describe('field filtering', () => {
    it('should only include permitted field names', () => {
      formData.append('email', 'test@example.com');
      formData.append('termsAndConditions', 'on');
      formData.append('maliciousField', 'malicious-value');
      formData.append('anotherBadField', 'bad-value');

      const permittedFields = ['email', 'termsAndConditions'];
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields.email).toBe('test@example.com');
      expect(formState.fields.termsAndConditions).toBe('on');
      expect(formState.fields.maliciousField).toBeUndefined();
      expect(formState.fields.anotherBadField).toBeUndefined();
    });

    it('should handle empty permitted fields array', () => {
      formData.append('email', 'test@example.com');
      formData.append('termsAndConditions', 'on');

      const permittedFields: string[] = [];
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(Object.keys(formState.fields)).toHaveLength(0);
    });
  });

  describe('boolean conversion', () => {
    it('should convert "on" to true', () => {
      formData.append('termsAndConditions', 'on');

      const permittedFields = ['termsAndConditions'];
      const { parsed } = getActionState(formData, permittedFields, booleanTestSchema);

      expect(parsed.success).toBe(true);
      expect(
        (parsed as { success: true; data: { termsAndConditions: boolean } }).data.termsAndConditions
      ).toBe(true);
    });

    it('should convert "off" to false', () => {
      formData.append('termsAndConditions', 'off');

      const permittedFields = ['termsAndConditions'];
      const { parsed } = getActionState(formData, permittedFields, booleanTestSchema);

      expect(parsed.success).toBe(true);
      expect(
        (parsed as { success: true; data: { termsAndConditions: boolean } }).data.termsAndConditions
      ).toBe(false);
    });

    it('should convert "false" string to false for termsAndConditions field', () => {
      formData.append('termsAndConditions', 'false');

      const permittedFields = ['termsAndConditions'];
      const { parsed } = getActionState(formData, permittedFields, booleanTestSchema);

      expect(parsed.success).toBe(true);
      expect(
        (parsed as { success: true; data: { termsAndConditions: boolean } }).data.termsAndConditions
      ).toBe(false);
    });

    it('should leave other string values unchanged', () => {
      formData.append('email', 'test@example.com');
      formData.append('username', 'testuser');

      const permittedFields = ['email', 'username'];
      const { parsed } = getActionState(formData, permittedFields, mixedTestSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { email: string; username?: string } };
      expect(successParsed.data.email).toBe('test@example.com');
      expect(successParsed.data.username).toBe('testuser');
    });
  });

  describe('form state initialization', () => {
    it('should initialize form state with correct structure', () => {
      const permittedFields = ['email'];
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState).toHaveProperty('errors');
      expect(formState).toHaveProperty('fields');
      expect(formState).toHaveProperty('success');
      expect(formState).toHaveProperty('hasTimeout');

      expect(formState.errors).toEqual({});
      expect(formState.fields).toEqual({});
      expect(formState.success).toBe(false);
      expect(formState.hasTimeout).toBe(false);
    });
  });

  describe('schema validation', () => {
    it('should validate data successfully with valid input', () => {
      formData.append('email', 'test@example.com');
      formData.append('termsAndConditions', 'on');

      const permittedFields = ['email', 'termsAndConditions'];
      const { parsed } = getActionState(formData, permittedFields, mockSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as {
        success: true;
        data: { email: string; termsAndConditions: boolean };
      };
      expect(successParsed.data.email).toBe('test@example.com');
      expect(successParsed.data.termsAndConditions).toBe(true);
    });

    it('should fail validation with invalid email', () => {
      formData.append('email', 'invalid-email');
      formData.append('termsAndConditions', 'on');

      const permittedFields = ['email', 'termsAndConditions'];
      const { parsed } = getActionState(formData, permittedFields, mockSchema);

      expect(parsed.success).toBe(false);
      const errorParsed = parsed as {
        success: false;
        error: { issues: Array<{ path: string[] }> };
      };
      expect(errorParsed.error.issues).toHaveLength(1);
      expect(errorParsed.error.issues[0].path).toEqual(['email']);
    });

    it('should fail validation with missing required fields', () => {
      // Only email, missing termsAndConditions
      formData.append('email', 'test@example.com');

      const permittedFields = ['email', 'termsAndConditions'];
      const { parsed } = getActionState(formData, permittedFields, mockSchema);

      expect(parsed.success).toBe(false);
      const errorParsed = parsed as {
        success: false;
        error: { issues: Array<{ path: string[] }> };
      };
      expect(errorParsed.error.issues.length).toBeGreaterThan(0);
      const paths = errorParsed.error.issues.map((issue) => issue.path[0]);
      expect(paths).toContain('termsAndConditions');
    });
  });

  describe('edge cases', () => {
    it('should handle empty FormData', () => {
      const permittedFields = ['email', 'termsAndConditions'];
      const { formState, parsed } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields).toEqual({});
      expect(parsed.success).toBe(false);
    });

    it('should handle FormData with empty string values', () => {
      formData.append('email', '');
      formData.append('termsAndConditions', '');

      const permittedFields = ['email', 'termsAndConditions'];
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields.email).toBe('');
      expect(formState.fields.termsAndConditions).toBe('');
    });

    it('should preserve field values in formState even if validation fails', () => {
      formData.append('email', 'invalid-email');
      formData.append('termsAndConditions', 'off');

      const permittedFields = ['email', 'termsAndConditions'];
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields.email).toBe('invalid-email');
      expect(formState.fields.termsAndConditions).toBe('off');
    });
  });
});
