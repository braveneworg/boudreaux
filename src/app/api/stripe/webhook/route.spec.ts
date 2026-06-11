/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { POST } from './route';

vi.mock('server-only', () => ({}));

const { stripeLoggerMock } = vi.hoisted(() => ({
  stripeLoggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { stripe: stripeLoggerMock },
}));

const { MockPrismaClientKnownRequestError } = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    meta?: Record<string, unknown>;
    constructor(
      message: string,
      opts: { code: string; clientVersion: string; meta?: Record<string, unknown> }
    ) {
      super(message);
      this.code = opts.code;
      this.clientVersion = opts.clientVersion;
      this.meta = opts.meta;
      this.name = 'PrismaClientKnownRequestError';
    }
  }
  return { MockPrismaClientKnownRequestError };
});

vi.mock('@prisma/client/runtime/library', () => ({
  PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
}));

vi.mock('unique-username-generator', () => ({
  generateUsername: () => 'generated-username',
}));

const mockConstructEvent = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockCheckoutSessionsRetrieve(...args),
      },
    },
  },
}));

const mockFindByPaymentIntentId = vi.fn();
const mockPurchaseCreate = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockFindByUserAndRelease = vi.fn();
const mockUpdateSessionId = vi.fn();
const mockMarkRefunded = vi.fn();

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByPaymentIntentId: (...args: unknown[]) => mockFindByPaymentIntentId(...args),
    create: (...args: unknown[]) => mockPurchaseCreate(...args),
    findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
    findByUserAndRelease: (...args: unknown[]) => mockFindByUserAndRelease(...args),
    updateSessionId: (...args: unknown[]) => mockUpdateSessionId(...args),
    markRefunded: (...args: unknown[]) => mockMarkRefunded(...args),
  },
}));

const mockSendPurchaseConfirmationEmail = vi.fn();

vi.mock('@/lib/email/send-purchase-confirmation', () => ({
  sendPurchaseConfirmationEmail: (...args: unknown[]) => mockSendPurchaseConfirmationEmail(...args),
}));

const mockReleaseFindTitleById = vi.fn();
const mockUserCreateGuestPurchaser = vi.fn();
const mockUserFindEmailById = vi.fn();
// Legacy aliases preserved so existing assertions still read clearly.
const mockPrismaReleaseFindFirst = mockReleaseFindTitleById;
const mockPrismaUserCreate = mockUserCreateGuestPurchaser;
const mockPrismaUserFindUnique = mockUserFindEmailById;

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    findTitleById: (...args: unknown[]) => mockReleaseFindTitleById(...args),
  },
}));

vi.mock('@/lib/services/user-service', () => ({
  UserService: {
    createGuestPurchaser: (...args: unknown[]) => mockUserCreateGuestPurchaser(...args),
    findEmailById: (...args: unknown[]) => mockUserFindEmailById(...args),
  },
}));

const WEBHOOK_SECRET = 'whsec_test_secret';

function createRequest(body: string, signature: string | null = 'sig_test'): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) {
    headers.set('stripe-signature', signature);
  }
  return new NextRequest('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    body,
    headers,
  });
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return 404 in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const request = createRequest('{}');
    const response = await POST(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it('should return 400 when stripe-signature header is missing', async () => {
    const request = createRequest('{}', null);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Missing stripe-signature header');
  });

  it('should return 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const request = createRequest('{}');
    const response = await POST(request);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Webhook not configured');
  });

  it('should return 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const request = createRequest('{}');
    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid signature');
  });

  it('should return 200 for unrecognized event types', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'some.unknown.event',
      data: { object: {} },
    });
    const request = createRequest('{}');
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should return 500 when a handler throws so Stripe retries delivery', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          mode: 'payment',
          metadata: {
            type: 'release_purchase',
            releaseId: '507f1f77bcf86cd799439011',
            userId: '507f1f77bcf86cd799439012',
          },
          payment_intent: 'pi_handler_throws',
        },
      },
    });
    mockCheckoutSessionsRetrieve.mockRejectedValue(new Error('Database error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createRequest('{}');
    const response = await POST(request);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Handler failed');
    vi.mocked(console.error).mockRestore();
  });

  describe('IP allowlist', () => {
    it('returns 403 when the request IP is not in STRIPE_WEBHOOK_IP_RANGES', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
      vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');

      const headers = new Headers({
        'content-type': 'application/json',
        'stripe-signature': 'sig_test',
        'x-forwarded-for': '1.2.3.4',
      });
      const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
        headers,
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: 'Forbidden' });
    });

    it('passes through to signature verification when the request IP matches an allowed CIDR', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
      vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const headers = new Headers({
        'content-type': 'application/json',
        'stripe-signature': 'sig_test',
        'x-forwarded-for': '3.18.12.63',
      });
      const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
        headers,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('uses x-real-ip as fallback when x-forwarded-for is absent and IP is allowed', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
      vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const headers = new Headers({
        'content-type': 'application/json',
        'stripe-signature': 'sig_test',
        'x-real-ip': '3.18.12.63',
      });
      const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
        headers,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 403 when x-forwarded-for is absent and x-real-ip is not in the allowed range', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
      vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');

      const headers = new Headers({
        'content-type': 'application/json',
        'stripe-signature': 'sig_test',
        'x-real-ip': '9.9.9.9',
      });
      const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
        headers,
      });

      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it('prefers x-forwarded-for over x-real-ip when both headers are present', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
      vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');

      const headers = new Headers({
        'content-type': 'application/json',
        'stripe-signature': 'sig_test',
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '3.18.12.63',
      });
      const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
        headers,
      });

      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it('bypasses the IP check when SKIP_STRIPE_IP_CHECK=true regardless of remote IP', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
      vi.stubEnv('SKIP_STRIPE_IP_CHECK', 'true');
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const headers = new Headers({
        'content-type': 'application/json',
        'stripe-signature': 'sig_test',
        'x-forwarded-for': '9.9.9.9',
      });
      const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
        headers,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    describe('IP allowlist — malformed inputs', () => {
      const makeRequest = (forwardedFor: string) => {
        vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
        vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
        const headers = new Headers({
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
          'x-forwarded-for': forwardedFor,
        });
        return new NextRequest('http://localhost:3000/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
          headers,
        });
      };

      it('returns 403 when x-forwarded-for is an empty string', async () => {
        const response = await POST(makeRequest(''));
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for has too few octets', async () => {
        const response = await POST(makeRequest('3.18.12'));
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for has too many octets', async () => {
        const response = await POST(makeRequest('3.18.12.63.99'));
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for contains non-numeric octets', async () => {
        const response = await POST(makeRequest('3.abc.12.63'));
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for contains an octet above 255', async () => {
        const response = await POST(makeRequest('3.18.12.256'));
        expect(response.status).toBe(403);
      });

      it('returns 403 when STRIPE_WEBHOOK_IP_RANGES has a prefix length above 32', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/33');
        vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
        const headers = new Headers({
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
          'x-forwarded-for': '3.18.12.63',
        });
        const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
          headers,
        });
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('returns 403 when STRIPE_WEBHOOK_IP_RANGES has a negative prefix length', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/-1');
        vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
        const headers = new Headers({
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
          'x-forwarded-for': '3.18.12.63',
        });
        const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
          headers,
        });
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('returns 403 when STRIPE_WEBHOOK_IP_RANGES has a decimal prefix length (e.g. /32.5)', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32.5');
        vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
        const headers = new Headers({
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
          'x-forwarded-for': '3.18.12.63',
        });
        const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
          headers,
        });
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('correctly matches an IP within a /24 subnet', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.0/24');
        vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
        mockConstructEvent.mockImplementation(() => {
          throw new Error('Invalid signature');
        });
        const headers = new Headers({
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
          'x-forwarded-for': '3.18.12.200',
        });
        const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
          headers,
        });
        const response = await POST(request);
        expect(response.status).toBe(400);
      });

      it('returns 403 for an IP outside a /24 subnet', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.0/24');
        vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
        const headers = new Headers({
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
          'x-forwarded-for': '3.18.13.1',
        });
        const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
          headers,
        });
        const response = await POST(request);
        expect(response.status).toBe(403);
      });
    });
  });

  describe('checkout.session.completed — release_purchase (payment mode)', () => {
    const validReleaseId = '507f1f77bcf86cd799439011';
    const validUserId = '507f1f77bcf86cd799439012';

    const makePaymentSession = (overrides: Record<string, unknown> = {}) => ({
      id: 'cs_pay_123',
      mode: 'payment',
      metadata: {
        type: 'release_purchase',
        releaseId: validReleaseId,
        userId: validUserId,
      },
      payment_intent: 'pi_test_001',
      amount_total: 1000,
      currency: 'usd',
      customer_details: { email: 'buyer@example.com' },
      customer_email: null,
      ...overrides,
    });

    beforeEach(() => {
      const session = makePaymentSession();
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockFindByUserAndRelease.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({
        id: 'purchase-new',
        stripePaymentIntentId: 'pi_test_001',
      });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Test Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
    });

    it('calls PurchaseRepository.create and sendPurchaseConfirmationEmail for a valid purchase', async () => {
      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith({
        userId: validUserId,
        releaseId: validReleaseId,
        amountPaid: 1000,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test_001',
        stripeSessionId: 'cs_pay_123',
      });
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith({
        purchaseId: 'purchase-new',
        customerEmail: 'buyer@example.com',
        releaseTitle: 'Test Release',
        amountPaidCents: 1000,
        releaseId: validReleaseId,
      });
    });

    it('skips create but still attempts email when paymentIntentId already exists (idempotency)', async () => {
      mockFindByPaymentIntentId.mockResolvedValue({ id: 'purchase-existing' });

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseId: 'purchase-existing' })
      );
    });

    it('retrieves payment_intent from the Stripe API when webhook payload has null payment_intent', async () => {
      const payloadSession = makePaymentSession({ payment_intent: null });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: payloadSession },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        ...payloadSession,
        payment_intent: 'pi_retrieved_from_api',
      });

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stripePaymentIntentId: 'pi_retrieved_from_api' })
      );
    });

    it('returns 500 when stripe.checkout.sessions.retrieve fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCheckoutSessionsRetrieve.mockRejectedValue(new Error('Stripe API error'));

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(500);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('does not handle non-payment-mode checkout sessions', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sub_999',
            mode: 'subscription',
            customer: 'cus_sub_999',
            customer_details: { email: 'noop@example.com' },
          },
        },
      });

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(mockSendPurchaseConfirmationEmail).not.toHaveBeenCalled();
    });

    it('extracts paymentIntentId from object form', async () => {
      const session = makePaymentSession({ payment_intent: { id: 'pi_obj_001' } });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockFindByPaymentIntentId).toHaveBeenCalledWith('pi_obj_001');
    });

    it('returns early when releaseId is missing from metadata', async () => {
      const session = {
        id: 'cs_no_rid',
        mode: 'payment',
        metadata: { type: 'release_purchase', userId: validUserId },
        payment_intent: 'pi_no_rid',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'norid@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('defaults amount_total to 0 when null', async () => {
      const session = makePaymentSession({ amount_total: null });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith(expect.objectContaining({ amountPaid: 0 }));
    });

    it('defaults currency to "usd" when null', async () => {
      const session = makePaymentSession({ currency: null });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'usd' }));
    });

    it('uses "Unknown Release" when release is not found in DB', async () => {
      mockPrismaReleaseFindFirst.mockResolvedValue(null);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ releaseTitle: 'Unknown Release' })
      );
    });

    it('falls back to user email from database when Stripe session has no customer email', async () => {
      const session = makePaymentSession({
        customer_details: { email: null },
        customer_email: null,
      });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockPrismaUserFindUnique.mockResolvedValue('user-from-db@example.com');

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPrismaUserFindUnique).toHaveBeenCalledWith(validUserId);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: 'user-from-db@example.com' })
      );
    });

    it('logs error when no email is available from any source', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = makePaymentSession({
        customer_details: { email: null },
        customer_email: null,
      });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockPrismaUserFindUnique.mockResolvedValue(null);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).not.toHaveBeenCalled();
      expect(stripeLoggerMock.error).toHaveBeenCalledWith(
        'release_purchase webhook: no email available for confirmation',
        undefined,
        expect.objectContaining({ purchaseId: 'purchase-new', userId: validUserId })
      );
    });

    it('falls back to customer_email when customer_details.email is null', async () => {
      const session = makePaymentSession({
        customer_details: { email: null },
        customer_email: 'fallback-buyer@example.com',
      });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: 'fallback-buyer@example.com' })
      );
    });

    it('resolves userId from customer email when userId is missing from metadata', async () => {
      const session = {
        ...makePaymentSession(),
        metadata: { type: 'release_purchase', releaseId: validReleaseId },
        customer_details: { email: 'resolved@example.com' },
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue({ id: 'u-resolved' });

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockFindUserByEmail).toHaveBeenCalledWith('resolved@example.com');
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-resolved' })
      );
    });

    it('creates a new user via UserService.createGuestPurchaser when no user exists for the email', async () => {
      const session = {
        ...makePaymentSession(),
        metadata: { type: 'release_purchase', releaseId: validReleaseId },
        customer_details: { email: 'newguest@example.com' },
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue(null);
      mockPrismaUserCreate.mockResolvedValue({ id: 'u-new', created: true });

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPrismaUserCreate).toHaveBeenCalledWith('newguest@example.com');
      expect(mockPurchaseCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-new' }));
    });

    it('propagates errors from guest-user creation and returns 500', async () => {
      const session = {
        ...makePaymentSession(),
        metadata: { type: 'release_purchase', releaseId: validReleaseId },
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue(null);
      mockPrismaUserCreate.mockRejectedValue(new Error('Unexpected DB error'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(500);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('returns 200 when no email is available and userId cannot be resolved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        ...makePaymentSession(),
        metadata: { type: 'release_purchase', releaseId: validReleaseId },
        customer_details: { email: null },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('recovers from P2002 race on purchase creation when target is stripePaymentIntentId', async () => {
      mockFindByPaymentIntentId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'p-pi-raced' });
      mockPurchaseCreate.mockRejectedValue(
        new MockPrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`stripePaymentIntentId`)',
          {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['stripePaymentIntentId'] },
          }
        )
      );

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseId: 'p-pi-raced' })
      );
    });

    it('returns 500 when P2002 on stripePaymentIntentId but re-fetch finds no purchase', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPurchaseCreate.mockRejectedValue(
        new MockPrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['stripePaymentIntentId'] },
        })
      );

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(500);
      vi.mocked(console.error).mockRestore();
    });

    it('should skip purchase when releaseId has invalid format', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = makePaymentSession({
        metadata: { type: 'release_purchase', releaseId: 'invalid!', userId: validUserId },
      });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('should skip purchase when userId has invalid format', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = makePaymentSession({
        metadata: { type: 'release_purchase', releaseId: validReleaseId, userId: 'not-hex' },
      });
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('should skip purchase when type is missing from metadata on retrieved session', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const eventSession = makePaymentSession();
      const retrievedSession = {
        ...eventSession,
        metadata: { releaseId: validReleaseId, userId: validUserId },
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: eventSession },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(retrievedSession);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('logs warning when sendPurchaseConfirmationEmail returns false', async () => {
      mockSendPurchaseConfirmationEmail.mockResolvedValue(false);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(stripeLoggerMock.warn).toHaveBeenCalledWith(
        'release_purchase webhook: sendPurchaseConfirmationEmail returned false',
        expect.objectContaining({ purchaseId: 'purchase-new' })
      );
    });
  });

  it('should handle non-Error throw in constructEvent', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw 'raw string error';
    });
    const response = await POST(createRequest('{}'));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid signature');
  });

  it('treats CIDR without slash as /32', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63');
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const headers = new Headers({
      'content-type': 'application/json',
      'stripe-signature': 'sig_test',
      'x-forwarded-for': '3.18.12.63',
    });
    const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('matches all IPs with a /0 CIDR', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '0.0.0.0/0');
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const headers = new Headers({
      'content-type': 'application/json',
      'stripe-signature': 'sig_test',
      'x-forwarded-for': '123.45.67.89',
    });
    const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 403 when IP has a leading zero in an octet', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
    const headers = new Headers({
      'content-type': 'application/json',
      'stripe-signature': 'sig_test',
      'x-forwarded-for': '03.18.12.63',
    });
    const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers,
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('returns 403 when neither x-forwarded-for nor x-real-ip headers are present', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', '3.18.12.63/32');
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
    const headers = new Headers({
      'content-type': 'application/json',
      'stripe-signature': 'sig_test',
    });
    const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
      headers,
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('skips IP block when STRIPE_WEBHOOK_IP_RANGES is undefined', async () => {
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
    delete process.env.STRIPE_WEBHOOK_IP_RANGES;
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const response = await POST(createRequest('{}'));
    expect(response.status).toBe(400);
  });

  describe('charge.refunded', () => {
    it('marks purchase as refunded when payment_intent is a string', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { id: 'ch_refund_1', payment_intent: 'pi_refund_123' } },
      });
      mockMarkRefunded.mockResolvedValue(true);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockMarkRefunded).toHaveBeenCalledWith('pi_refund_123');
      expect(stripeLoggerMock.info).toHaveBeenCalledWith(
        'charge.refunded: purchase marked as refunded',
        expect.objectContaining({ paymentIntentId: 'pi_refund_123' })
      );
    });

    it('logs warning when no matching un-refunded purchase is found', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { id: 'ch_refund_2', payment_intent: 'pi_no_match' } },
      });
      mockMarkRefunded.mockResolvedValue(false);

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(stripeLoggerMock.warn).toHaveBeenCalledWith(
        'charge.refunded: no matching un-refunded purchase found',
        expect.objectContaining({ paymentIntentId: 'pi_no_match' })
      );
    });

    it('extracts payment_intent ID from object form', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { id: 'ch_refund_obj', payment_intent: { id: 'pi_obj_form' } } },
      });
      mockMarkRefunded.mockResolvedValue(true);
      vi.spyOn(console, 'info').mockImplementation(() => {});

      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockMarkRefunded).toHaveBeenCalledWith('pi_obj_form');
      vi.mocked(console.info).mockRestore();
    });

    it('logs error when payment_intent is missing from charge', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { id: 'ch_no_pi', payment_intent: null } },
      });
      const response = await POST(createRequest('{}'));

      expect(response.status).toBe(200);
      expect(mockMarkRefunded).not.toHaveBeenCalled();
      expect(stripeLoggerMock.error).toHaveBeenCalledWith(
        'charge.refunded missing payment_intent',
        undefined,
        expect.objectContaining({ chargeId: 'ch_no_pi' })
      );
    });
  });
});
