/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, it, expect } from 'vitest';

import contactSchema, {
  CONTACT_REASONS,
  type ContactFormSchemaType,
} from '@/lib/validation/contact-schema';

describe('contact-schema', () => {
  const validData: ContactFormSchemaType = {
    reason: 'question',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1 555-123-4567',
    message: 'I have a question about your label.',
  };

  describe('CONTACT_REASONS', () => {
    it('should export a non-empty array of reason options', () => {
      expect(CONTACT_REASONS.length).toBeGreaterThan(0);
    });

    it('should have value and label for each reason', () => {
      for (const reason of CONTACT_REASONS) {
        expect(reason).toHaveProperty('value');
        expect(reason).toHaveProperty('label');
        expect(reason.value.length).toBeGreaterThan(0);
        expect(reason.label.length).toBeGreaterThan(0);
      }
    });

    it('should have unique values', () => {
      const values = CONTACT_REASONS.map((r) => r.value);
      expect(new Set(values).size).toBe(values.length);
    });

    it('should include expected reason values', () => {
      const values = CONTACT_REASONS.map((r) => r.value);
      expect(values).toContain('question');
      expect(values).toContain('new-opportunity');
      expect(values).toContain('other');
      expect(values).toContain('concern');
    });
  });

  describe('reason field', () => {
    it('should accept a valid reason string', () => {
      const result = contactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject an empty reason', () => {
      const result = contactSchema.safeParse({ ...validData, reason: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const reasonErrors = result.error.issues.filter((i) => i.path[0] === 'reason');
        expect(reasonErrors.length).toBeGreaterThan(0);
        expect(reasonErrors[0].message).toBe('Please select a reason for contacting us');
      }
    });
  });

  describe('firstName field', () => {
    it('should accept a valid first name', () => {
      const result = contactSchema.safeParse({ ...validData, firstName: 'A' });
      expect(result.success).toBe(true);
    });

    it('should reject an empty first name', () => {
      const result = contactSchema.safeParse({ ...validData, firstName: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'firstName');
        expect(errors[0].message).toBe('First name is required');
      }
    });

    it('should reject a first name exceeding 50 characters', () => {
      const result = contactSchema.safeParse({ ...validData, firstName: 'A'.repeat(51) });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'firstName');
        expect(errors[0].message).toBe('First name must be 50 characters or less');
      }
    });

    it('should accept a first name at exactly 50 characters', () => {
      const result = contactSchema.safeParse({ ...validData, firstName: 'A'.repeat(50) });
      expect(result.success).toBe(true);
    });
  });

  describe('lastName field', () => {
    it('should accept a valid last name', () => {
      const result = contactSchema.safeParse({ ...validData, lastName: 'B' });
      expect(result.success).toBe(true);
    });

    it('should reject an empty last name', () => {
      const result = contactSchema.safeParse({ ...validData, lastName: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'lastName');
        expect(errors[0].message).toBe('Last name is required');
      }
    });

    it('should reject a last name exceeding 50 characters', () => {
      const result = contactSchema.safeParse({ ...validData, lastName: 'B'.repeat(51) });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'lastName');
        expect(errors[0].message).toBe('Last name must be 50 characters or less');
      }
    });
  });

  describe('email field', () => {
    it('should accept a valid email', () => {
      const result = contactSchema.safeParse({ ...validData, email: 'user@example.com' });
      expect(result.success).toBe(true);
    });

    it('should reject an invalid email', () => {
      const result = contactSchema.safeParse({ ...validData, email: 'not-an-email' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'email');
        expect(errors[0].message).toBe('Invalid email address');
      }
    });

    it('should reject an empty email', () => {
      const result = contactSchema.safeParse({ ...validData, email: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('phone field', () => {
    it('should accept a valid phone number', () => {
      const result = contactSchema.safeParse({ ...validData, phone: '+1 555-123-4567' });
      expect(result.success).toBe(true);
    });

    it('should accept an empty phone (optional)', () => {
      const result = contactSchema.safeParse({ ...validData, phone: '' });
      expect(result.success).toBe(true);
    });

    it('should accept undefined phone (optional)', () => {
      const { phone: _, ...dataWithoutPhone } = validData;
      const result = contactSchema.safeParse(dataWithoutPhone);
      expect(result.success).toBe(true);
    });

    it('should reject an invalid phone number', () => {
      const result = contactSchema.safeParse({ ...validData, phone: 'abc-not-a-phone' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'phone');
        expect(errors[0].message).toBe('Invalid phone number');
      }
    });

    it('should accept international phone formats', () => {
      const internationalNumbers = ['+44 20 7946 0958', '+1 212-555-1234', '+61.2.1234.5678'];
      for (const phone of internationalNumbers) {
        const result = contactSchema.safeParse({ ...validData, phone });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('message field', () => {
    it('should accept a valid message', () => {
      const result = contactSchema.safeParse({ ...validData, message: 'A'.repeat(10) });
      expect(result.success).toBe(true);
    });

    it('should reject a message shorter than 10 characters', () => {
      const result = contactSchema.safeParse({ ...validData, message: 'Too short' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'message');
        expect(errors[0].message).toBe('Please provide more detail (at least 10 characters)');
      }
    });

    it('should reject a message exceeding 5000 characters', () => {
      const result = contactSchema.safeParse({ ...validData, message: 'A'.repeat(5001) });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.issues.filter((i) => i.path[0] === 'message');
        expect(errors[0].message).toBe('Message must be 5000 characters or less');
      }
    });

    it('should accept a message at exactly 5000 characters', () => {
      const result = contactSchema.safeParse({ ...validData, message: 'A'.repeat(5000) });
      expect(result.success).toBe(true);
    });

    it('should accept a message at exactly 10 characters', () => {
      const result = contactSchema.safeParse({ ...validData, message: 'A'.repeat(10) });
      expect(result.success).toBe(true);
    });
  });

  describe('general field', () => {
    it('should accept general as optional string', () => {
      const result = contactSchema.safeParse({ ...validData, general: 'Some general note' });
      expect(result.success).toBe(true);
    });

    it('should accept undefined general', () => {
      const result = contactSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('full form validation', () => {
    it('should accept complete valid data', () => {
      const result = contactSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reason).toBe(validData.reason);
        expect(result.data.firstName).toBe(validData.firstName);
        expect(result.data.lastName).toBe(validData.lastName);
        expect(result.data.email).toBe(validData.email);
        expect(result.data.message).toBe(validData.message);
      }
    });

    it('should accept minimal valid data (without optional fields)', () => {
      const minimalData = {
        reason: 'other',
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.com',
        message: 'Hello there!',
      };
      const result = contactSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject when multiple required fields are missing', () => {
      const result = contactSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const fieldNames = result.error.issues.map((i) => i.path[0]);
        expect(fieldNames).toContain('reason');
        expect(fieldNames).toContain('firstName');
        expect(fieldNames).toContain('lastName');
        expect(fieldNames).toContain('email');
        expect(fieldNames).toContain('message');
      }
    });
  });

  describe('type inference', () => {
    it('should correctly infer types from parsed data', () => {
      const result = contactSchema.safeParse(validData);
      if (result.success) {
        const data: ContactFormSchemaType = result.data;
        expect(typeof data.reason).toBe('string');
        expect(typeof data.firstName).toBe('string');
        expect(typeof data.lastName).toBe('string');
        expect(typeof data.email).toBe('string');
        expect(typeof data.message).toBe('string');
      }
    });
  });
});
