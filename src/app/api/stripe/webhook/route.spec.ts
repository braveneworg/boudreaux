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
const mockMarkConfirmationEmailSent = vi.fn();
const mockResetConfirmationEmailSent = vi.fn();
const mockFindByStripeCustomerId = vi.fn();

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    linkStripeCustomer: (...args: unknown[]) => mockLinkStripeCustomer(...args),
    updateSubscription: (...args: unknown[]) => mockUpdateSubscription(...args),
    cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
    updateSubscriptionStatus: (...args: unknown[]) => mockUpdateSubscriptionStatus(...args),
    markConfirmationEmailSent: (...args: unknown[]) => mockMarkConfirmationEmailSent(...args),
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
  TIER_LABELS: {
    minimum: 'Minimum',
    extra: 'Extra',
    extraExtra: 'Extra Extra',
  },
  getSubscriberRate: (tier: string) => {
    const rates: Record<string, number> = {
      minimum: 14.44,
      extra: 24.44,
      extraExtra: 44.44,
    };
    return rates[tier] ?? 0;
  },
}));

const mockSesSend = vi.fn();

vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: (...args: unknown[]) => mockSesSend(...args) },
}));

vi.mock('@/lib/email/subscription-confirmation-email-html', () => ({
  buildSubscriptionConfirmationEmailHtml: () => '<html>confirmation</html>',
}));

vi.mock('@/lib/email/subscription-confirmation-email-text', () => ({
  buildSubscriptionConfirmationEmailText: () => 'confirmation text',
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
    mockMarkConfirmationEmailSent.mockResolvedValue(true);
    mockResetConfirmationEmailSent.mockResolvedValue(undefined);
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
      mockSesSend.mockResolvedValue({});
    });

    it('should link stripe customer and update subscription', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
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

    it('should send confirmation email on checkout.session.completed', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockMarkConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSesSend).toHaveBeenCalledTimes(1);
    });

    it('should not send email when EMAIL_FROM is not configured', async () => {
      vi.stubEnv('EMAIL_FROM', '');
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockMarkConfirmationEmailSent).not.toHaveBeenCalled();
      expect(mockSesSend).not.toHaveBeenCalled();
    });

    it('should not send email when confirmation was already sent', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      mockMarkConfirmationEmailSent.mockResolvedValue(false);
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockMarkConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSesSend).not.toHaveBeenCalled();
    });

    it('should still return 200 even when email sending fails', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      mockSesSend.mockRejectedValue(new Error('SES error'));
      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should reset confirmation email flag when SES send fails so retries can redeliver', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      mockSesSend.mockRejectedValue(new Error('SES error'));
      const request = createRequest('{}');
      await POST(request);

      expect(mockMarkConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
    });

    it('should send email with default tier label when no subscription', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
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
      expect(mockMarkConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSesSend).toHaveBeenCalledTimes(1);
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
      expect(mockSesSend).not.toHaveBeenCalled();
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
      mockSesSend.mockResolvedValue({});
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
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      mockFindByStripeCustomerId.mockResolvedValue({
        email: 'subscriber@example.com',
        subscriptionTier: 'minimum',
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockMarkConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
      expect(mockSesSend).toHaveBeenCalledTimes(1);
    });

    it('should not send confirmation email when tier is unchanged', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      mockFindByStripeCustomerId.mockResolvedValue({
        email: 'subscriber@example.com',
        subscriptionTier: 'extra',
      });

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).not.toHaveBeenCalled();
      expect(mockSesSend).not.toHaveBeenCalled();
    });

    it('should not send confirmation email when subscription is not active', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
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
      expect(mockSesSend).not.toHaveBeenCalled();
    });

    it('should not send confirmation email when user is not found', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
      mockFindByStripeCustomerId.mockResolvedValue(null);

      const request = createRequest('{}');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockResetConfirmationEmailSent).not.toHaveBeenCalled();
      expect(mockSesSend).not.toHaveBeenCalled();
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
});
