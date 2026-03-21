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

const mockLinkStripeCustomer = vi.fn();
const mockResetConfirmationEmailSent = vi.fn();

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    linkStripeCustomer: (...args: unknown[]) => mockLinkStripeCustomer(...args),
    resetConfirmationEmailSent: (...args: unknown[]) => mockResetConfirmationEmailSent(...args),
  },
}));

vi.mock('@/lib/subscriber-rates', () => ({
  getTierByPriceId: (priceId: string) => {
    const map: Record<string, string> = {
      price_minimum: 'minimum',
    };
    return map[priceId] ?? null;
  },
}));

const mockSendConfirmationEmail = vi.fn();

vi.mock('@/lib/email/send-subscription-confirmation', () => ({
  sendSubscriptionConfirmationEmail: (...args: unknown[]) => mockSendConfirmationEmail(...args),
}));

describe('SubscribeSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkStripeCustomer.mockResolvedValue({});
    mockResetConfirmationEmailSent.mockResolvedValue(undefined);
    mockSendConfirmationEmail.mockResolvedValue(true);
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

  it('should show error when session_id does not start with cs_', async () => {
    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'invalid_abc123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Something Went Wrong' })).toBeInTheDocument();
    expect(screen.getByText(/We could not verify your subscription/)).toBeInTheDocument();
    expect(mockSessionsRetrieve).not.toHaveBeenCalled();
  });

  it('should show success page when payment is paid', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: 'subscriber@example.com' },
      subscription: 'sub_test_123',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: { id: 'price_minimum', recurring: { interval: 'month' } },
          },
        ],
      },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(screen.getByText(/Thank you for subscribing/)).toBeInTheDocument();
    expect(
      screen.getByText(/A confirmation email will be sent to s\*\*\*@example\.com/)
    ).toBeInTheDocument();
  });

  it('should send confirmation email when payment is paid', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: 'subscriber@example.com' },
      subscription: 'sub_test_123',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: { id: 'price_minimum', recurring: { interval: 'month' } },
          },
        ],
      },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(mockLinkStripeCustomer).toHaveBeenCalledWith('subscriber@example.com', 'cus_test_123');
    expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('subscriber@example.com');
    expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
      'subscriber@example.com',
      'minimum',
      'month'
    );
  });

  it('should not send email when customer email is null', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: null },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(screen.queryByText(/A confirmation email will be sent/)).not.toBeInTheDocument();
    expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('should still render success page when email sending fails', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: 'subscriber@example.com' },
      subscription: 'sub_test_123',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: { id: 'price_minimum', recurring: { interval: 'month' } },
          },
        ],
      },
    });
    mockSendConfirmationEmail.mockRejectedValue(new Error('SES failure'));

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
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
    expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
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
});
