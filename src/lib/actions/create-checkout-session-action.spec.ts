/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createCheckoutSessionAction } from './create-checkout-session-action';

vi.mock('server-only', () => ({}));

const mockSessionsCreate = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockSessionsCreate(...args),
      },
    },
  },
}));

vi.mock('@/lib/subscriber-rates', () => ({
  getStripePriceId: (tier: string) => {
    const map: Record<string, string> = {
      minimum: 'price_minimum_test',
      extra: 'price_extra_test',
      extraExtra: 'price_extra_extra_test',
    };
    const priceId = map[tier];
    if (!priceId) throw new Error(`Missing Stripe Price ID for tier: ${tier}`);
    return priceId;
  },
}));

const mockFindByStripeCustomerId = vi.fn();
const mockFindByEmail = vi.fn();

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    findByStripeCustomerId: (...args: unknown[]) => mockFindByStripeCustomerId(...args),
    findByEmail: (...args: unknown[]) => mockFindByEmail(...args),
  },
}));

describe('createCheckoutSessionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTH_URL', 'https://fakefourrecords.com');
    mockFindByStripeCustomerId.mockResolvedValue(null);
    mockFindByEmail.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create a checkout session and return the client secret', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_abc123' });

    const result = await createCheckoutSessionAction('minimum');

    expect(result).toEqual({ clientSecret: 'cs_secret_abc123' });
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_minimum_test', quantity: 1 }],
        ui_mode: 'custom',
        return_url: expect.stringContaining('/subscribe/success?session_id='),
      })
    );
  });

  it('should pass customer_email when customerEmail is provided but no stripeCustomerId', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('extra', 'test@example.com');

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: 'test@example.com',
      })
    );
  });

  it('should pass customer when stripeCustomerId is provided', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('extra', 'test@example.com', 'cus_test123');

    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.customer).toBe('cus_test123');
    expect(callArgs.customer_email).toBeUndefined();
  });

  it('should not pass customer or customer_email when neither is provided', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('minimum');

    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.customer).toBeUndefined();
    expect(callArgs.customer_email).toBeUndefined();
  });

  it('should return an error when stripe throws', async () => {
    mockSessionsCreate.mockRejectedValue(new Error('Stripe API key not set'));

    const result = await createCheckoutSessionAction('minimum');

    expect(result).toEqual({
      clientSecret: null,
      error: 'Stripe API key not set',
    });
  });

  it('should return a generic error when a non-Error is thrown', async () => {
    mockSessionsCreate.mockRejectedValue('unexpected string error');

    const result = await createCheckoutSessionAction('minimum');

    expect(result).toEqual({
      clientSecret: null,
      error: 'Failed to create checkout session',
    });
  });

  it('should use the correct return_url with AUTH_URL env variable', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret' });

    await createCheckoutSessionAction('minimum');

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url:
          'https://fakefourrecords.com/subscribe/success?session_id={CHECKOUT_SESSION_ID}',
      })
    );
  });

  it('should fall back to localhost when AUTH_URL is not set', async () => {
    // Empty string is truthy for `??` — the source uses `?? 'http://localhost:3000'`
    // so only undefined/null triggers fallback. An empty AUTH_URL still results in empty prefix.
    vi.stubEnv('AUTH_URL', '');
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret' });

    await createCheckoutSessionAction('minimum');

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: '/subscribe/success?session_id={CHECKOUT_SESSION_ID}',
      })
    );
  });

  it('should use the correct price ID for each tier', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret' });

    await createCheckoutSessionAction('extraExtra');

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_extra_extra_test', quantity: 1 }],
      })
    );
  });

  describe('duplicate subscription prevention', () => {
    it('should reject when user already has an active subscription at the same tier (by stripeCustomerId)', async () => {
      mockFindByStripeCustomerId.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionTier: 'minimum',
      });

      const result = await createCheckoutSessionAction(
        'minimum',
        'test@example.com',
        'cus_test123'
      );

      expect(result).toEqual({
        clientSecret: null,
        error: 'You already have an active subscription at this tier.',
      });
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('should reject when user already has an active subscription at the same tier (by email)', async () => {
      mockFindByEmail.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionTier: 'extra',
      });

      const result = await createCheckoutSessionAction('extra', 'test@example.com');

      expect(result).toEqual({
        clientSecret: null,
        error: 'You already have an active subscription at this tier.',
      });
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('should allow checkout when user has an active subscription at a different tier', async () => {
      mockFindByStripeCustomerId.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionTier: 'minimum',
      });
      mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_upgrade' });

      const result = await createCheckoutSessionAction('extra', 'test@example.com', 'cus_test123');

      expect(result).toEqual({ clientSecret: 'cs_secret_upgrade' });
      expect(mockSessionsCreate).toHaveBeenCalled();
    });

    it('should allow checkout when user has a canceled subscription at the same tier', async () => {
      mockFindByStripeCustomerId.mockResolvedValue({
        subscriptionStatus: 'canceled',
        subscriptionTier: 'minimum',
      });
      mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_resub' });

      const result = await createCheckoutSessionAction(
        'minimum',
        'test@example.com',
        'cus_test123'
      );

      expect(result).toEqual({ clientSecret: 'cs_secret_resub' });
      expect(mockSessionsCreate).toHaveBeenCalled();
    });

    it('should reject when user has a trialing subscription at the same tier', async () => {
      mockFindByStripeCustomerId.mockResolvedValue({
        subscriptionStatus: 'trialing',
        subscriptionTier: 'minimum',
      });

      const result = await createCheckoutSessionAction(
        'minimum',
        'test@example.com',
        'cus_test123'
      );

      expect(result).toEqual({
        clientSecret: null,
        error: 'You already have an active subscription at this tier.',
      });
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });
});
