/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';

import { amountInputSchema, purchaseCheckoutSchema } from './purchase-schema';

describe('purchaseCheckoutSchema', () => {
  const validInput = {
    releaseId: 'release-123',
    releaseTitle: 'Test Album',
    amountCents: 500,
    customerEmail: 'buyer@example.com',
  };

  it('should pass with a valid complete input', () => {
    const result = purchaseCheckoutSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    expect((result as { success: true; data: typeof validInput }).data).toMatchObject(validInput);
  });

  describe('releaseId field', () => {
    it('should fail when releaseId is empty', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, releaseId: '' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'releaseId');
      expect(errors?.length).toBeGreaterThan(0);
    });
  });

  describe('releaseTitle field', () => {
    it('should fail when releaseTitle is empty', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, releaseTitle: '' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'releaseTitle');
      expect(errors?.length).toBeGreaterThan(0);
    });
  });

  describe('amountCents field', () => {
    it('should fail when amountCents is 49 with a message about the minimum', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, amountCents: 49 });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'amountCents');
      expect(errors?.length).toBeGreaterThan(0);
      const message = errors?.[0].message ?? '';
      expect(message.toLowerCase()).toMatch(/50|minimum/);
    });

    it('should pass when amountCents is exactly 50', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, amountCents: 50 });
      expect(result.success).toBe(true);
    });

    it('should fail with an int error message when amountCents is a non-integer (1.5)', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, amountCents: 1.5 });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'amountCents');
      expect(errors?.length).toBeGreaterThan(0);
      expect(errors?.[0].message).toBe('Amount must be a whole number of cents');
    });
  });

  describe('customerEmail field', () => {
    it('should fail when customerEmail is empty', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, customerEmail: '' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'customerEmail');
      expect(errors?.length).toBeGreaterThan(0);
    });

    it('should fail when customerEmail is not a valid email address', () => {
      const result = purchaseCheckoutSchema.safeParse({
        ...validInput,
        customerEmail: 'not-an-email',
      });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'customerEmail');
      expect(errors?.length).toBeGreaterThan(0);
    });
  });
});

describe('amountInputSchema', () => {
  describe('valid inputs', () => {
    it('should accept a whole number', () => {
      const result = amountInputSchema.safeParse({ amount: '5' });
      expect(result.success).toBe(true);
    });

    it('should accept a number with one decimal place', () => {
      const result = amountInputSchema.safeParse({ amount: '5.5' });
      expect(result.success).toBe(true);
    });

    it('should accept a number with two decimal places', () => {
      const result = amountInputSchema.safeParse({ amount: '5.00' });
      expect(result.success).toBe(true);
    });

    it('should accept a number with dollar sign', () => {
      const result = amountInputSchema.safeParse({ amount: '$5' });
      expect(result.success).toBe(true);
    });

    it('should accept a number with dollar sign and decimals', () => {
      const result = amountInputSchema.safeParse({ amount: '$10.50' });
      expect(result.success).toBe(true);
    });

    it('should accept a large number', () => {
      const result = amountInputSchema.safeParse({ amount: '99999' });
      expect(result.success).toBe(true);
    });

    it('should accept a large number with dollar sign and decimals', () => {
      const result = amountInputSchema.safeParse({ amount: '$99999.99' });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject just a dot', () => {
      const result = amountInputSchema.safeParse({ amount: '.' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'amount');
      expect(errors?.length).toBeGreaterThan(0);
      expect(errors?.[0].message).toBe('Enter a valid dollar amount (e.g. 5.00)');
    });

    it('should reject just a dollar sign', () => {
      const result = amountInputSchema.safeParse({ amount: '$' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'amount');
      expect(errors?.length).toBeGreaterThan(0);
    });

    it('should reject more than two decimal places', () => {
      const result = amountInputSchema.safeParse({ amount: '5.123' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'amount');
      expect(errors?.length).toBeGreaterThan(0);
    });

    it('should reject an empty string', () => {
      const result = amountInputSchema.safeParse({ amount: '' });
      expect(result.success).toBe(false);
    });

    it('should reject just a decimal point without digits', () => {
      const result = amountInputSchema.safeParse({ amount: '.50' });
      expect(result.success).toBe(false);
    });

    it('should reject a number ending with decimal point', () => {
      const result = amountInputSchema.safeParse({ amount: '5.' });
      expect(result.success).toBe(false);
    });

    it('should reject multiple decimal points', () => {
      const result = amountInputSchema.safeParse({ amount: '5.0.0' });
      expect(result.success).toBe(false);
    });

    it('should reject letters', () => {
      const result = amountInputSchema.safeParse({ amount: 'abc' });
      expect(result.success).toBe(false);
    });

    it('should reject mixed letters and numbers', () => {
      const result = amountInputSchema.safeParse({ amount: '5abc' });
      expect(result.success).toBe(false);
    });

    it('should reject negative numbers', () => {
      const result = amountInputSchema.safeParse({ amount: '-5' });
      expect(result.success).toBe(false);
    });

    it('should reject special characters', () => {
      const result = amountInputSchema.safeParse({ amount: '5@00' });
      expect(result.success).toBe(false);
    });

    it('should reject dollar sign in wrong position', () => {
      const result = amountInputSchema.safeParse({ amount: '5$' });
      expect(result.success).toBe(false);
    });

    it('should reject multiple dollar signs', () => {
      const result = amountInputSchema.safeParse({ amount: '$$5' });
      expect(result.success).toBe(false);
    });

    it('should reject three decimal places with dollar sign', () => {
      const result = amountInputSchema.safeParse({ amount: '$10.999' });
      expect(result.success).toBe(false);
    });

    it('should reject spaces in the amount', () => {
      const result = amountInputSchema.safeParse({ amount: '5 00' });
      expect(result.success).toBe(false);
    });

    it('should reject comma as decimal separator', () => {
      const result = amountInputSchema.safeParse({ amount: '5,00' });
      expect(result.success).toBe(false);
    });
  });
});
