/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createCheckoutSessionAction } from './create-checkout-session-action';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();

vi.mock('../../../auth', () => ({
  auth: () => mockAuth(),
}));

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

const mockFindByEmail = vi.fn();

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    findByEmail: (...args: unknown[]) => mockFindByEmail(...args),
  },
}));

describe('createCheckoutSessionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTH_URL', 'https://fakefourrecords.com');
    mockAuth.mockResolvedValue(null);
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

  it('should pass customer_email for an unauthenticated guest with email', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('extra', 'guest@example.com');

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: 'guest@example.com',
      })
    );
  });

  it('should use the database stripeCustomerId when the authenticated user has one', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'auth@example.com' } });
    mockFindByEmail.mockResolvedValue({
      email: 'auth@example.com',
      stripeCustomerId: 'cus_fromdb123',
      subscriptionStatus: null,
      subscriptionTier: null,
    });
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('extra', 'ignored@example.com');

    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.customer).toBe('cus_fromdb123');
    expect(callArgs.customer_email).toBeUndefined();
    expect(mockFindByEmail).toHaveBeenCalledWith('auth@example.com');
  });

  it('should pass customer_email from the auth session when user has no stripeCustomerId yet', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'newuser@example.com' } });
    mockFindByEmail.mockResolvedValue(null);
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('minimum');

    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.customer_email).toBe('newuser@example.com');
    expect(callArgs.customer).toBeUndefined();
  });

  it('should not pass customer or customer_email when neither auth nor email is available', async () => {
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_xyz' });

    await createCheckoutSessionAction('minimum');

    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.customer).toBeUndefined();
    expect(callArgs.customer_email).toBeUndefined();
  });

  it('should return a generic error when stripe throws', async () => {
    mockSessionsCreate.mockRejectedValue(new Error('Stripe API key not set'));

    const result = await createCheckoutSessionAction('minimum');

    expect(result).toEqual({
      clientSecret: null,
      error: 'Unable to start checkout. Please try again.',
    });
  });

  it('should return a generic error when a non-Error is thrown', async () => {
    mockSessionsCreate.mockRejectedValue('unexpected string error');

    const result = await createCheckoutSessionAction('minimum');

    expect(result).toEqual({
      clientSecret: null,
      error: 'Unable to start checkout. Please try again.',
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

  it('should fall back to localhost when AUTH_URL is empty', async () => {
    vi.stubEnv('AUTH_URL', '');
    mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret' });

    await createCheckoutSessionAction('minimum');

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: 'http://localhost:3000/subscribe/success?session_id={CHECKOUT_SESSION_ID}',
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
    it('should reject when authenticated user already has an active subscription at the same tier', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'user@example.com' } });
      mockFindByEmail.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionTier: 'minimum',
      });

      const result = await createCheckoutSessionAction('minimum');

      expect(result).toEqual({
        clientSecret: null,
        error: 'You already have an active subscription at this tier.',
      });
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('should reject when unauthenticated user already has an active subscription at the same tier (by email)', async () => {
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
      mockAuth.mockResolvedValue({ user: { email: 'user@example.com' } });
      mockFindByEmail.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptionTier: 'minimum',
        stripeCustomerId: 'cus_test123',
      });
      mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_upgrade' });

      const result = await createCheckoutSessionAction('extra');

      expect(result).toEqual({ clientSecret: 'cs_secret_upgrade' });
      expect(mockSessionsCreate).toHaveBeenCalled();
    });

    it('should allow checkout when user has a canceled subscription at the same tier', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'user@example.com' } });
      mockFindByEmail.mockResolvedValue({
        subscriptionStatus: 'canceled',
        subscriptionTier: 'minimum',
        stripeCustomerId: 'cus_test123',
      });
      mockSessionsCreate.mockResolvedValue({ client_secret: 'cs_secret_resub' });

      const result = await createCheckoutSessionAction('minimum');

      expect(result).toEqual({ clientSecret: 'cs_secret_resub' });
      expect(mockSessionsCreate).toHaveBeenCalled();
    });

    it('should reject when user has a trialing subscription at the same tier', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'user@example.com' } });
      mockFindByEmail.mockResolvedValue({
        subscriptionStatus: 'trialing',
        subscriptionTier: 'minimum',
      });

      const result = await createCheckoutSessionAction('minimum');

      expect(result).toEqual({
        clientSecret: null,
        error: 'You already have an active subscription at this tier.',
      });
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });
});
