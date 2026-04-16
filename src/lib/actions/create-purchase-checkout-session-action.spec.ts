/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';
import { PurchaseService } from '@/lib/services/purchase-service';
import { stripe } from '@/lib/stripe';

import { createPurchaseCheckoutSessionAction } from './create-purchase-checkout-session-action';

vi.mock('server-only', () => ({}));

const { mockRateLimitCheck } = vi.hoisted(() => ({
  mockRateLimitCheck: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: () => ({
    check: mockRateLimitCheck,
  }),
}));

const mockAuth = vi.fn();
vi.mock('../../../auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    release: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/purchase-service', () => ({
  PurchaseService: {
    checkExistingPurchase: vi.fn(),
  },
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

describe('createPurchaseCheckoutSessionAction', () => {
  const validInput = {
    releaseId: 'release-123',
    amountCents: 500,
  };

  beforeEach(() => {
    // Default: authenticated user
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
    vi.mocked(PurchaseService.checkExistingPurchase).mockResolvedValue(false);
    vi.mocked(prisma.release.findFirst).mockResolvedValue({
      id: 'release-123',
      title: 'Test Album',
    } as never);
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_xxx',
      client_secret: 'secret_xxx',
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('schema validation', () => {
    it('should return an error when releaseId is missing from the input', async () => {
      const invalidInput = { releaseTitle: 'Test Album', amountCents: 500 };

      const result = await createPurchaseCheckoutSessionAction(invalidInput);
      const failure = result as { success: false; error: string };

      expect(result.success).toBe(false);
      expect(typeof failure.error).toBe('string');
      expect(failure.error.length).toBeGreaterThan(0);
    });

    it('should fallback to "Invalid input" when Zod issues array is empty', async () => {
      // Directly pass a completely malformed input that triggers the ?? fallback
      // when parsed.error.issues[0]?.message is undefined
      const result = await createPurchaseCheckoutSessionAction(undefined);
      const failure = result as { success: false; error: string };

      expect(result.success).toBe(false);
      expect(typeof failure.error).toBe('string');
    });

    it('should return an error when amountCents is below the schema minimum of 50', async () => {
      const result = await createPurchaseCheckoutSessionAction({ ...validInput, amountCents: 49 });

      expect(result.success).toBe(false);
      expect(typeof (result as { success: false; error: string }).error).toBe('string');
    });
  });

  describe('user identity resolution', () => {
    it('should resolve userId from the server-side auth session, not from client input', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'server-resolved-user' } });

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(PurchaseService.checkExistingPurchase)).toHaveBeenCalledWith(
        'server-resolved-user',
        'release-123'
      );
    });

    it('should skip the duplicate purchase check when no authenticated session exists', async () => {
      mockAuth.mockResolvedValue(null);

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(PurchaseService.checkExistingPurchase)).not.toHaveBeenCalled();
    });

    it('should spread empty object for metadata when userId is null (guest checkout)', async () => {
      mockAuth.mockResolvedValue({ user: { id: null } });

      await createPurchaseCheckoutSessionAction(validInput);

      // userId is null so `userId ? { userId } : {}` should spread empty object
      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.not.objectContaining({ userId: expect.anything() }),
        })
      );
    });

    it('should not include userId in Stripe metadata for unauthenticated (guest) users', async () => {
      mockAuth.mockResolvedValue(null);

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.not.objectContaining({ userId: expect.anything() }),
          payment_intent_data: expect.objectContaining({
            metadata: expect.not.objectContaining({ userId: expect.anything() }),
          }),
        })
      );
    });

    it('should include userId in Stripe metadata for authenticated users', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'auth-user-456' } });

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ userId: 'auth-user-456' }),
          payment_intent_data: expect.objectContaining({
            metadata: expect.objectContaining({ userId: 'auth-user-456' }),
          }),
        })
      );
    });
  });

  describe('duplicate purchase check', () => {
    it('should return "already_purchased" when the authenticated user already has a purchase for the release', async () => {
      vi.mocked(PurchaseService.checkExistingPurchase).mockResolvedValue(true);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'already_purchased' });
    });

    it('should return "already_purchased" when a guest email resolves to a user who already purchased', async () => {
      // No auth session → guest checkout with customerEmail
      mockAuth.mockResolvedValue(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing-user-456' } as never);
      vi.mocked(PurchaseService.checkExistingPurchase).mockResolvedValue(true);

      const result = await createPurchaseCheckoutSessionAction({
        ...validInput,
        customerEmail: 'existing@example.com',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'existing@example.com' },
        select: { id: true },
      });
      expect(PurchaseService.checkExistingPurchase).toHaveBeenCalledWith(
        'existing-user-456',
        'release-123'
      );
      expect(result).toEqual({ success: false, error: 'already_purchased' });
    });

    it('should allow guest checkout when email resolves to a user without existing purchase', async () => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing-user-789' } as never);
      vi.mocked(PurchaseService.checkExistingPurchase).mockResolvedValue(false);

      const result = await createPurchaseCheckoutSessionAction({
        ...validInput,
        customerEmail: 'new-buyer@example.com',
      });

      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it('should allow guest checkout when email does not resolve to any existing user', async () => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await createPurchaseCheckoutSessionAction({
        ...validInput,
        customerEmail: 'brand-new@example.com',
      });

      expect(PurchaseService.checkExistingPurchase).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });
  });

  describe('release availability check', () => {
    it('should return "release_unavailable" when prisma.release.findFirst returns null', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(null);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'release_unavailable' });
    });
  });

  describe('Stripe session creation', () => {
    it('should return "stripe_error" when the session has no client_secret', async () => {
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        id: 'cs_xxx',
        client_secret: null,
      } as never);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'stripe_error' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Checkout session missing client_secret',
        expect.objectContaining({ sessionId: 'cs_xxx' })
      );
      consoleErrorSpy.mockRestore();
    });

    it('should succeed even when payment_intent is null (deferred in dahlia API)', async () => {
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        id: 'cs_deferred',
        client_secret: 'secret_deferred',
        payment_intent: null,
      } as never);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({
        success: true,
        clientSecret: 'secret_deferred',
        sessionId: 'cs_deferred',
      });
    });

    it('should return success with clientSecret and sessionId when session is valid', async () => {
      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({
        success: true,
        clientSecret: 'secret_xxx',
        sessionId: 'cs_xxx',
      });
    });

    it('should use the database title as the Stripe product name, not a client-provided value', async () => {
      await createPurchaseCheckoutSessionAction(validInput);

      type LineItemsParam = { line_items: { price_data: { product_data: { name: string } } }[] };
      const createCall = vi.mocked(stripe.checkout.sessions.create).mock
        .calls[0][0] as LineItemsParam;
      expect(createCall.line_items[0].price_data.product_data.name).toBe('Test Album');
    });

    it('should use AUTH_URL env var for return_url when set', async () => {
      vi.stubEnv('AUTH_URL', 'https://myapp.example.com');

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: 'https://myapp.example.com/releases/release-123',
        })
      );
    });

    it('should include customer_email in Stripe session when auth email is available', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123', email: 'auth@example.com' } });

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: 'auth@example.com',
        })
      );
    });

    it('should not include customer_email when email is null', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123', email: null } });

      await createPurchaseCheckoutSessionAction(validInput);

      const createArgs = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArgs).not.toHaveProperty('customer_email');
    });

    it('should fall back to customerEmail from input when auth email is null', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123', email: null } });

      await createPurchaseCheckoutSessionAction({
        ...validInput,
        customerEmail: 'guest@example.com',
      });

      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: 'guest@example.com',
        })
      );
    });

    it('should return "stripe_error" when stripe.checkout.sessions.create throws', async () => {
      vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(
        new Error('Stripe network error')
      );
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'stripe_error' });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should use localhost fallback for return_url when AUTH_URL is not set', async () => {
      delete process.env.AUTH_URL;

      await createPurchaseCheckoutSessionAction(validInput);

      expect(vi.mocked(stripe.checkout.sessions.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: 'http://localhost:3000/releases/release-123',
        })
      );
    });
  });

  describe('rate limiting', () => {
    it('should return error when rate limited', async () => {
      mockRateLimitCheck.mockRejectedValueOnce(new Error('Rate limited'));

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({
        success: false,
        error: 'Too many requests. Please try again later.',
      });
      expect(vi.mocked(stripe.checkout.sessions.create)).not.toHaveBeenCalled();
    });
  });
});
