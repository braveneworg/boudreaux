export const SUBSCRIBER_RATES = {
  minimum: 14.44,
  extra: 24.44,
  extraExtra: 44.44,
} as const;

export type SubscriberRateTier = keyof typeof SUBSCRIBER_RATES;

export const SUBSCRIBER_RATE_TIERS: SubscriberRateTier[] = Object.keys(
  SUBSCRIBER_RATES
) as SubscriberRateTier[];

export const SUBSCRIBER_RATE_MINIMUM = 'minimum' as const as SubscriberRateTier;

export const getSubscriberRate = (tier: SubscriberRateTier) => SUBSCRIBER_RATES[tier];

export const TIER_LABELS: Record<SubscriberRateTier, string> = {
  minimum: 'Minimum',
  extra: 'Extra',
  extraExtra: 'Extra Extra',
};

/**
 * Maps each subscriber rate tier to its Stripe Price ID.
 * Populated from environment variables set after running `pnpm run stripe:seed`.
 */
export const SUBSCRIBER_RATE_STRIPE_PRICE_IDS: Record<SubscriberRateTier, string> = {
  minimum: process.env.NEXT_PUBLIC_STRIPE_PRICE_MINIMUM ?? '',
  extra: process.env.NEXT_PUBLIC_STRIPE_PRICE_EXTRA ?? '',
  extraExtra: process.env.NEXT_PUBLIC_STRIPE_PRICE_EXTRA_EXTRA ?? '',
};

export const getStripePriceId = (tier: SubscriberRateTier): string => {
  const priceId = SUBSCRIBER_RATE_STRIPE_PRICE_IDS[tier];
  if (!priceId) {
    throw new Error(`Missing Stripe Price ID for tier: ${tier}`);
  }
  return priceId;
};

/**
 * Resolves a Stripe Price ID back to its subscriber rate tier name.
 * Used by the webhook handler to map incoming price IDs to tier names.
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
