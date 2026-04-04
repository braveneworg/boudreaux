/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('../../../auth', () => ({
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

vi.mock('unique-username-generator', () => ({
  generateUsername: () => 'generated-username',
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findBySessionId: vi.fn(),
    findUserByEmail: vi.fn(),
  },
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: vi.fn(),
      },
    },
  },
}));

vi.mock('@prisma/client/runtime/library', () => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(message: string, opts: { code: string; clientVersion: string }) {
      super(message);
      this.code = opts.code;
      this.clientVersion = opts.clientVersion;
      this.name = 'PrismaClientKnownRequestError';
    }
  }
  return { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError };
});

// Must import after mocks are set up
const { createPurchaseSessionAction } = await import('./create-purchase-session-action');
const { prisma } = await import('@/lib/prisma');
const { stripe } = await import('@/lib/stripe');
const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');

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
  stripeCustomerId: null,
  subscriptionStatus: null,
  subscriptionTier: null,
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
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue({
        id: 'purchase-1',
        userId: 'user-123',
        releaseId: 'release-1',
        amountPaid: 500,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test',
        stripeSessionId: 'cs_test_123',
        confirmationEmailSentAt: null,
        purchasedAt: new Date(),
      });
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

    it('does not call Stripe API when purchase is found in DB', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue({
        id: 'purchase-1',
        userId: 'user-123',
        releaseId: 'release-1',
        amountPaid: 500,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test',
        stripeSessionId: 'cs_test_123',
        confirmationEmailSentAt: null,
        purchasedAt: new Date(),
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

      await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    it('returns error when user record not found for purchase', async () => {
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue({
        id: 'purchase-1',
        userId: 'user-123',
        releaseId: 'release-1',
        amountPaid: 500,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test',
        stripeSessionId: 'cs_test_123',
        confirmationEmailSentAt: null,
        purchasedAt: new Date(),
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_123' });

      expect(result).toEqual({ success: false, error: 'user_not_found' });
      expect(mockCookiesSet).not.toHaveBeenCalled();
    });
  });

  describe('subscription path (Stripe fallback)', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue(null);
    });

    it('retrieves Stripe session when no purchase found', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'complete',
        customer_details: { email: 'buyer@example.com' },
        customer_email: null,
      } as never);
      vi.mocked(PurchaseRepository.findUserByEmail).mockResolvedValue({ id: 'user-123' });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_456' });

      expect(result).toEqual({ success: true });
      expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_456');
      expect(PurchaseRepository.findUserByEmail).toHaveBeenCalledWith('buyer@example.com');
    });

    it('returns error when Stripe session is not complete', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'open',
        customer_details: { email: 'buyer@example.com' },
      } as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_456' });

      expect(result).toEqual({ success: false, error: 'session_not_complete' });
      expect(mockCookiesSet).not.toHaveBeenCalled();
    });

    it('returns error when no customer email in Stripe session', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'complete',
        customer_details: { email: null },
        customer_email: null,
      } as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_456' });

      expect(result).toEqual({ success: false, error: 'no_customer_email' });
    });

    it('creates a new user when email is not found in DB', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'complete',
        customer_details: { email: 'new-buyer@example.com' },
        customer_email: null,
      } as never);
      vi.mocked(PurchaseRepository.findUserByEmail).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user-id',
        email: 'new-buyer@example.com',
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
        email: 'new-buyer@example.com',
        username: 'generated-username',
      } as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_789' });

      expect(result).toEqual({ success: true });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new-buyer@example.com',
          emailVerified: expect.any(Date),
          username: 'generated-username',
        },
      });
    });

    it('recovers from P2002 race on user creation by re-fetching the existing user', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'complete',
        customer_details: { email: 'race@example.com' },
        customer_email: null,
      } as never);
      // First call returns null (user not found), triggering create
      vi.mocked(PurchaseRepository.findUserByEmail)
        .mockResolvedValueOnce(null)
        // Second call (after P2002) returns the already-created user
        .mockResolvedValueOnce({ id: 'raced-user-id' });
      vi.mocked(prisma.user.create).mockRejectedValue(
        new PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
          code: 'P2002',
          clientVersion: '5.0.0',
        })
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        id: 'raced-user-id',
        email: 'race@example.com',
      } as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_race' });

      expect(result).toEqual({ success: true });
      expect(PurchaseRepository.findUserByEmail).toHaveBeenCalledTimes(2);
      expect(PurchaseRepository.findUserByEmail).toHaveBeenLastCalledWith('race@example.com');
    });

    it('propagates non-P2002 errors from user creation', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'complete',
        customer_details: { email: 'error@example.com' },
        customer_email: null,
      } as never);
      vi.mocked(PurchaseRepository.findUserByEmail).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockRejectedValue(new Error('Unexpected DB error'));

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_dberror' });

      expect(result).toEqual({ success: false, error: 'server_error' });
    });

    it('uses customer_email fallback when customer_details.email is null', async () => {
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        status: 'complete',
        customer_details: { email: null },
        customer_email: 'fallback@example.com',
      } as never);
      vi.mocked(PurchaseRepository.findUserByEmail).mockResolvedValue({ id: 'user-456' });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        id: 'user-456',
        email: 'fallback@example.com',
      } as never);

      const result = await createPurchaseSessionAction({ sessionId: 'cs_test_fallback' });

      expect(result).toEqual({ success: true });
      expect(PurchaseRepository.findUserByEmail).toHaveBeenCalledWith('fallback@example.com');
    });
  });

  describe('cookie configuration', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(null);
      vi.mocked(PurchaseRepository.findBySessionId).mockResolvedValue({
        id: 'purchase-1',
        userId: 'user-123',
        releaseId: 'release-1',
        amountPaid: 500,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test',
        stripeSessionId: 'cs_test_123',
        confirmationEmailSentAt: null,
        purchasedAt: new Date(),
      });
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
  });
});
