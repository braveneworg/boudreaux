/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const SUBSCRIBER_RATES = {
  minimum: 14.44,
  extra: 24.44,
  extraExtra: 44.44,
} as const;

export type SubscriberRateTier = keyof typeof SUBSCRIBER_RATES;

export const TIER_LABELS: Record<SubscriberRateTier, string> = {
  minimum: 'Minimum',
  extra: 'Extra',
  extraExtra: 'Extra Extra',
};

export const getSubscriberRate = (tier: SubscriberRateTier): number => SUBSCRIBER_RATES[tier];

/**
 * Reads a required Stripe Price ID from the environment and fails fast when
 * configuration is missing or blank.
 */
const getRequiredStripePriceId = (envVarName: string): string => {
  const value = process.env[envVarName]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${envVarName}. Stripe subscriber tier price IDs must be configured.`
    );
  }

  return value;
};

/**
 * Maps each subscriber rate tier to its Stripe Price ID.
 * In the Lambda environment, these use STRIPE_PRICE_* (no NEXT_PUBLIC_ prefix).
 */
export const SUBSCRIBER_RATE_STRIPE_PRICE_IDS: Record<SubscriberRateTier, string> = {
  minimum: getRequiredStripePriceId('STRIPE_PRICE_MINIMUM'),
  extra: getRequiredStripePriceId('STRIPE_PRICE_EXTRA'),
  extraExtra: getRequiredStripePriceId('STRIPE_PRICE_EXTRA_EXTRA'),
};

/**
 * Resolves a Stripe Price ID back to its subscriber rate tier name.
 */
export const getTierByPriceId = (priceId: string): SubscriberRateTier | null => {
  if (!priceId) return null;
  const entries = Object.entries(SUBSCRIBER_RATE_STRIPE_PRICE_IDS) as [
    SubscriberRateTier,
    string,
  ][];
  const match = entries.find(([, id]) => id === priceId);
  return match ? match[0] : null;
};
