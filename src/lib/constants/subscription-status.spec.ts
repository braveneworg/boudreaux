/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACTIVE_SUBSCRIPTION_STATUSES, isActiveSubscriptionStatus } from './subscription-status';

describe('subscription-status constants', () => {
  describe('ACTIVE_SUBSCRIPTION_STATUSES', () => {
    it('should contain only "active" and "trialing"', () => {
      expect(ACTIVE_SUBSCRIPTION_STATUSES).toEqual(['active', 'trialing']);
    });
  });

  describe('isActiveSubscriptionStatus', () => {
    it('should return true for "active"', () => {
      expect(isActiveSubscriptionStatus('active')).toBe(true);
    });

    it('should return true for "trialing"', () => {
      expect(isActiveSubscriptionStatus('trialing')).toBe(true);
    });

    it('should return false for "canceled"', () => {
      expect(isActiveSubscriptionStatus('canceled')).toBe(false);
    });

    it('should return false for "past_due"', () => {
      expect(isActiveSubscriptionStatus('past_due')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isActiveSubscriptionStatus(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isActiveSubscriptionStatus(undefined)).toBe(false);
    });

    it('should return false for an empty string', () => {
      expect(isActiveSubscriptionStatus('')).toBe(false);
    });
  });
});
