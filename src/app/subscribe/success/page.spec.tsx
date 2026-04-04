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

  it('should handle paid session with no subscription field', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: 'nosub@example.com' },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_nosub' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockSendConfirmationEmail).toHaveBeenCalledWith('nosub@example.com', null, 'month');
    expect(mockLinkStripeCustomer).toHaveBeenCalledWith('nosub@example.com', 'cus_test_123');
  });

  it('should handle subscription as object with id property', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: 'objsub@example.com' },
      subscription: { id: 'sub_obj_456' },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [{ price: { id: 'price_minimum', recurring: { interval: 'year' } } }],
      },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_objsub' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_obj_456');
  });

  it('should handle subscription with empty items array', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      customer: 'cus_test_123',
      customer_details: { email: 'empty@example.com' },
      subscription: 'sub_test_empty',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [] },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_empty' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockSendConfirmationEmail).toHaveBeenCalledWith('empty@example.com', null, 'month');
  });

  it('should handle customer as object with id property', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      customer: { id: 'cus_obj_789' },
      customer_details: { email: 'objcus@example.com' },
      subscription: 'sub_test_objcus',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [{ price: { id: 'price_minimum', recurring: { interval: 'month' } } }],
      },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_objcus' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockLinkStripeCustomer).toHaveBeenCalledWith('objcus@example.com', 'cus_obj_789');
  });

  it('should mask email unchanged when email has no @ sign', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      customer: null,
      customer_details: { email: 'noatsign' },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_noat' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    // maskEmail returns the email unchanged when there's no '@' (atIndex <= 0)
    expect(screen.getByText(/A confirmation email will be sent to noatsign/)).toBeInTheDocument();
  });

  it('should handle sendConfirmationEmailFromSession when inner email check is null', async () => {
    let emailAccessCount = 0;
    const sessionData = {
      payment_status: 'paid',
      customer: null,
      customer_details: {
        get email() {
          emailAccessCount++;
          // First access (outer check) returns a truthy email
          // Second access (inner sendConfirmationEmailFromSession) returns null
          return emailAccessCount === 1 ? 'trick@example.com' : null;
        },
      },
      subscription: null,
    };
    mockSessionsRetrieve.mockResolvedValue(sessionData);

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_trick' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    // The inner guard in sendConfirmationEmailFromSession should return early
    expect(mockSendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('should skip linkStripeCustomer when customer is null', async () => {
    mockSessionsRetrieve.mockResolvedValue({
      payment_status: 'paid',
      customer: null,
      customer_details: { email: 'nullcus@example.com' },
      subscription: 'sub_test_nullcus',
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [{ price: { id: 'price_minimum', recurring: { interval: 'month' } } }],
      },
    });

    const page = await SubscribeSuccessPage({
      searchParams: Promise.resolve({ session_id: 'cs_test_nullcus' }),
    });

    render(page);

    expect(screen.getByRole('heading', { name: 'Welcome to the Family!' })).toBeInTheDocument();
    expect(mockLinkStripeCustomer).not.toHaveBeenCalled();
    expect(mockSendConfirmationEmail).toHaveBeenCalledWith(
      'nullcus@example.com',
      'minimum',
      'month'
    );
  });
});
