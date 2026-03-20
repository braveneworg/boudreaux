/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import SubscribeSuccessPage from './page';

vi.mock('server-only', () => ({}));

const mockSessionsRetrieve = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockSessionsRetrieve(...args),
      },
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
    },
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

vi.mock('@/lib/subscriber-rates', () => ({
  getTierByPriceId: (priceId: string) => {
    const map: Record<string, string> = {
      price_minimum: 'minimum',
      price_extra: 'extra',
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

describe('SubscribeSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should show missing session message when no session_id is provided', async () => {
    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Subscribe' })).toBeInTheDocument();
    expect(
      screen.getByText('It looks like you arrived here without completing checkout.')
    ).toBeInTheDocument();
  });

  it('should show success page when payment is paid', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer_details: { email: 'subscriber@example.com' },
      subscription: 'sub_test_123',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_123',
      items: {
        data: [{ price: { id: 'price_minimum', recurring: { interval: 'month' } } }],
      },
    });
    mockSesSend.mockResolvedValue({});
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(screen.getByText(/Thank you for subscribing/)).toBeInTheDocument();
    expect(
      screen.getByText(/A confirmation email has been sent to subscriber@example.com/)
    ).toBeInTheDocument();
  });

  it('should show success without confirmation email note when no customer email', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer_details: { email: null },
      subscription: null,
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(screen.queryByText(/A confirmation email has been sent/)).not.toBeInTheDocument();
  });

  it('should show processing message when payment status is not paid', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'unpaid',
      customer_details: null,
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(
      screen.getByRole('heading', { name: 'Processing Your Subscription' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Your payment is being processed/)).toBeInTheDocument();
  });

  it('should show error message when stripe retrieval throws', async () => {
    mockSessionsRetrieve.mockRejectedValue(new Error('No such session'));

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_invalid' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeInTheDocument();
    expect(screen.getByText(/We could not verify your subscription/)).toBeInTheDocument();
  });

  it('should not send email when EMAIL_FROM is not configured', async () => {
    vi.stubEnv('EMAIL_FROM', '');
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer_details: { email: 'subscriber@example.com' },
      subscription: 'sub_test_123',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_123',
      items: {
        data: [{ price: { id: 'price_minimum', recurring: { interval: 'month' } } }],
      },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it('should still render success even if email sending fails', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer_details: { email: 'subscriber@example.com' },
      subscription: 'sub_test_123',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_123',
      items: {
        data: [{ price: { id: 'price_minimum', recurring: { interval: 'month' } } }],
      },
    });
    mockSesSend.mockRejectedValue(new Error('SES unavailable'));

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
  });

  it('should handle subscription as an object (not string)', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer_details: { email: 'subscriber@example.com' },
      subscription: { id: 'sub_test_456' },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_456',
      items: {
        data: [{ price: { id: 'price_extra', recurring: { interval: 'year' } } }],
      },
    });
    mockSesSend.mockResolvedValue({});

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test_456');
  });

  it('should handle no subscription (one-time payment)', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer_details: { email: 'subscriber@example.com' },
      subscription: null,
    });
    mockSesSend.mockResolvedValue({});

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    // Should still send email with default tier/amount labels
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});
