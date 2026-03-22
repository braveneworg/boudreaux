/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { PurchaseService } from '@/lib/services/purchase-service';
import { stripe } from '@/lib/stripe';

import { createPurchaseCheckoutSessionAction } from './create-purchase-checkout-session-action';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    release: {
      findFirst: vi.fn(),
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
    releaseTitle: 'Test Album',
    amountCents: 500,
    userId: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PurchaseService.checkExistingPurchase).mockResolvedValue(false);
    vi.mocked(prisma.release.findFirst).mockResolvedValue({ id: 'release-123' } as never);
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      client_secret: 'secret_xxx',
      payment_intent: 'pi_xxx',
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('schema validation', () => {
    it('should return an error when releaseId is missing from the input', async () => {
      const invalidInput = { releaseTitle: 'Test Album', amountCents: 500, userId: 'user-123' };

      const result = await createPurchaseCheckoutSessionAction(invalidInput);

      expect(result.success).toBe(false);
      expect(typeof (result as { success: false; error: string }).error).toBe('string');
      expect((result as { success: false; error: string }).error.length).toBeGreaterThan(0);
    });

    it('should return an error when releaseTitle is empty', async () => {
      const result = await createPurchaseCheckoutSessionAction({
        ...validInput,
        releaseTitle: '',
      });

      expect(result.success).toBe(false);
    });

    it('should return an error when userId is empty', async () => {
      const result = await createPurchaseCheckoutSessionAction({ ...validInput, userId: '' });

      expect(result.success).toBe(false);
    });

    it('should return an error when amountCents is below the schema minimum of 50', async () => {
      const result = await createPurchaseCheckoutSessionAction({ ...validInput, amountCents: 49 });

      expect(result.success).toBe(false);
      expect(typeof (result as { success: false; error: string }).error).toBe('string');
    });
  });

  describe('duplicate purchase check', () => {
    it('should return "already_purchased" when the user already has a purchase for the release', async () => {
      vi.mocked(PurchaseService.checkExistingPurchase).mockResolvedValue(true);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'already_purchased' });
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
        client_secret: null,
        payment_intent: 'pi_xxx',
      } as never);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'stripe_error' });
    });

    it('should return "stripe_error" when the session has no payment_intent', async () => {
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        client_secret: 'secret_xxx',
        payment_intent: null,
      } as never);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({ success: false, error: 'stripe_error' });
    });

    it('should return success with clientSecret and paymentIntentId when session is valid', async () => {
      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({
        success: true,
        clientSecret: 'secret_xxx',
        paymentIntentId: 'pi_xxx',
      });
    });

    it('should extract the id when payment_intent is an object rather than a string', async () => {
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        client_secret: 'secret_yyy',
        payment_intent: { id: 'pi_yyy' },
      } as never);

      const result = await createPurchaseCheckoutSessionAction(validInput);

      expect(result).toEqual({
        success: true,
        clientSecret: 'secret_yyy',
        paymentIntentId: 'pi_yyy',
      });
    });

    it('should use AUTH_URL in the return_url when configured', async () => {
      vi.stubEnv('AUTH_URL', 'https://mysite.com');

      await createPurchaseCheckoutSessionAction(validInput);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: 'https://mysite.com/releases/release-123',
        })
      );
    });

    it('should fall back to localhost when AUTH_URL is not set', async () => {
      delete process.env.AUTH_URL;

      await createPurchaseCheckoutSessionAction(validInput);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: 'http://localhost:3000/releases/release-123',
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
  });
});
