/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { UserRepository } from '@/lib/repositories/user-repository';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
const mockSignInMagicLink = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

// #665: the action no longer mints a session from the checkout sessionId. It
// requires email-ownership proof — a magic link sent to the purchase owner's
// email (`auth.api.signInMagicLink`). Verification, not a raw session, is the
// gate to downloading.
vi.mock('@/lib/auth', () => ({
  auth: {
    api: { signInMagicLink: (...args: unknown[]) => mockSignInMagicLink(...args) },
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

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    findEmailById: vi.fn(),
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
    mockSignInMagicLink.mockResolvedValue(undefined);
    vi.mocked(UserRepository.findEmailById).mockResolvedValue({ email: 'buyer@x.io' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns early when user is already authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'existing-user' } });

    const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

    expect(result).toEqual({ success: true });
    expect(PurchaseRepository.findBySessionId).not.toHaveBeenCalled();
    expect(mockSignInMagicLink).not.toHaveBeenCalled();
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
    expect(mockSignInMagicLink).not.toHaveBeenCalled();
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

    it('resolves the purchase from the trust anchor and requires verification', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: true, verificationRequired: true });
      expect(PurchaseRepository.findBySessionId).toHaveBeenCalledWith('cs_test_123');
    });

    it('sends a magic link to the purchase owner’s email instead of minting a session', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      vi.mocked(UserRepository.findEmailById).mockResolvedValue({ email: 'owner@x.io' });

      await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(UserRepository.findEmailById).toHaveBeenCalledWith('user-123');
      expect(mockSignInMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ email: 'owner@x.io' }),
          headers: requestHeaders,
        })
      );
    });

    it('returns user_not_found and sends NO magic link when no purchase exists', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(null);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_missing' });

      expect(result).toEqual({ success: false, error: 'user_not_found' });
      expect(mockSignInMagicLink).not.toHaveBeenCalled();
    });

    it('returns user_not_found when the purchase owner has no resolvable email', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      vi.mocked(UserRepository.findEmailById).mockResolvedValue(null);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'user_not_found' });
      expect(mockSignInMagicLink).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
    });

    it('returns server_error when sending the magic link throws', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      mockSignInMagicLink.mockRejectedValue(new Error('send failed'));

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
