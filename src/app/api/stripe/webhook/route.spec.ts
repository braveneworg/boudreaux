/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { POST } from './route';

import type Stripe from 'stripe';

vi.mock('server-only', () => ({}));

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
const mockSubscriptionsRetrieve = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
    },
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockCheckoutSessionsRetrieve(...args),
      },
    },
  },
}));

const mockLinkStripeCustomer = vi.fn();
const mockUpdateSubscription = vi.fn();
const mockCancelSubscription = vi.fn();
const mockUpdateSubscriptionStatus = vi.fn();
const mockResetConfirmationEmailSent = vi.fn();
const mockFindByStripeCustomerId = vi.fn();

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    linkStripeCustomer: (...args: unknown[]) => mockLinkStripeCustomer(...args),
    updateSubscription: (...args: unknown[]) => mockUpdateSubscription(...args),
    cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
    updateSubscriptionStatus: (...args: unknown[]) => mockUpdateSubscriptionStatus(...args),
    resetConfirmationEmailSent: (...args: unknown[]) => mockResetConfirmationEmailSent(...args),
    findByStripeCustomerId: (...args: unknown[]) => mockFindByStripeCustomerId(...args),
  },
}));

vi.mock('@/lib/subscriber-rates', () => ({
  getTierByPriceId: (priceId: string) => {
    const map: Record<string, string> = {
      price_minimum: 'minimum',
      price_extra: 'extra',
      price_extra_extra: 'extraExtra',
    };
    return map[priceId] ?? null;
  },
}));

const mockSendConfirmationEmail = vi.fn();

vi.mock('@/lib/email/send-subscription-confirmation', () => ({
  sendSubscriptionConfirmationEmail: (...args: unknown[]) => mockSendConfirmationEmail(...args),
}));

// === PWYW release purchase mock setup ===

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
    mockResetConfirmationEmailSent.mockResolvedValue(undefined);
    mockSendConfirmationEmail.mockResolvedValue(true);
    mockFindByStripeCustomerId.mockResolvedValue(null);
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
    const json = await response.json();
    expect(json.received).toBe(true);
  });

  describe('checkout.session.completed', () => {
    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_test_123',
      customer: 'cus_test_123',
      customer_email: 'subscriber@example.com',
      customer_details: {
        email: 'subscriber@example.com',
      } as Stripe.Checkout.Session.CustomerDetails,
      subscription: 'sub_test_123',
    };

    const mockSubscription: Partial<Stripe.Subscription> = {
      id: 'sub_test_123',
      status: 'active',
      customer: 'cus_test_123',
      items: {
        data: [
          {
            price: { id: 'price_minimum', recurring: { interval: 'month' } },
            current_period_end: 1713398400,
          },
        ],
      } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
    };

    beforeEach(() => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: mockSession },
      });
      mockSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockLinkStripeCustomer.mockResolvedValue({});
      mockUpdateSubscription.mockResolvedValue({});
    });

    it('should link stripe customer and update subscription', async () => {
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockLinkStripeCustomer).toHaveBeenCalledWith('subscriber@example.com', 'cus_test_123');
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test_123');
      expect(mockUpdateSubscription).toHaveBeenCalledWith('cus_test_123', {
        subscriptionId: 'sub_test_123',
        subscriptionStatus: 'active',
        subscriptionTier: 'minimum',
        subscriptionCurrentPeriodEnd: new Date(1713398400 * 1000),
      });
    });

    it('should reset flag and send confirmation email on checkout.session.completed', async () => {
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
        'subscriber@example.com',
        'minimum',
        'month'
      );
    });

    it('should send confirmation email even when re-subscribing after previous subscription', async () => {
      mockResetConfirmationEmailSent.mockResolvedValue(undefined);
      mockSendConfirmationEmail.mockResolvedValue(true);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
        'subscriber@example.com',
        'minimum',
        'month'
      );
    });

    it('should send email with null tier when no subscription on session', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            ...mockSession,
            subscription: null,
          },
        },
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
        'subscriber@example.com',
        null,
        'month'
      );
    });

    it('should skip if email or customer ID is missing', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: null,
            customer_email: null,
            customer_details: null,
          },
        },
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockLinkStripeCustomer).not.toHaveBeenCalled();
      expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.updated', () => {
    const mockSubscription: Partial<Stripe.Subscription> = {
      id: 'sub_test_456',
      status: 'active',
      customer: 'cus_test_123',
      items: {
        data: [
          {
            price: { id: 'price_extra', recurring: { interval: 'month' } },
            current_period_end: 1713398400,
          },
        ],
      } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
    };

    beforeEach(() => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: { object: mockSubscription },
      });
      mockUpdateSubscription.mockResolvedValue({});
    });

    it('should update subscription data', async () => {
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdateSubscription).toHaveBeenCalledWith('cus_test_123', {
        subscriptionId: 'sub_test_456',
        subscriptionStatus: 'active',
        subscriptionTier: 'extra',
        subscriptionCurrentPeriodEnd: new Date(1713398400 * 1000),
      });
    });

    it('should send confirmation email when tier changes', async () => {
      mockFindByStripeCustomerId.mockResolvedValue({
        email: 'subscriber@example.com',
        subscriptionTier: 'minimum',
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
        'subscriber@example.com',
        'extra',
        'month'
      );
    });

    it('should not send confirmation email when tier is unchanged', async () => {
      mockFindByStripeCustomerId.mockResolvedValue({
        email: 'subscriber@example.com',
        subscriptionTier: 'extra',
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).not.toHaveBeenCalled();
      expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('should not send confirmation email when subscription is not active', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: { ...mockSubscription, status: 'past_due' },
        },
      });
      mockFindByStripeCustomerId.mockResolvedValue({
        email: 'subscriber@example.com',
        subscriptionTier: 'minimum',
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).not.toHaveBeenCalled();
      expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('should send confirmation email when subscription is trialing and tier changes', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: { ...mockSubscription, status: 'trialing' },
        },
      });
      mockFindByStripeCustomerId.mockResolvedValue({
        email: 'subscriber@example.com',
        subscriptionTier: 'minimum',
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
        'subscriber@example.com',
        'extra',
        'month'
      );
    });

    it('should not send confirmation email when user is not found', async () => {
      mockFindByStripeCustomerId.mockResolvedValue(null);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).not.toHaveBeenCalled();
      expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.deleted', () => {
    it('should cancel subscription', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: {
          object: { id: 'sub_test_789', customer: 'cus_test_123' },
        },
      });
      mockCancelSubscription.mockResolvedValue({});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockCancelSubscription).toHaveBeenCalledWith('cus_test_123');
    });
  });

  describe('invoice.payment_failed', () => {
    it('should set status to past_due', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'invoice.payment_failed',
        data: {
          object: { id: 'in_test_123', customer: 'cus_test_123' },
        },
      });
      mockUpdateSubscriptionStatus.mockResolvedValue({});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith('cus_test_123', 'past_due');
    });

    it('should skip if customer ID is missing', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'invoice.payment_failed',
        data: {
          object: { id: 'in_test_123', customer: null },
        },
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdateSubscriptionStatus).not.toHaveBeenCalled();
    });
  });

  it('should return 500 when a handler throws so Stripe retries delivery', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer: 'cus_test_123',
          customer_email: 'test@example.com',
          customer_details: { email: 'test@example.com' },
          subscription: 'sub_test_123',
        },
      },
    });
    mockLinkStripeCustomer.mockRejectedValue(new Error('Database error'));

    const request = createRequest('{}');
    const response = await POST(request);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Handler failed');
  });

  describe('IP allowlist', () => {
    // The outer beforeEach stubs STRIPE_WEBHOOK_SECRET.
    // The outer afterEach calls vi.unstubAllEnvs() after every test.

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

      // IP passes the allowlist check; signature verification then fails
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: 'Invalid signature' });
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

      // IP passes the allowlist check via x-real-ip; signature verification then fails
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: 'Invalid signature' });
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
      const json = await response.json();
      expect(json).toEqual({ error: 'Forbidden' });
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

      // x-forwarded-for (1.2.3.4) takes precedence over x-real-ip (3.18.12.63), so it's rejected
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: 'Forbidden' });
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

      // Skip flag active — IP gate skipped; signature check then fails
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: 'Invalid signature' });
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
        const request = makeRequest('');
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for has too few octets', async () => {
        const request = makeRequest('3.18.12');
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for has too many octets', async () => {
        const request = makeRequest('3.18.12.63.99');
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for contains non-numeric octets', async () => {
        const request = makeRequest('3.abc.12.63');
        const response = await POST(request);
        expect(response.status).toBe(403);
      });

      it('returns 403 when x-forwarded-for contains an octet above 255', async () => {
        const request = makeRequest('3.18.12.256');
        const response = await POST(request);
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
        // IP is in the /24 range — passes allowlist, fails signature check
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
    const mockPaymentSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_pay_123',
      mode: 'payment',
      metadata: {
        type: 'release_purchase',
        releaseId: '507f1f77bcf86cd799439011',
        userId: '507f1f77bcf86cd799439012',
      },
      payment_intent: 'pi_test_001',
      amount_total: 1000,
      currency: 'usd',
      customer_details: {
        email: 'buyer@example.com',
      } as Stripe.Checkout.Session.CustomerDetails,
      customer_email: null,
    };

    beforeEach(() => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: mockPaymentSession },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(mockPaymentSession);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({
        id: 'purchase-new',
        stripePaymentIntentId: 'pi_test_001',
      });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Test Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
    });

    it('calls PurchaseRepository.create and sendPurchaseConfirmationEmail for a valid purchase', async () => {
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledWith('cs_pay_123');
      expect(mockPurchaseCreate).toHaveBeenCalledWith({
        userId: '507f1f77bcf86cd799439012',
        releaseId: '507f1f77bcf86cd799439011',
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
        releaseId: '507f1f77bcf86cd799439011',
      });
    });

    it('skips create but still attempts email when paymentIntentId already exists (idempotency)', async () => {
      mockFindByPaymentIntentId.mockResolvedValue({ id: 'purchase-existing' });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith({
        purchaseId: 'purchase-existing',
        customerEmail: 'buyer@example.com',
        releaseTitle: 'Test Release',
        amountPaidCents: 1000,
        releaseId: '507f1f77bcf86cd799439011',
      });
    });

    it('retrieves payment_intent from the Stripe API when webhook payload has null payment_intent', async () => {
      const payloadSession = {
        id: 'cs_null_pi',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: '607f1f77bcf86cd799439013',
          userId: '607f1f77bcf86cd799439014',
        },
        payment_intent: null,
        amount_total: 999,
        currency: 'usd',
        customer_details: { email: 'nullpi@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: payloadSession },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        ...payloadSession,
        payment_intent: 'pi_retrieved_from_api',
      });
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-null-pi' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Null PI Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockCheckoutSessionsRetrieve).toHaveBeenCalledWith('cs_null_pi');
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stripePaymentIntentId: 'pi_retrieved_from_api' })
      );
    });

    it('returns 500 when stripe.checkout.sessions.retrieve fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCheckoutSessionsRetrieve.mockRejectedValue(new Error('Stripe API error'));

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('does not trigger the release purchase handler for a subscription mode session', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sub_999',
            mode: 'subscription',
            customer: 'cus_sub_999',
            customer_email: 'subscriber@example.com',
            customer_details: { email: 'subscriber@example.com' },
            subscription: 'sub_sub_999',
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_sub_999',
        status: 'active',
        customer: 'cus_sub_999',
        items: {
          data: [
            {
              price: { id: 'price_minimum', recurring: { interval: 'month' } },
              current_period_end: 1713398400,
            },
          ],
        },
      });
      mockLinkStripeCustomer.mockResolvedValue({});
      mockUpdateSubscription.mockResolvedValue({});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      // PWYW purchase branch must NOT have fired
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(mockSendPurchaseConfirmationEmail).not.toHaveBeenCalled();
      // Subscription branch must have fired (no regression)
      expect(mockLinkStripeCustomer).toHaveBeenCalledWith('subscriber@example.com', 'cus_sub_999');
    });
  });

  // ─── Branch coverage: non-Error throw in signature verification ───
  it('should handle non-Error throw in constructEvent', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw 'raw string error';
    });
    const request = createRequest('{}');
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Invalid signature');
  });

  // ─── Branch coverage: CIDR without slash (defaults to /32) ───
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

  // ─── Branch coverage: /0 CIDR mask matches all IPs ───
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

  // ─── Branch coverage: object-form customer in checkout.session.completed ───
  describe('checkout.session.completed — object-form fields', () => {
    it('extracts customer ID from object form', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_obj_cust',
            customer: { id: 'cus_obj_123' },
            customer_email: null,
            customer_details: { email: 'obj@example.com' },
            subscription: null,
          },
        },
      });
      mockLinkStripeCustomer.mockResolvedValue({});
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockLinkStripeCustomer).toHaveBeenCalledWith('obj@example.com', 'cus_obj_123');
    });

    it('falls back to customer_email when customer_details.email is null', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fb_email',
            customer: 'cus_fb_123',
            customer_email: 'fallback@example.com',
            customer_details: { email: null },
            subscription: null,
          },
        },
      });
      mockLinkStripeCustomer.mockResolvedValue({});
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockLinkStripeCustomer).toHaveBeenCalledWith('fallback@example.com', 'cus_fb_123');
    });

    it('extracts subscription ID from object form', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_subobj',
            customer: 'cus_subobj',
            customer_email: 'subobj@example.com',
            customer_details: { email: 'subobj@example.com' },
            subscription: { id: 'sub_obj_123' },
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_obj_123',
        status: 'active',
        items: {
          data: [
            {
              price: { id: 'price_extra', recurring: { interval: 'year' } },
              current_period_end: 1713398400,
            },
          ],
        },
      });
      mockLinkStripeCustomer.mockResolvedValue({});
      mockUpdateSubscription.mockResolvedValue({});
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_obj_123');
    });

    it('handles subscription with empty items.data', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_empty_items',
            customer: 'cus_empty',
            customer_email: 'empty@example.com',
            customer_details: { email: 'empty@example.com' },
            subscription: 'sub_empty',
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_empty',
        status: 'active',
        items: { data: [] },
      });
      mockLinkStripeCustomer.mockResolvedValue({});
      mockUpdateSubscription.mockResolvedValue({});
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockUpdateSubscription).toHaveBeenCalledWith('cus_empty', {
        subscriptionId: 'sub_empty',
        subscriptionStatus: 'active',
        subscriptionTier: null,
        subscriptionCurrentPeriodEnd: null,
      });
      expect(mockSendConfirmationEmail).toHaveBeenCalledWith('empty@example.com', null, 'month');
    });
  });

  // ─── Branch coverage: subscription.updated — object customer & empty items ───
  describe('customer.subscription.updated — object customer and empty items', () => {
    it('extracts customer ID from object form', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_obj_upd',
            status: 'active',
            customer: { id: 'cus_obj_upd' },
            items: {
              data: [
                {
                  price: { id: 'price_minimum', recurring: { interval: 'month' } },
                  current_period_end: 1713398400,
                },
              ],
            },
          },
        },
      });
      mockUpdateSubscription.mockResolvedValue({});
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'cus_obj_upd',
        expect.objectContaining({ subscriptionId: 'sub_obj_upd' })
      );
    });

    it('handles empty items.data', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_empty_upd',
            status: 'active',
            customer: 'cus_empty_upd',
            items: { data: [] },
          },
        },
      });
      mockUpdateSubscription.mockResolvedValue({});
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockUpdateSubscription).toHaveBeenCalledWith('cus_empty_upd', {
        subscriptionId: 'sub_empty_upd',
        subscriptionStatus: 'active',
        subscriptionTier: null,
        subscriptionCurrentPeriodEnd: null,
      });
    });
  });

  // ─── Branch coverage: subscription.deleted — object customer ───
  it('subscription.deleted extracts customer ID from object form', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_del_obj', customer: { id: 'cus_del_obj' } } },
    });
    mockCancelSubscription.mockResolvedValue({});
    const request = createRequest('{}');
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockCancelSubscription).toHaveBeenCalledWith('cus_del_obj');
  });

  // ─── Branch coverage: invoice.payment_failed — object customer ───
  it('invoice.payment_failed extracts customer ID from object form', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_obj_123', customer: { id: 'cus_inv_obj' } } },
    });
    mockUpdateSubscriptionStatus.mockResolvedValue({});
    const request = createRequest('{}');
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith('cus_inv_obj', 'past_due');
  });

  // ─── Branch coverage: release purchase edge cases ───
  describe('release purchase — missing fields and fallbacks', () => {
    it('extracts paymentIntentId from object form', async () => {
      const session = {
        id: 'cs_piobj',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: '707f1f77bcf86cd799439015',
          userId: '707f1f77bcf86cd799439016',
        },
        payment_intent: { id: 'pi_obj_001' },
        amount_total: 500,
        currency: 'eur',
        customer_details: { email: 'piobj@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-piobj' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'PI Obj Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockFindByPaymentIntentId).toHaveBeenCalledWith('pi_obj_001');
    });

    it('returns early when releaseId is missing from metadata', async () => {
      const session = {
        id: 'cs_no_rid',
        mode: 'payment',
        metadata: { type: 'release_purchase', userId: 'u-no-rid' },
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
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
    });

    it('defaults amount_total to 0 when null', async () => {
      const session = {
        id: 'cs_null_amt',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: '807f1f77bcf86cd799439017',
          userId: '807f1f77bcf86cd799439018',
        },
        payment_intent: 'pi_amt',
        amount_total: null,
        currency: 'usd',
        customer_details: { email: 'amt@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-amt' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Amt Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith(expect.objectContaining({ amountPaid: 0 }));
    });

    it('defaults currency to "usd" when null', async () => {
      const session = {
        id: 'cs_null_cur',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: '907f1f77bcf86cd799439019',
          userId: '907f1f77bcf86cd79943901a',
        },
        payment_intent: 'pi_cur',
        amount_total: 200,
        currency: null,
        customer_details: { email: 'cur@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-cur' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Cur Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'usd' }));
    });

    it('uses "Unknown Release" when release is not found in DB', async () => {
      const session = {
        id: 'cs_no_rel',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'a07f1f77bcf86cd79943901b',
          userId: 'a07f1f77bcf86cd79943901c',
        },
        payment_intent: 'pi_gone',
        amount_total: 100,
        currency: 'usd',
        customer_details: { email: 'gone@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-gone' });
      mockPrismaReleaseFindFirst.mockResolvedValue(null);
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ releaseTitle: 'Unknown Release' })
      );
    });

    it('falls back to user email from database when Stripe session has no customer email', async () => {
      const session = {
        id: 'cs_no_email',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'b07f1f77bcf86cd79943901d',
          userId: 'b07f1f77bcf86cd79943901e',
        },
        payment_intent: 'pi_noem',
        amount_total: 100,
        currency: 'usd',
        customer_details: { email: null },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-noem' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'No Email Release' });
      mockPrismaUserFindUnique.mockResolvedValue('user-from-db@example.com');
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalled();
      expect(mockPrismaUserFindUnique).toHaveBeenCalledWith('b07f1f77bcf86cd79943901e');
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: 'user-from-db@example.com' })
      );
    });

    it('logs error when no email is available from any source', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        id: 'cs_no_email_anywhere',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'c07f1f77bcf86cd79943901f',
          userId: 'c07f1f77bcf86cd799439020',
        },
        payment_intent: 'pi_noem2',
        amount_total: 100,
        currency: 'usd',
        customer_details: { email: null },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-noem2' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'No Email Release 2' });
      mockPrismaUserFindUnique.mockResolvedValue(null);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'release_purchase webhook: no email available for confirmation',
        expect.objectContaining({ purchaseId: 'p-noem2', userId: 'c07f1f77bcf86cd799439020' })
      );
      vi.mocked(console.error).mockRestore();
    });

    it('falls back to customer_email for purchase when customer_details.email is null', async () => {
      const session = {
        id: 'cs_fb_buy',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'd07f1f77bcf86cd799439021',
          userId: 'd07f1f77bcf86cd799439022',
        },
        payment_intent: 'pi_fb',
        amount_total: 100,
        currency: 'usd',
        customer_details: { email: null },
        customer_email: 'fallback-buyer@example.com',
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-fb' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Fallback Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: 'fallback-buyer@example.com' })
      );
    });

    it('resolves userId from customer email when userId is missing from metadata', async () => {
      const session = {
        id: 'cs_no_uid',
        mode: 'payment',
        metadata: { type: 'release_purchase', releaseId: 'e07f1f77bcf86cd799439023' },
        payment_intent: 'pi_nouid',
        amount_total: 700,
        currency: 'usd',
        customer_details: { email: 'resolved@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue({ id: 'u-resolved' });
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'p-nouid' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Resolved Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockFindUserByEmail).toHaveBeenCalledWith('resolved@example.com');
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-resolved', releaseId: 'e07f1f77bcf86cd799439023' })
      );
    });

    it('creates a new user when email exists but no user is found, then creates purchase', async () => {
      const session = {
        id: 'cs_new_user',
        mode: 'payment',
        metadata: { type: 'release_purchase', releaseId: 'f07f1f77bcf86cd799439024' },
        payment_intent: 'pi_newuser',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'newguest@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue(null);
      mockPrismaUserCreate.mockResolvedValue({ id: 'u-new', created: true });
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'New Release' });
      mockPurchaseCreate.mockResolvedValue({ id: 'p-new' });

      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPrismaUserCreate).toHaveBeenCalledWith('newguest@example.com');
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-new', releaseId: 'f07f1f77bcf86cd799439024' })
      );
    });

    it('uses the user returned by UserService.createGuestPurchaser (race recovery handled in service)', async () => {
      const session = {
        id: 'cs_race',
        mode: 'payment',
        metadata: { type: 'release_purchase', releaseId: 'a17f1f77bcf86cd799439025' },
        payment_intent: 'pi_race',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'race@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue(null);
      // Service handles the P2002 race internally and returns the existing user.
      mockPrismaUserCreate.mockResolvedValue({ id: 'u-raced', created: false });
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Race Release' });
      mockPurchaseCreate.mockResolvedValue({ id: 'p-race' });

      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-raced', releaseId: 'a17f1f77bcf86cd799439025' })
      );
    });

    it('propagates non-P2002 errors from guest-user creation and returns 500', async () => {
      const session = {
        id: 'cs_dberr',
        mode: 'payment',
        metadata: { type: 'release_purchase', releaseId: 'b17f1f77bcf86cd799439026' },
        payment_intent: 'pi_dberr',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'dberr@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindUserByEmail.mockResolvedValue(null);
      mockPrismaUserCreate.mockRejectedValue(new Error('Unexpected DB error'));

      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(500);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
    });

    it('returns early when no email is available and userId cannot be resolved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        id: 'cs_no_email',
        mode: 'payment',
        metadata: { type: 'release_purchase', releaseId: 'c17f1f77bcf86cd799439027' },
        payment_intent: 'pi_noemail',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: null },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      const request = createRequest('{}');
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      vi.mocked(console.error).mockRestore();
    });

    it('recovers from P2002 race on purchase creation when target is stripePaymentIntentId', async () => {
      const session = {
        id: 'cs_pi_race',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'd17f1f77bcf86cd799439028',
          userId: 'd17f1f77bcf86cd799439029',
        },
        payment_intent: 'pi_pi_race',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'pirace@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      // Initial lookup finds nothing; create races and throws P2002 on stripePaymentIntentId
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
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Race PI Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(true);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockFindByPaymentIntentId).toHaveBeenCalledTimes(2);
      expect(mockSendPurchaseConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseId: 'p-pi-raced' })
      );
    });

    it('returns 500 when P2002 on stripePaymentIntentId but re-fetch finds no purchase', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        id: 'cs_pi_race_miss',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'e17f1f77bcf86cd79943902a',
          userId: 'e17f1f77bcf86cd79943902b',
        },
        payment_intent: 'pi_pi_race_miss',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'piracemiss@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      // Both lookups find nothing
      mockFindByPaymentIntentId.mockResolvedValue(null);
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

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(500);
      vi.mocked(console.error).mockRestore();
    });

    it('returns 500 when P2002 is for a constraint other than stripePaymentIntentId', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        id: 'cs_p2002_other',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'f17f1f77bcf86cd79943902c',
          userId: 'f17f1f77bcf86cd79943902d',
        },
        payment_intent: 'pi_p2002_other',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'p2002other@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);
      mockFindByPaymentIntentId.mockResolvedValue(null);
      // P2002 on a different constraint (userId + releaseId compound unique)
      mockPurchaseCreate.mockRejectedValue(
        new MockPrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`userId`, `releaseId`)',
          {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['userId', 'releaseId'] },
          }
        )
      );

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(500);
      vi.mocked(console.error).mockRestore();
    });

    // ─── Security: Zod webhook metadata validation ───

    it('should skip purchase when releaseId has invalid format', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        id: 'cs_bad_rid',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: 'invalid!',
          userId: '507f1f77bcf86cd799439012',
        },
        payment_intent: 'pi_bad_rid',
        amount_total: 1000,
        currency: 'usd',
        customer_details: { email: 'bad-rid@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'release_purchase webhook has invalid metadata',
        expect.objectContaining({ sessionId: 'cs_bad_rid' })
      );
      vi.mocked(console.error).mockRestore();
    });

    it('should skip purchase when userId has invalid format', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = {
        id: 'cs_bad_uid',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: '507f1f77bcf86cd799439011',
          userId: 'not-hex',
        },
        payment_intent: 'pi_bad_uid',
        amount_total: 1000,
        currency: 'usd',
        customer_details: { email: 'bad-uid@example.com' },
        customer_email: null,
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(session);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'release_purchase webhook has invalid metadata',
        expect.objectContaining({ sessionId: 'cs_bad_uid' })
      );
      vi.mocked(console.error).mockRestore();
    });

    it('should skip purchase when type is missing from metadata', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      // The event session must have type: 'release_purchase' so the handler
      // routes into handleReleasePurchaseCompleted. The *retrieved* session
      // has metadata without `type`, causing Zod validation to fail.
      const eventSession = {
        id: 'cs_no_type',
        mode: 'payment',
        metadata: {
          type: 'release_purchase',
          releaseId: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
        },
        payment_intent: 'pi_no_type',
        amount_total: 1000,
        currency: 'usd',
        customer_details: { email: 'no-type@example.com' },
        customer_email: null,
      };
      const retrievedSession = {
        ...eventSession,
        metadata: {
          releaseId: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
        },
      };
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: eventSession },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue(retrievedSession);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'release_purchase webhook has invalid metadata',
        expect.objectContaining({ sessionId: 'cs_no_type' })
      );
      vi.mocked(console.error).mockRestore();
    });
  });

  // ─── Branch coverage: leading-zero IP octet is rejected by ipToNum ───
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

  // ─── Branch coverage: no IP headers at all ───
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

  // ─── Branch coverage: recurring is null on subscription item ───
  it('defaults interval to "month" when recurring is null on subscription.updated', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_null_rec',
          status: 'active',
          customer: 'cus_null_rec',
          items: {
            data: [
              {
                price: { id: 'price_extra', recurring: null },
                current_period_end: 1713398400,
              },
            ],
          },
        },
      },
    });
    mockUpdateSubscription.mockResolvedValue({});
    mockFindByStripeCustomerId.mockResolvedValue({
      email: 'nullrec@example.com',
      subscriptionTier: 'minimum',
    });
    const request = createRequest('{}');
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockSendConfirmationEmail).toHaveBeenCalledWith('nullrec@example.com', 'extra', 'month');
  });

  // ─── Branch coverage: unset STRIPE_WEBHOOK_IP_RANGES ───
  it('skips IP block when STRIPE_WEBHOOK_IP_RANGES is undefined', async () => {
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', '');
    delete process.env.STRIPE_WEBHOOK_IP_RANGES;
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const request = createRequest('{}');
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  // ─── Branch coverage: sendPurchaseConfirmationEmail returns false ───
  describe('checkout.session.completed — email send failure', () => {
    beforeEach(() => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_pay_email_fail',
            mode: 'payment',
            metadata: {
              type: 'release_purchase',
              releaseId: '507f1f77bcf86cd799439011',
              userId: '507f1f77bcf86cd799439012',
            },
            payment_intent: 'pi_email_fail',
            amount_total: 500,
            currency: 'usd',
            customer_details: { email: 'buyer@example.com' },
            customer_email: null,
          },
        },
      });
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: 'cs_pay_email_fail',
        metadata: {
          type: 'release_purchase',
          releaseId: '507f1f77bcf86cd799439011',
          userId: '507f1f77bcf86cd799439012',
        },
        payment_intent: 'pi_email_fail',
        amount_total: 500,
        currency: 'usd',
        customer_details: { email: 'buyer@example.com' },
        customer_email: null,
      });
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockFindByUserAndRelease.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({ id: 'purchase-email-fail' });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Email Fail Release' });
      mockPrismaUserFindUnique.mockResolvedValue({
        id: '507f1f77bcf86cd799439012',
        email: 'buyer@example.com',
      });
    });

    it('logs warning when sendPurchaseConfirmationEmail returns false', async () => {
      mockSendPurchaseConfirmationEmail.mockResolvedValue(false);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledWith(
        'release_purchase webhook: sendPurchaseConfirmationEmail returned false',
        expect.objectContaining({ purchaseId: 'purchase-email-fail' })
      );
      consoleSpy.mockRestore();
    });
  });

  // ─── Branch coverage: charge.refunded event ───
  describe('charge.refunded', () => {
    it('marks purchase as refunded when payment_intent is a string', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refund_1',
            payment_intent: 'pi_refund_123',
          },
        },
      });
      mockMarkRefunded.mockResolvedValue(true);
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockMarkRefunded).toHaveBeenCalledWith('pi_refund_123');
      expect(consoleSpy).toHaveBeenCalledWith(
        'charge.refunded: purchase marked as refunded',
        expect.objectContaining({ paymentIntentId: 'pi_refund_123' })
      );
      consoleSpy.mockRestore();
    });

    it('logs warning when no matching un-refunded purchase is found', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refund_2',
            payment_intent: 'pi_no_match',
          },
        },
      });
      mockMarkRefunded.mockResolvedValue(false);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledWith(
        'charge.refunded: no matching un-refunded purchase found',
        expect.objectContaining({ paymentIntentId: 'pi_no_match' })
      );
      consoleSpy.mockRestore();
    });

    it('extracts payment_intent ID from object form', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refund_obj',
            payment_intent: { id: 'pi_obj_form' },
          },
        },
      });
      mockMarkRefunded.mockResolvedValue(true);
      vi.spyOn(console, 'info').mockImplementation(() => {});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockMarkRefunded).toHaveBeenCalledWith('pi_obj_form');
      vi.mocked(console.info).mockRestore();
    });

    it('logs error when payment_intent is missing from charge', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_no_pi',
            payment_intent: null,
          },
        },
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockMarkRefunded).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'charge.refunded missing payment_intent',
        expect.objectContaining({ chargeId: 'ch_no_pi' })
      );
      consoleSpy.mockRestore();
    });
  });
});
