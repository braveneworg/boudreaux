/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
const mockCreatePurchaseSession = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

// The action now mints the session via the better-auth server-only endpoint
// (`auth.api.createPurchaseSession`) instead of encoding a legacy JWT session.
vi.mock('@/lib/auth', () => ({
  auth: {
    api: { createPurchaseSession: (...args: unknown[]) => mockCreatePurchaseSession(...args) },
  },
}));

const requestHeaders = new Headers({ 'x-real-ip': '203.0.113.7' });
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(requestHeaders),
}));

const limiterCheckMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: () => ({ check: limiterCheckMock }),
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findBySessionId: vi.fn(),
  },
}));

// Must import after mocks are set up
const { createPurchaseSessionAction } = await import('./create-purchase-session-action');

const mockPurchase = {
  id: 'purchase-1',
  userId: 'user-123',
  releaseId: 'release-1',
  amountPaid: 500,
  currency: 'usd',
  stripePaymentIntentId: 'pi_test',
  stripeSessionId: 'cs_test_123',
  confirmationEmailSentAt: null,
  refundedAt: null,
  purchasedAt: new Date(),
};

describe('createPurchaseSessionAction', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    limiterCheckMock.mockResolvedValue(undefined);
    mockCreatePurchaseSession.mockResolvedValue({ status: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns early when user is already authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'existing-user' } });

    const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

    expect(result).toEqual({ success: true });
    expect(PurchaseRepository.findBySessionId).not.toHaveBeenCalled();
    expect(mockCreatePurchaseSession).not.toHaveBeenCalled();
  });

  it('returns rate_limited for unauthenticated callers over the limit', async () => {
    mockAuth.mockResolvedValue(null);
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

    expect(result).toEqual({ success: false, error: 'rate_limited' });
    expect(PurchaseRepository.findBySessionId).not.toHaveBeenCalled();
  });

  it('skips the rate limit in E2E mode', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    mockAuth.mockResolvedValue(null);
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const result = await createPurchaseSessionAction({ sessionId: 'invalid_id' });

    // Falls through to normal validation instead of rate limiting.
    expect(result).toEqual({ success: false, error: 'invalid_session_id' });
    expect(limiterCheckMock).not.toHaveBeenCalled();
  });

  it('rejects invalid session IDs', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await createPurchaseSessionAction({ sessionId: 'invalid_id' });

    expect(result).toEqual({ success: false, error: 'invalid_session_id' });
    expect(mockCreatePurchaseSession).not.toHaveBeenCalled();
  });

  it('rejects empty session IDs', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await createPurchaseSessionAction({ sessionId: '' });

    expect(result).toEqual({ success: false, error: 'invalid_session_id' });
  });

  describe('PWYW purchase path', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
    });

    it('resolves the userId from the purchase trust anchor (Stripe session id)', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: true });
      expect(PurchaseRepository.findBySessionId).toHaveBeenCalledWith('cs_test_123');
    });

    it('mints a better-auth session for the resolved userId with the request headers', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);

      await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(mockCreatePurchaseSession).toHaveBeenCalledWith({
        body: { userId: 'user-123' },
        headers: requestHeaders,
      });
    });

    it('returns user_not_found and mints NO session when no purchase exists', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(null);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_missing' });

      expect(result).toEqual({ success: false, error: 'user_not_found' });
      expect(mockCreatePurchaseSession).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
    });

    it('returns server_error when session creation throws (e.g. ban gate or missing user)', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      mockCreatePurchaseSession.mockRejectedValue(new Error('FORBIDDEN'));

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });

    it('returns server_error when the purchase lookup throws', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockRejectedValue(new Error('DB down'));

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });

    it('returns server_error when an unexpected non-Error value is thrown', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockRejectedValue('string-thrown');

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_456' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });
  });
});
