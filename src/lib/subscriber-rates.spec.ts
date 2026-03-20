/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  getSubscriberRate,
  getStripePriceId,
  getTierByPriceId,
  SUBSCRIBER_RATE_STRIPE_PRICE_IDS,
  SUBSCRIBER_RATES,
  SUBSCRIBER_RATE_TIERS,
  TIER_LABELS,
} from './subscriber-rates';

describe('subscriber-rates', () => {
  describe('SUBSCRIBER_RATES', () => {
    it('should define three tiers', () => {
      expect(Object.keys(SUBSCRIBER_RATES)).toHaveLength(3);
    });

    it('should have correct prices', () => {
      expect(SUBSCRIBER_RATES.minimum).toBe(14.44);
      expect(SUBSCRIBER_RATES.extra).toBe(24.44);
      expect(SUBSCRIBER_RATES.extraExtra).toBe(44.44);
    });
  });

  describe('SUBSCRIBER_RATE_TIERS', () => {
    it('should list all tier keys', () => {
      expect(SUBSCRIBER_RATE_TIERS).toEqual(['minimum', 'extra', 'extraExtra']);
    });
  });

  describe('TIER_LABELS', () => {
    it('should have labels for all tiers', () => {
      expect(TIER_LABELS.minimum).toBe('Minimum');
      expect(TIER_LABELS.extra).toBe('Extra');
      expect(TIER_LABELS.extraExtra).toBe('Extra Extra');
    });
  });

  describe('getSubscriberRate', () => {
    it('should return the price for a given tier', () => {
      expect(getSubscriberRate('minimum')).toBe(14.44);
      expect(getSubscriberRate('extra')).toBe(24.44);
      expect(getSubscriberRate('extraExtra')).toBe(44.44);
    });
  });

  describe('getStripePriceId', () => {
    it('should throw when price ID is missing', () => {
      const original = SUBSCRIBER_RATE_STRIPE_PRICE_IDS.minimum;
      SUBSCRIBER_RATE_STRIPE_PRICE_IDS.minimum = '';

      try {
        expect(() => getStripePriceId('minimum')).toThrow(
          'Missing Stripe Price ID for tier: minimum'
        );
      } finally {
        SUBSCRIBER_RATE_STRIPE_PRICE_IDS.minimum = original;
      }
    });
  });

  describe('getTierByPriceId', () => {
    it('should return the tier for a known price ID', () => {
      // Set a known price ID so the test works even without env vars
      const original = SUBSCRIBER_RATE_STRIPE_PRICE_IDS.minimum;
      SUBSCRIBER_RATE_STRIPE_PRICE_IDS.minimum = 'price_test_minimum';

      try {
        expect(getTierByPriceId('price_test_minimum')).toBe('minimum');
      } finally {
        SUBSCRIBER_RATE_STRIPE_PRICE_IDS.minimum = original;
      }
    });

    it('should return null for an unknown price ID', () => {
      expect(getTierByPriceId('price_unknown_123')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(getTierByPriceId('')).toBeNull();
    });
  });
});
