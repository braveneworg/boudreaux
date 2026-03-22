/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { POST } from './route';

import type Stripe from 'stripe';

vi.mock('server-only', () => ({}));

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
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

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByPaymentIntentId: (...args: unknown[]) => mockFindByPaymentIntentId(...args),
    create: (...args: unknown[]) => mockPurchaseCreate(...args),
  },
}));

const mockSendPurchaseConfirmationEmail = vi.fn();

vi.mock('@/lib/email/send-purchase-confirmation', () => ({
  sendPurchaseConfirmationEmail: (...args: unknown[]) => mockSendPurchaseConfirmationEmail(...args),
}));

const mockPrismaReleaseFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    release: {
      findFirst: (...args: unknown[]) => mockPrismaReleaseFindFirst(...args),
    },
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
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
    vi.stubEnv('SKIP_STRIPE_IP_CHECK', 'true');
    mockResetConfirmationEmailSent.mockResolvedValue(undefined);
    mockSendConfirmationEmail.mockResolvedValue(true);
    mockFindByStripeCustomerId.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
      metadata: { type: 'release_purchase', releaseId: 'release-001', userId: 'user-001' },
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
      mockFindByPaymentIntentId.mockResolvedValue(null);
      mockPurchaseCreate.mockResolvedValue({
        id: 'purchase-new',
        stripePaymentIntentId: 'pi_test_001',
      });
      mockPrismaReleaseFindFirst.mockResolvedValue({ title: 'Test Release' });
      mockSendPurchaseConfirmationEmail.mockResolvedValue(undefined);
    });

    it('calls PurchaseRepository.create and sendPurchaseConfirmationEmail for a valid purchase', async () => {
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).toHaveBeenCalledWith({
        userId: 'user-001',
        releaseId: 'release-001',
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
        releaseId: 'release-001',
      });
    });

    it('does not call PurchaseRepository.create when paymentIntentId already exists (idempotency)', async () => {
      mockFindByPaymentIntentId.mockResolvedValue({ id: 'purchase-existing' });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockPurchaseCreate).not.toHaveBeenCalled();
      expect(mockSendPurchaseConfirmationEmail).not.toHaveBeenCalled();
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
});
