/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';

import { purchaseCheckoutSchema } from './purchase-schema';

describe('purchaseCheckoutSchema', () => {
  const validInput = {
    releaseId: 'release-123',
    amountCents: 500,
    userId: 'user-123',
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

  describe('userId field', () => {
    it('should fail when userId is empty', () => {
      const result = purchaseCheckoutSchema.safeParse({ ...validInput, userId: '' });
      expect(result.success).toBe(false);
      const errors = result.error?.issues.filter((i) => i.path[0] === 'userId');
      expect(errors?.length).toBeGreaterThan(0);
    });
  });
});
