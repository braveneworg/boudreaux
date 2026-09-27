/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { changeEmailActionSchema } from '@/lib/validation/change-email-schema';
import { changeUsernameSchema } from '@/lib/validation/change-username-schema';
import { contactSchema } from '@/lib/validation/contact-schema';
import { createVideoSchema } from '@/lib/validation/create-video-schema';
import { formBoolean } from '@/lib/validation/form-boolean';
import { profileActionSchema } from '@/lib/validation/profile-schema';
import { signupActionSchema } from '@/lib/validation/signup-schema';
import { tourDateCreateSchema } from '@/lib/validation/tours/tour-date-schema';
import { venueCreateSchema, venueUpdateSchema } from '@/lib/validation/tours/venue-schema';

import { getActionState } from './get-action-state';

describe('get-action-state', () => {
  const mockSchema = z.object({
    email: z.string().email(),
    termsAndConditions: formBoolean(),
    username: z.string().optional(),
  });

  // Schema for testing a switch field in isolation
  const booleanTestSchema = z.object({
    termsAndConditions: formBoolean(),
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

      const permittedFields = ['email', 'termsAndConditions'] as const;
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields.email).toBe('test@example.com');
      expect(formState.fields.termsAndConditions).toBe('on');
      expect(formState.fields.maliciousField).toBeUndefined();
      expect(formState.fields.anotherBadField).toBeUndefined();
    });

    it('should handle empty permitted fields array', () => {
      formData.append('email', 'test@example.com');
      formData.append('termsAndConditions', 'on');

      const permittedFields = [] as const;
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(Object.keys(formState.fields)).toHaveLength(0);
    });
  });

  // getActionState passes switch strings through; `formBoolean()` in the
  // schema converts them (#790).
  describe('switch fields with formBoolean()', () => {
    it('should convert "on" to true', () => {
      formData.append('termsAndConditions', 'on');

      const permittedFields = ['termsAndConditions'] as const;
      const { parsed } = getActionState(formData, permittedFields, booleanTestSchema);

      expect(parsed.success).toBe(true);
      expect(
        (parsed as { success: true; data: { termsAndConditions: boolean } }).data.termsAndConditions
      ).toBe(true);
    });

    it('should convert "off" to false', () => {
      formData.append('termsAndConditions', 'off');

      const permittedFields = ['termsAndConditions'] as const;
      const { parsed } = getActionState(formData, permittedFields, booleanTestSchema);

      expect(parsed.success).toBe(true);
      expect(
        (parsed as { success: true; data: { termsAndConditions: boolean } }).data.termsAndConditions
      ).toBe(false);
    });

    it('should convert "false" string to false for termsAndConditions field', () => {
      formData.append('termsAndConditions', 'false');

      const permittedFields = ['termsAndConditions'] as const;
      const { parsed } = getActionState(formData, permittedFields, booleanTestSchema);

      expect(parsed.success).toBe(true);
      expect(
        (parsed as { success: true; data: { termsAndConditions: boolean } }).data.termsAndConditions
      ).toBe(false);
    });

    it('should leave other string values unchanged', () => {
      formData.append('email', 'test@example.com');
      formData.append('username', 'testuser');

      const permittedFields = ['email', 'username'] as const;
      const { parsed } = getActionState(formData, permittedFields, mixedTestSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { email: string; username?: string } };
      expect(successParsed.data.email).toBe('test@example.com');
      expect(successParsed.data.username).toBe('testuser');
    });
  });

  describe('form state initialization', () => {
    it('should initialize form state with correct structure', () => {
      const permittedFields = ['email'] as const;
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

      const permittedFields = ['email', 'termsAndConditions'] as const;
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

      const permittedFields = ['email', 'termsAndConditions'] as const;
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

      const permittedFields = ['email', 'termsAndConditions'] as const;
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
      const permittedFields = ['email', 'termsAndConditions'] as const;
      const { formState, parsed } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields).toEqual({});
      expect(parsed.success).toBe(false);
    });

    it('should handle FormData with empty string values', () => {
      formData.append('email', '');
      formData.append('termsAndConditions', '');

      const permittedFields = ['email', 'termsAndConditions'] as const;
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields.email).toBe('');
      expect(formState.fields.termsAndConditions).toBe('');
    });

    it('should preserve field values in formState even if validation fails', () => {
      formData.append('email', 'invalid-email');
      formData.append('termsAndConditions', 'off');

      const permittedFields = ['email', 'termsAndConditions'] as const;
      const { formState } = getActionState(formData, permittedFields, mockSchema);

      expect(formState.fields.email).toBe('invalid-email');
      expect(formState.fields.termsAndConditions).toBe('off');
    });
  });

  describe('JSON array parsing', () => {
    it('should parse JSON-stringified arrays back to real arrays', () => {
      const arraySchema = z.object({ tags: z.array(z.string()) });
      formData.append('tags', '["tag1","tag2","tag3"]');

      const permittedFields = ['tags'] as const;
      const { parsed } = getActionState(formData, permittedFields, arraySchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { tags: string[] } };
      expect(successParsed.data.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle JSON-stringified arrays of numbers', () => {
      const arraySchema = z.object({ ids: z.array(z.string()) });
      formData.append('ids', '["id1","id2"]');

      const permittedFields = ['ids'] as const;
      const { parsed } = getActionState(formData, permittedFields, arraySchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { ids: string[] } };
      expect(successParsed.data.ids).toEqual(['id1', 'id2']);
    });

    it('should not parse invalid JSON strings starting with [', () => {
      const stringSchema = z.object({ value: z.string() });
      formData.append('value', '[invalid json');

      const permittedFields = ['value'] as const;
      const { parsed } = getActionState(formData, permittedFields, stringSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { value: string } };
      expect(successParsed.data.value).toBe('[invalid json');
    });

    it('should not parse non-array JSON', () => {
      const stringSchema = z.object({ data: z.string() });
      formData.append('data', '{"key":"value"}');

      const permittedFields = ['data'] as const;
      const { parsed } = getActionState(formData, permittedFields, stringSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { data: string } };
      expect(successParsed.data.data).toBe('{"key":"value"}');
    });
  });

  describe('string fields are never coerced (#790)', () => {
    const stringSchema = z.object({ value: z.string() });

    it.each(['1999', '001', '7.99', '5.00', '1349', '0', '-3', '1e3', ' 42 '])(
      'passes the numeric-looking string %j to a z.string() field unchanged',
      (value) => {
        formData.append('value', value);

        const { parsed } = getActionState(formData, ['value'] as const, stringSchema);

        expect(parsed).toEqual({ success: true, data: { value } });
      }
    );

    it.each(['true', 'false', 'on', 'off'])(
      'passes the boolean-looking string %j to a z.string() field unchanged',
      (value) => {
        formData.append('value', value);

        const { parsed } = getActionState(formData, ['value'] as const, stringSchema);

        expect(parsed).toEqual({ success: true, data: { value } });
      }
    );

    it('leaves a z.number() field uncoerced, so the schema must opt in', () => {
      formData.append('value', '180');

      const { parsed } = getActionState(
        formData,
        ['value'] as const,
        z.object({ value: z.number() })
      );

      expect(parsed.success).toBe(false);
    });

    it('keeps the raw submitted strings in formState.fields', () => {
      formData.append('title', '1999');
      formData.append('agree', 'on');
      formData.append('tags', '["a","b"]');

      const { formState } = getActionState(
        formData,
        ['title', 'agree', 'tags'] as const,
        z.object({ title: z.string(), agree: z.string(), tags: z.array(z.string()) })
      );

      expect(formState.fields).toEqual({ title: '1999', agree: 'on', tags: '["a","b"]' });
    });
  });

  // The action schemas themselves own every string → number/boolean
  // conversion, so these run the REAL schemas against FormData as the
  // clients submit it (#790).
  describe('with the real action schemas', () => {
    const toFormData = (entries: Record<string, string>): FormData => {
      const payload = new FormData();
      for (const [key, value] of Object.entries(entries)) payload.append(key, value);
      return payload;
    };

    it.each([
      ['true', true],
      ['on', true],
    ])('signup: accepts termsAndConditions %j as %j', (submitted, expected) => {
      const { parsed } = getActionState(
        toFormData({ email: 'fan@example.com', termsAndConditions: submitted }),
        ['email', 'termsAndConditions'] as const,
        signupActionSchema
      );

      expect(parsed.data?.termsAndConditions).toBe(expected);
    });

    it('signup: rejects termsAndConditions "false"', () => {
      const { parsed } = getActionState(
        toFormData({ email: 'fan@example.com', termsAndConditions: 'false' }),
        ['email', 'termsAndConditions'] as const,
        signupActionSchema
      );

      expect(parsed.error?.issues.map(({ path }) => path)).toEqual([['termsAndConditions']]);
    });

    it('signup: reads the opt-in switches as booleans', () => {
      const { parsed } = getActionState(
        toFormData({
          email: 'fan@example.com',
          termsAndConditions: 'true',
          allowSmsNotifications: 'false',
          allowEmailNotifications: 'true',
        }),
        [
          'email',
          'termsAndConditions',
          'allowSmsNotifications',
          'allowEmailNotifications',
        ] as const,
        signupActionSchema
      );

      expect(parsed.data).toMatchObject({
        allowSmsNotifications: false,
        allowEmailNotifications: true,
      });
    });

    it('change email: reads allowEmailNotifications "false" as false', () => {
      const { parsed } = getActionState(
        toFormData({
          email: 'new@example.com',
          confirmEmail: 'new@example.com',
          previousEmail: 'old@example.com',
          allowEmailNotifications: 'false',
        }),
        ['email', 'confirmEmail', 'previousEmail', 'allowEmailNotifications'] as const,
        changeEmailActionSchema
      );

      expect(parsed.data?.allowEmailNotifications).toBe(false);
    });

    it('profile: keeps a numeric ZIP code and phone as strings and reads the switches', () => {
      const { parsed } = getActionState(
        toFormData({
          firstName: '1349',
          phone: '5551234567',
          zipCode: '02139',
          allowSmsNotifications: 'true',
          allowEmailNotifications: 'off',
        }),
        [
          'firstName',
          'phone',
          'zipCode',
          'allowSmsNotifications',
          'allowEmailNotifications',
        ] as const,
        profileActionSchema
      );

      expect(parsed.data).toEqual({
        firstName: '1349',
        phone: '5551234567',
        zipCode: '02139',
        allowSmsNotifications: true,
        allowEmailNotifications: false,
      });
    });

    it('change username: accepts an all-digit username', () => {
      const { parsed } = getActionState(
        toFormData({ username: '1349', confirmUsername: '1349' }),
        ['username', 'confirmUsername'] as const,
        changeUsernameSchema
      );

      expect(parsed.success).toBe(true);
    });

    it('contact: accepts an all-digit phone number', () => {
      const { parsed } = getActionState(
        toFormData({
          reason: 'question',
          firstName: 'Ann',
          lastName: 'Lee',
          email: 'ann@example.com',
          phone: '5551234567',
          message: 'A question about the 1999 reissue.',
        }),
        ['reason', 'firstName', 'lastName', 'email', 'phone', 'message'] as const,
        contactSchema
      );

      expect(parsed.data?.phone).toBe('5551234567');
    });

    it('venue: keeps a leading-zero postal code and reads capacity as a number', () => {
      const { parsed } = getActionState(
        toFormData({ name: '930', city: 'Boston', postalCode: '02139', capacity: '500' }),
        ['name', 'city', 'postalCode', 'capacity'] as const,
        venueCreateSchema
      );

      expect(parsed.data).toMatchObject({ name: '930', postalCode: '02139', capacity: 500 });
    });

    it('venue update: reads capacity as a number', () => {
      const { parsed } = getActionState(
        toFormData({ capacity: '1200' }),
        ['capacity'] as const,
        venueUpdateSchema
      );

      expect(parsed.data?.capacity).toBe(1200);
    });

    it('tour date: keeps a bare ticket price as a string and reads utcOffset as a number', () => {
      const { parsed } = getActionState(
        toFormData({
          tourId: 'tour-1',
          startDate: '2026-10-01',
          showStartTime: '2026-10-01T20:00:00.000Z',
          venueId: 'venue-1',
          headlinerIds: '["artist-1"]',
          ticketPrices: '25',
          utcOffset: '-300',
        }),
        [
          'tourId',
          'startDate',
          'showStartTime',
          'venueId',
          'headlinerIds',
          'ticketPrices',
          'utcOffset',
        ] as const,
        tourDateCreateSchema
      );

      expect(parsed.data).toMatchObject({ ticketPrices: '25', utcOffset: -300 });
    });

    it('video: keeps a numeric title and accepts numeric duration and size strings', () => {
      const { parsed } = getActionState(
        toFormData({
          title: '1999',
          artist: '311',
          category: 'MUSIC',
          releasedOn: '1999-01-01',
          durationSeconds: '180',
          s3Key: 'videos/1999.mp4',
          fileName: '1999.mp4',
          fileSize: '1048576',
          mimeType: 'video/mp4',
        }),
        [
          'title',
          'artist',
          'category',
          'releasedOn',
          'durationSeconds',
          's3Key',
          'fileName',
          'fileSize',
          'mimeType',
        ] as const,
        createVideoSchema
      );

      expect(parsed.data).toMatchObject({ title: '1999', artist: '311' });
    });
  });

  describe('numeric-looking values', () => {
    it('should not coerce empty strings to numbers', () => {
      const optionalSchema = z.object({ value: z.string().optional() });
      formData.append('value', '');

      const permittedFields = ['value'] as const;
      const { parsed } = getActionState(formData, permittedFields, optionalSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { value?: string } };
      expect(successParsed.data.value).toBe('');
    });

    it('should not coerce non-numeric strings to numbers', () => {
      const stringSchema = z.object({ url: z.string() });
      formData.append('url', 'https://example.com');

      const permittedFields = ['url'] as const;
      const { parsed } = getActionState(formData, permittedFields, stringSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { url: string } };
      expect(successParsed.data.url).toBe('https://example.com');
    });

    it('should not coerce strings with NaN or Infinity', () => {
      const optionalSchema = z.object({ value: z.string().optional() });
      formData.append('value', 'NaN');

      const permittedFields = ['value'] as const;
      const { parsed } = getActionState(formData, permittedFields, optionalSchema);

      expect(parsed.success).toBe(true);
      const successParsed = parsed as { success: true; data: { value?: string } };
      expect(successParsed.data.value).toBe('NaN');
    });
  });
});
