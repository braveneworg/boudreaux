/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CheckoutForm } from './checkout-form';

const mockUseCheckout = vi.fn();
const mockConfirm = vi.fn();
const mockVerifyTurnstile = vi.fn();

vi.mock('@stripe/react-stripe-js/checkout', () => ({
  useCheckout: () => mockUseCheckout(),
  PaymentElement: () => <div data-testid="payment-element" />,
}));

vi.mock('@/app/components/ui/turnstile-widget', () => ({
  default: ({
    setIsVerified,
    onToken,
  }: {
    isVerified: boolean;
    setIsVerified: (v: boolean) => void;
    onToken?: (t: string) => void;
  }) => (
    <button
      data-testid="verify-turnstile"
      onClick={() => {
        setIsVerified(true);
        onToken?.('mock-turnstile-token');
      }}
    >
      Verify
    </button>
  ),
}));

vi.mock('@/lib/utils/verify-turnstile', () => ({
  verifyTurnstile: (...args: unknown[]) => mockVerifyTurnstile(...args),
}));

const createCheckoutSuccess = (overrides = {}) => ({
  type: 'success' as const,
  checkout: {
    canConfirm: true,
    lineItems: [
      {
        id: 'li_test',
        name: 'Fake Four Inc. Subscription',
        unitAmount: { amount: '$14.44', minorUnitsAmount: 1444 },
        total: { amount: '$14.44', minorUnitsAmount: 1444 },
        recurring: {
          interval: 'month',
          intervalCount: 1,
          isProrated: false,
          usageType: 'licensed',
        },
      },
    ],
    total: {
      total: { amount: '$14.44', minorUnitsAmount: 1444 },
    },
    recurring: {
      interval: 'month',
      intervalCount: 1,
    },
    confirm: mockConfirm,
    ...overrides,
  },
});

describe('CheckoutForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should render a loading spinner when checkout is loading', () => {
      mockUseCheckout.mockReturnValue({ type: 'loading' });

      render(<CheckoutForm />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display the error message when checkout initialization fails', () => {
      mockUseCheckout.mockReturnValue({
        type: 'error',
        error: { message: 'Failed to load checkout' },
      });

      render(<CheckoutForm />);

      expect(screen.getByText('Failed to load checkout')).toBeInTheDocument();
    });
  });

  describe('success state', () => {
    it('should render the PaymentElement', () => {
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      expect(screen.getByTestId('payment-element')).toBeInTheDocument();
    });

    it('should render the Turnstile widget', () => {
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      expect(screen.getByTestId('verify-turnstile')).toBeInTheDocument();
    });

    it('should display the line item name and price', () => {
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      expect(screen.getByText('Fake Four Inc. Subscription')).toBeInTheDocument();
      expect(screen.getByText('$14.44/month')).toBeInTheDocument();
    });

    it('should display the subscribe button with total', () => {
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      expect(
        screen.getByRole('button', { name: /Subscribe — \$14\.44\/month/i })
      ).toBeInTheDocument();
    });

    it('should disable the subscribe button when Turnstile is not yet verified', () => {
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      expect(screen.getByRole('button', { name: /Subscribe/i })).toBeDisabled();
    });

    it('should enable the subscribe button after Turnstile verification', async () => {
      const user = userEvent.setup();
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));

      expect(screen.getByRole('button', { name: /Subscribe/i })).toBeEnabled();
    });

    it('should disable the button when canConfirm is false even after Turnstile verification', async () => {
      const user = userEvent.setup();
      mockUseCheckout.mockReturnValue(createCheckoutSuccess({ canConfirm: false }));

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));

      expect(screen.getByRole('button', { name: /Subscribe/i })).toBeDisabled();
    });

    it('should verify Turnstile token server-side before confirming payment', async () => {
      const user = userEvent.setup();
      mockVerifyTurnstile.mockResolvedValue({ success: true });
      mockConfirm.mockImplementation(() => new Promise(() => {}));
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));
      await user.click(screen.getByRole('button', { name: /Subscribe/i }));

      expect(mockVerifyTurnstile).toHaveBeenCalledWith('mock-turnstile-token');
    });

    it('should call confirm and show processing state after Turnstile verification', async () => {
      const user = userEvent.setup();
      mockVerifyTurnstile.mockResolvedValue({ success: true });
      mockConfirm.mockImplementation(
        () => new Promise(() => {}) // never resolves — stays in processing state
      );
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));
      await user.click(screen.getByRole('button', { name: /Subscribe/i }));

      expect(mockConfirm).toHaveBeenCalledWith({ redirect: 'if_required' });
      expect(screen.getByRole('button', { name: /Processing/i })).toBeDisabled();
    });

    it('should show an error and reset verification when Turnstile server verification fails', async () => {
      const user = userEvent.setup();
      mockVerifyTurnstile.mockResolvedValue({
        success: false,
        error: 'Invalid verification. Please try again.',
      });
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));
      await user.click(screen.getByRole('button', { name: /Subscribe/i }));

      expect(screen.getByText('Invalid verification. Please try again.')).toBeInTheDocument();
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Subscribe/i })).toBeDisabled();
    });

    it('should display an error message when confirm fails', async () => {
      const user = userEvent.setup();
      mockVerifyTurnstile.mockResolvedValue({ success: true });
      mockConfirm.mockResolvedValue({
        type: 'error',
        error: { message: 'Your card was declined.', code: 'paymentFailed' },
      });
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));
      await user.click(screen.getByRole('button', { name: /Subscribe/i }));

      expect(screen.getByText('Your card was declined.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Subscribe/i })).toBeEnabled();
    });

    it('should call confirm on successful submission', async () => {
      const user = userEvent.setup();
      mockVerifyTurnstile.mockResolvedValue({ success: true });
      mockConfirm.mockResolvedValue({
        type: 'success',
        session: { id: 'cs_test_success_123' },
      });
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));
      await user.click(screen.getByRole('button', { name: /Subscribe/i }));

      expect(mockConfirm).toHaveBeenCalledWith({ redirect: 'if_required' });
      expect(screen.queryByText(/declined|failed|error/i)).not.toBeInTheDocument();
    });

    it('should not render line item section when no line items exist', () => {
      mockUseCheckout.mockReturnValue(createCheckoutSuccess({ lineItems: [] }));

      render(<CheckoutForm />);

      expect(screen.queryByText('Fake Four Inc. Subscription')).not.toBeInTheDocument();
      expect(screen.getByTestId('payment-element')).toBeInTheDocument();
    });

    it('should show default error message when turnstile error is undefined', async () => {
      const user = userEvent.setup();
      mockVerifyTurnstile.mockResolvedValue({ success: false });
      mockUseCheckout.mockReturnValue(createCheckoutSuccess());

      render(<CheckoutForm />);

      await user.click(screen.getByTestId('verify-turnstile'));
      await user.click(screen.getByRole('button', { name: /Subscribe/i }));

      expect(screen.getByText('Bot verification failed. Please try again.')).toBeInTheDocument();
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('should fall back to checkout.recurring when lineItem has no recurring', () => {
      mockUseCheckout.mockReturnValue(
        createCheckoutSuccess({
          lineItems: [
            {
              id: 'li_test',
              name: 'Yearly Plan',
              unitAmount: { amount: '$99.00', minorUnitsAmount: 9900 },
              total: { amount: '$99.00', minorUnitsAmount: 9900 },
              recurring: null,
            },
          ],
          recurring: { interval: 'year', intervalCount: 1 },
        })
      );

      render(<CheckoutForm />);

      expect(screen.getByText('$99.00/year')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Subscribe — \$14\.44\/year/i })
      ).toBeInTheDocument();
    });

    it('should fall back to "month" in subscribe button when recurring is nullish', () => {
      mockUseCheckout.mockReturnValue(
        createCheckoutSuccess({
          lineItems: [
            {
              id: 'li_test',
              name: 'One-time Plan',
              unitAmount: { amount: '$5.00', minorUnitsAmount: 500 },
              total: { amount: '$5.00', minorUnitsAmount: 500 },
              recurring: null,
            },
          ],
          recurring: null,
        })
      );

      render(<CheckoutForm />);

      expect(
        screen.getByRole('button', { name: /Subscribe — \$14\.44\/month/i })
      ).toBeInTheDocument();
    });
  });
});
