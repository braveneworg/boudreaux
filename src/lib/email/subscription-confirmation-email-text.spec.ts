/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';

import { buildSubscriptionConfirmationEmailText } from '@/lib/email/subscription-confirmation-email-text';

describe('buildSubscriptionConfirmationEmailText', () => {
  const baseData = {
    email: 'subscriber@example.com',
    tierLabel: 'Extra',
    amount: '$24.44',
    interval: 'month',
  };

  it('should include the header', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('SUBSCRIPTION CONFIRMED');
    expect(result).toContain('======================');
  });

  it('should include the welcome message', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('Welcome to the Family!');
  });

  it('should mention access to all music', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('all music');
    expect(result).toContain('Fake Four Inc. record label');
  });

  it('should include the plan tier', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('Plan: Extra');
  });

  it('should include the amount and interval', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('Amount: $24.44/month');
  });

  it('should include the subscriber email', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('Account: subscriber@example.com');
  });

  it('should include fakefourrecords.com in footer', () => {
    const result = buildSubscriptionConfirmationEmailText(baseData);
    expect(result).toContain('fakefourrecords.com');
  });

  it('should handle different tier labels', () => {
    const result = buildSubscriptionConfirmationEmailText({
      ...baseData,
      tierLabel: 'Extra Extra',
      amount: '$44.44',
    });
    expect(result).toContain('Plan: Extra Extra');
    expect(result).toContain('Amount: $44.44/month');
  });

  it('should handle special characters in fields', () => {
    const result = buildSubscriptionConfirmationEmailText({
      ...baseData,
      email: "o'brien@example.com",
    });
    expect(result).toContain("o'brien@example.com");
  });
});
