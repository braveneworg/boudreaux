/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET } from './route';

// Mock rate limiting to pass through
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) => (handler: Function) => (req: unknown, ctx: unknown) =>
      handler(req, ctx),
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  pollingLimiter: {},
  POLLING_LIMIT: 60,
}));

const mockFindBySessionId = vi.fn();
const mockFindByPaymentIntentId = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findBySessionId: (...args: unknown[]) => mockFindBySessionId(...args),
    findByPaymentIntentId: (...args: unknown[]) => mockFindByPaymentIntentId(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

const mockStripeSessionsRetrieve = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockStripeSessionsRetrieve(...args),
      },
    },
  },
}));

const makeRequest = (sessionId?: string) => {
  const url = `http://localhost/api/releases/release-123/purchase-status${sessionId ? `?sessionId=${sessionId}` : ''}`;
  return new NextRequest(url);
};

const makeContext = (id = 'release-123') => ({
  params: Promise.resolve({ id }),
});

describe('GET /api/releases/[id]/purchase-status', () => {
  it('returns 400 with missing_session_id when sessionId is absent', async () => {
    const request = makeRequest();
    const response = await GET(request, makeContext());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'missing_session_id' });
  });

  it('returns 200 with confirmed: false and no-store header when purchase is not found', async () => {
    mockFindBySessionId.mockResolvedValue(null);

    const request = makeRequest('cs_test_notfound');
    const response = await GET(request, makeContext());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ confirmed: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockFindBySessionId).toHaveBeenCalledWith('cs_test_notfound');
  });

  it('returns 200 with confirmed: true when a purchase record exists', async () => {
    mockFindBySessionId.mockResolvedValue({
      id: 'purchase-abc',
      stripeSessionId: 'cs_test_found',
    });

    const request = makeRequest('cs_test_found');
    const response = await GET(request, makeContext());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ confirmed: true });
    expect(mockFindBySessionId).toHaveBeenCalledWith('cs_test_found');
  });

  it('returns 400 with invalid_session_id when sessionId has invalid format', async () => {
    const request = makeRequest('invalid-session-id');
    const response = await GET(request, makeContext());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'invalid_session_id' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockFindBySessionId).not.toHaveBeenCalled();
  });

  it('returns 400 for session ID with SQL injection attempt', async () => {
    const request = makeRequest("cs_test_'; DROP TABLE purchases; --");
    const response = await GET(request, makeContext());

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'invalid_session_id' });
  });

  describe('dev fallback (NODE_ENV !== production)', () => {
    it('creates purchase from Stripe when DB record is missing and session is paid', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: 'new-purchase' });
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_abc123',
        payment_status: 'paid',
        metadata: { type: 'release_purchase', userId: 'user-1', releaseId: 'release-456' },
        payment_intent: 'pi_test_123',
        amount_total: 500,
        currency: 'usd',
      });

      const request = makeRequest('cs_test_abc123');
      const response = await GET(request, makeContext('release-456'));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: true });
      expect(mockStripeSessionsRetrieve).toHaveBeenCalledWith('cs_test_abc123');
      expect(mockCreate).toHaveBeenCalledWith({
        userId: 'user-1',
        releaseId: 'release-456',
        amountPaid: 500,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test_123',
        stripeSessionId: 'cs_test_abc123',
      });
    });

    it('skips creation when purchase already exists by paymentIntentId (race condition)', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockFindByPaymentIntentId.mockResolvedValue({ id: 'existing-purchase' });
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_racecheck',
        payment_status: 'paid',
        metadata: { type: 'release_purchase', userId: 'user-1', releaseId: 'release-123' },
        payment_intent: 'pi_test_existing',
        amount_total: 500,
        currency: 'usd',
      });

      const request = makeRequest('cs_test_racecheck');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: true });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns confirmed: false when Stripe session is not paid', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_unpaid',
        payment_status: 'unpaid',
        metadata: { type: 'release_purchase', userId: 'user-1' },
        payment_intent: 'pi_test_unpaid',
      });

      const request = makeRequest('cs_test_unpaid');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns confirmed: false when metadata type is not release_purchase', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_subscription',
        payment_status: 'paid',
        metadata: { type: 'subscription' },
        payment_intent: 'pi_test_sub',
      });

      const request = makeRequest('cs_test_subscription');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
    });

    it('returns confirmed: false when userId is missing from metadata', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_nouser',
        payment_status: 'paid',
        metadata: { type: 'release_purchase' },
        payment_intent: 'pi_test_nouser',
      });

      const request = makeRequest('cs_test_nouser');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
    });

    it('returns confirmed: false when payment_intent is missing', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_nopi',
        payment_status: 'paid',
        metadata: { type: 'release_purchase', userId: 'user-1' },
        payment_intent: null,
      });

      const request = makeRequest('cs_test_nopi');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
    });

    it('handles Stripe API error gracefully and returns confirmed: false', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockRejectedValue(new Error('Stripe API error'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const request = makeRequest('cs_test_stripeerr');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
      expect(warnSpy).toHaveBeenCalledWith(
        '[purchase-status] Dev fallback failed:',
        'Stripe API error'
      );

      warnSpy.mockRestore();
    });

    it('handles non-Error throw from Stripe gracefully', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockRejectedValue('string error');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const request = makeRequest('cs_test_stringerr');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
      expect(warnSpy).toHaveBeenCalledWith(
        '[purchase-status] Dev fallback failed:',
        'string error'
      );

      warnSpy.mockRestore();
    });

    it('handles payment_intent as object with id property', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: 'new-purchase' });
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_piobject',
        payment_status: 'paid',
        metadata: { type: 'release_purchase', userId: 'user-1', releaseId: 'release-789' },
        payment_intent: { id: 'pi_test_obj' },
        amount_total: 1000,
        currency: 'eur',
      });

      const request = makeRequest('cs_test_piobject');
      const response = await GET(request, makeContext('release-789'));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: true });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_test_obj',
        })
      );
    });

    it('uses default amount and currency when session values are null', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: 'new-purchase' });
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_defaults',
        payment_status: 'paid',
        metadata: { type: 'release_purchase', userId: 'user-1', releaseId: 'release-123' },
        payment_intent: 'pi_test_defaults',
        amount_total: null,
        currency: null,
      });

      const request = makeRequest('cs_test_defaults');
      const response = await GET(request, makeContext());

      expect(response.status).toBe(200);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaid: 0,
          currency: 'usd',
        })
      );
    });

    it('returns confirmed: false when session metadata releaseId does not match route releaseId', async () => {
      mockFindBySessionId.mockResolvedValue(null);
      mockStripeSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_mismatch',
        payment_status: 'paid',
        metadata: { type: 'release_purchase', userId: 'user-1', releaseId: 'release-other' },
        payment_intent: 'pi_test_mismatch',
        amount_total: 500,
        currency: 'usd',
      });

      const request = makeRequest('cs_test_mismatch');
      const response = await GET(request, makeContext('release-123'));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ confirmed: false });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
