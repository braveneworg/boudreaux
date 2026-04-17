/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { lambdaHandler } from './handler.js';
import { initSecrets } from './lib/secrets.js';

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('ipaddr.js', () => ({
  default: {
    isValid: (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':'),
    parse: (ip: string) => ({
      kind: () => (ip.includes(':') ? 'ipv6' : 'ipv4'),
      toNormalizedString: () => ip,
      match: () => false,
    }),
    parseCIDR: () => {
      throw new Error('Not implemented in mock');
    },
  },
  isValid: (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':'),
  parse: (ip: string) => ({
    kind: () => (ip.includes(':') ? 'ipv6' : 'ipv4'),
    toNormalizedString: () => ip,
    match: () => false,
  }),
  parseCIDR: () => {
    throw new Error('Not implemented in mock');
  },
}));

const mockConstructEvent = vi.fn();

vi.mock('./lib/secrets.js', () => ({
  initSecrets: vi.fn().mockResolvedValue({
    stripeSecretKey: 'sk_test_fake',
    stripeWebhookSecret: 'whsec_test',
    databaseUrl: 'mongodb://localhost:27017/test',
  }),
  getSecrets: vi.fn().mockReturnValue({
    stripeSecretKey: 'sk_test_fake',
    stripeWebhookSecret: 'whsec_test',
    databaseUrl: 'mongodb://localhost:27017/test',
  }),
}));

vi.mock('./lib/stripe.js', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  }),
}));

const mockHandleCheckoutSessionCompleted = vi.fn();
const mockHandleSubscriptionUpdated = vi.fn();
const mockHandleSubscriptionDeleted = vi.fn();
const mockHandleInvoicePaymentFailed = vi.fn();
const mockHandleChargeRefunded = vi.fn();

vi.mock('./handlers/checkout-session-completed.js', () => ({
  handleCheckoutSessionCompleted: (...args: unknown[]) =>
    mockHandleCheckoutSessionCompleted(...args),
}));
vi.mock('./handlers/subscription-updated.js', () => ({
  handleSubscriptionUpdated: (...args: unknown[]) => mockHandleSubscriptionUpdated(...args),
}));
vi.mock('./handlers/subscription-deleted.js', () => ({
  handleSubscriptionDeleted: (...args: unknown[]) => mockHandleSubscriptionDeleted(...args),
}));
vi.mock('./handlers/invoice-payment-failed.js', () => ({
  handleInvoicePaymentFailed: (...args: unknown[]) => mockHandleInvoicePaymentFailed(...args),
}));
vi.mock('./handlers/charge-refunded.js', () => ({
  handleChargeRefunded: (...args: unknown[]) => mockHandleChargeRefunded(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_IP = '3.18.12.63';
const DISALLOWED_IP = '1.2.3.4';
const FAKE_SIG = 'v1=abc123';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /webhooks/stripe',
    rawPath: '/webhooks/stripe',
    rawQueryString: '',
    headers: {
      'stripe-signature': FAKE_SIG,
      ...overrides.headers,
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/webhooks/stripe',
        protocol: 'HTTP/1.1',
        sourceIp: ALLOWED_IP,
        userAgent: 'Stripe',
        ...overrides.requestContext?.http,
      },
      requestId: 'req-id',
      routeKey: 'POST /webhooks/stripe',
      stage: 'production',
      time: '12/Mar/2025:19:03:58 +0000',
      timeEpoch: 1741806238000,
    },
    body: JSON.stringify({ type: 'checkout.session.completed' }),
    isBase64Encoded: false,
    ...overrides,
  }) as APIGatewayProxyEventV2;

const mockStripeEvent = (type = 'checkout.session.completed') =>
  ({
    id: 'evt_test',
    type,
    data: { object: {} },
  }) as unknown as Stripe.Event;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lambdaHandler', () => {
  beforeEach(() => {
    process.env.SKIP_STRIPE_IP_CHECK = 'true';
    mockConstructEvent.mockReturnValue(mockStripeEvent());
    mockHandleCheckoutSessionCompleted.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.SKIP_STRIPE_IP_CHECK;
    delete process.env.STRIPE_WEBHOOK_IP_RANGES;
  });

  // ── Signature validation ─────────────────────────────────────────────────

  it('returns 400 when stripe-signature header is missing', async () => {
    const initSecretsMock = vi.mocked(initSecrets);
    const event = makeEvent({ headers: {} });
    const result = await lambdaHandler(event);
    expect(result).toEqual({ statusCode: 400, body: 'Missing stripe-signature header' });
    expect(initSecretsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when constructEvent throws (bad signature)', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    const event = makeEvent();
    const result = await lambdaHandler(event);
    expect(result).toEqual({ statusCode: 400, body: 'Webhook signature verification failed' });
  });

  // ── base64-encoded body ──────────────────────────────────────────────────

  it('decodes base64 body before passing to constructEvent', async () => {
    const rawPayload = '{"type":"checkout.session.completed"}';
    const encoded = Buffer.from(rawPayload).toString('base64');
    const event = makeEvent({ body: encoded, isBase64Encoded: true });

    mockConstructEvent.mockReturnValue(mockStripeEvent());
    await lambdaHandler(event);

    const [passedBody] = mockConstructEvent.mock.calls[0] as [Buffer, string, string];
    expect(Buffer.isBuffer(passedBody)).toBe(true);
    expect(passedBody.toString()).toBe(rawPayload);
  });

  it('passes raw string body when isBase64Encoded is false', async () => {
    const rawPayload = '{"type":"checkout.session.completed"}';
    const event = makeEvent({ body: rawPayload, isBase64Encoded: false });

    mockConstructEvent.mockReturnValue(mockStripeEvent());
    await lambdaHandler(event);

    const [passedBody] = mockConstructEvent.mock.calls[0] as [string, string, string];
    expect(typeof passedBody).toBe('string');
    expect(passedBody).toBe(rawPayload);
  });

  // ── Event dispatch ───────────────────────────────────────────────────────

  it('dispatches checkout.session.completed to the correct handler', async () => {
    mockConstructEvent.mockReturnValue(mockStripeEvent('checkout.session.completed'));
    const result = await lambdaHandler(makeEvent());
    expect(mockHandleCheckoutSessionCompleted).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
  });

  it('dispatches customer.subscription.updated to the correct handler', async () => {
    mockConstructEvent.mockReturnValue(mockStripeEvent('customer.subscription.updated'));
    mockHandleSubscriptionUpdated.mockResolvedValue(undefined);
    const result = await lambdaHandler(makeEvent());
    expect(mockHandleSubscriptionUpdated).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
  });

  it('dispatches customer.subscription.deleted to the correct handler', async () => {
    mockConstructEvent.mockReturnValue(mockStripeEvent('customer.subscription.deleted'));
    mockHandleSubscriptionDeleted.mockResolvedValue(undefined);
    const result = await lambdaHandler(makeEvent());
    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
  });

  it('dispatches invoice.payment_failed to the correct handler', async () => {
    mockConstructEvent.mockReturnValue(mockStripeEvent('invoice.payment_failed'));
    mockHandleInvoicePaymentFailed.mockResolvedValue(undefined);
    const result = await lambdaHandler(makeEvent());
    expect(mockHandleInvoicePaymentFailed).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
  });

  it('dispatches charge.refunded to the correct handler', async () => {
    mockConstructEvent.mockReturnValue(mockStripeEvent('charge.refunded'));
    mockHandleChargeRefunded.mockResolvedValue(undefined);
    const result = await lambdaHandler(makeEvent());
    expect(mockHandleChargeRefunded).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
  });

  it('logs a warning and returns 200 for unknown event types', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConstructEvent.mockReturnValue(mockStripeEvent('unknown.event.type'));
    const result = await lambdaHandler(makeEvent());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled event type'));
    expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('returns 500 when an event handler throws an unexpected error', async () => {
    mockHandleCheckoutSessionCompleted.mockRejectedValue(new Error('DB connection lost'));
    const result = await lambdaHandler(makeEvent());
    expect(result).toEqual({ statusCode: 500, body: 'Internal server error' });
  });

  it('returns 500 when secrets initialization fails', async () => {
    const initSecretsMock = vi.mocked(initSecrets);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    initSecretsMock.mockRejectedValueOnce(new Error('SSM unavailable'));

    const result = await lambdaHandler(makeEvent());

    expect(result).toEqual({ statusCode: 500, body: 'Internal server error' });
    expect(initSecretsMock).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to initialize Stripe webhook secrets:',
      expect.any(Error)
    );
  });

  // ── IP filtering ─────────────────────────────────────────────────────────

  describe('IP filtering (SKIP_STRIPE_IP_CHECK = false)', () => {
    beforeEach(() => {
      process.env.SKIP_STRIPE_IP_CHECK = 'false';
      process.env.STRIPE_WEBHOOK_IP_RANGES = ALLOWED_IP;
    });

    it('returns 403 when source IP is missing', async () => {
      const event = makeEvent();
      (event.requestContext.http as Record<string, unknown>).sourceIp = '';
      const result = await lambdaHandler(event);
      expect(result).toEqual({ statusCode: 403, body: 'Forbidden' });
    });

    it('returns 500 when STRIPE_WEBHOOK_IP_RANGES is empty', async () => {
      process.env.STRIPE_WEBHOOK_IP_RANGES = '';
      const event = makeEvent();
      const result = await lambdaHandler(event);
      expect(result).toEqual({
        statusCode: 500,
        body: 'Stripe webhook IP allowlist is not configured',
      });
    });

    it('returns 403 for a disallowed IP', async () => {
      const event = makeEvent();
      (event.requestContext.http as Record<string, unknown>).sourceIp = DISALLOWED_IP;
      const result = await lambdaHandler(event);
      expect(result).toEqual({ statusCode: 403, body: 'Forbidden' });
    });

    it('proceeds for an allowlisted IP', async () => {
      const event = makeEvent();
      const result = await lambdaHandler(event);
      expect(result).toEqual({ statusCode: 200, body: JSON.stringify({ received: true }) });
    });

    it('returns 403 for an invalid IP format', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const event = makeEvent();
      (event.requestContext.http as Record<string, unknown>).sourceIp = 'not-an-ip';
      const result = await lambdaHandler(event);
      expect(result).toEqual({ statusCode: 403, body: 'Forbidden' });
      warnSpy.mockRestore();
    });

    it('logs warning for invalid CIDR entries and rejects non-matching IP', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.STRIPE_WEBHOOK_IP_RANGES = '192.168.1.0/24';
      const event = makeEvent();
      const result = await lambdaHandler(event);
      // parseCIDR mock throws, so it logs a warning and falls through to reject
      expect(result).toEqual({ statusCode: 403, body: 'Forbidden' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring invalid STRIPE_WEBHOOK_IP_RANGES entry')
      );
      warnSpy.mockRestore();
    });

    it('logs warning for invalid individual IP range entries', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.STRIPE_WEBHOOK_IP_RANGES = 'not-valid-ip';
      const event = makeEvent();
      const result = await lambdaHandler(event);
      expect(result).toEqual({ statusCode: 403, body: 'Forbidden' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring invalid STRIPE_WEBHOOK_IP_RANGES entry')
      );
      warnSpy.mockRestore();
    });
  });
});
