/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockEncode = vi.fn();
vi.mock('@auth/core/jwt', () => ({
  encode: (...args: unknown[]) => mockEncode(...args),
}));

const mockCookiesSet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ set: mockCookiesSet }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findBySessionId: vi.fn(),
  },
}));

// Must import after mocks are set up
const { createPurchaseSessionAction } = await import('./create-purchase-session-action');
const { prisma } = await import('@/lib/prisma');

const mockUser = {
  id: 'user-123',
  email: 'buyer@example.com',
  name: 'Buyer',
  username: 'buyer',
  role: 'user',
  image: null,
  emailVerified: new Date('2026-01-01'),
  firstName: null,
  lastName: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  zipCode: null,
  country: null,
  allowSmsNotifications: false,
};

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
    vi.stubEnv('AUTH_SECRET', 'test-secret-that-is-long-enough-for-encryption');
    vi.stubEnv('NODE_ENV', 'development');
    mockEncode.mockResolvedValue('encrypted-jwt-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns early when user is already authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'existing-user' } });

    const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

    expect(result).toEqual({ success: true });
    expect(PurchaseRepository.findBySessionId).not.toHaveBeenCalled();
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it('rejects invalid session IDs', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await createPurchaseSessionAction({ sessionId: 'invalid_id' });

    expect(result).toEqual({ success: false, error: 'invalid_session_id' });
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

    it('creates session cookie for a purchase found by session ID', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: true });
      expect(PurchaseRepository.findBySessionId).toHaveBeenCalledWith('cs_test_123');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: expect.objectContaining({ id: true, email: true, role: true }),
      });
      expect(mockEncode).toHaveBeenCalledWith({
        token: { sub: 'user-123', user: mockUser },
        secret: 'test-secret-that-is-long-enough-for-encryption',
        salt: 'next-auth.session-token',
        maxAge: 30 * 24 * 60 * 60,
      });
      expect(mockCookiesSet).toHaveBeenCalledWith(
        'next-auth.session-token',
        'encrypted-jwt-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: false,
        })
      );
    });

    it('returns user_not_found when no purchase exists for the session', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(null);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_missing' });

      expect(result).toEqual({ success: false, error: 'user_not_found' });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockCookiesSet).not.toHaveBeenCalled();
    });

    it('returns user_not_found when user record is missing for the purchase', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'user_not_found' });
      expect(mockCookiesSet).not.toHaveBeenCalled();
    });
  });

  describe('cookie configuration', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(mockPurchase);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    });

    it('uses non-secure cookie name in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'next-auth.session-token',
        expect.any(String),
        expect.objectContaining({ secure: false })
      );
    });

    it('uses secure cookie name in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('E2E_MODE', '');

      await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(mockCookiesSet).toHaveBeenCalledWith(
        '__Secure-next-auth.session-token',
        expect.any(String),
        expect.objectContaining({ secure: true })
      );
    });

    it('uses non-secure cookie name in production with E2E_MODE', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('E2E_MODE', 'true');

      await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'next-auth.session-token',
        expect.any(String),
        expect.objectContaining({ secure: false })
      );
    });
  });

  describe('error handling', () => {
    it('returns server_error when AUTH_SECRET is missing', async () => {
      mockAuth.mockResolvedValue(null);
      vi.stubEnv('AUTH_SECRET', '');
      delete process.env.AUTH_SECRET;

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });

    it('returns server_error when an unexpected exception occurs', async () => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(PurchaseRepository.findBySessionId).mockRejectedValue(new Error('DB down'));

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });

    it('returns server_error when an unexpected non-Error value is thrown', async () => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(PurchaseRepository.findBySessionId).mockRejectedValue('string-thrown');

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_456' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });
  });
});
