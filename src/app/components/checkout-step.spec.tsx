/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';

import { Dialog } from '@/app/components/ui/dialog';

import { CheckoutStep } from './checkout-step';

const mockCreateCheckoutSessionAction = vi.fn();

vi.mock('@/lib/actions/create-checkout-session-action', () => ({
  createCheckoutSessionAction: (...args: unknown[]) => mockCreateCheckoutSessionAction(...args),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutFormProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="checkout-provider">{children}</div>
  ),
}));

vi.mock('@/app/components/checkout-form', () => ({
  CheckoutForm: () => <div data-testid="checkout-form" />,
}));

const renderInDialog = (ui: React.ReactElement) => render(<Dialog open>{ui}</Dialog>);

describe('CheckoutStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show a loading spinner while the session is being created', () => {
    mockCreateCheckoutSessionAction.mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    renderInDialog(<CheckoutStep tier="minimum" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Complete your subscription')).toBeInTheDocument();
  });

  it('should render the CheckoutForm once a client secret is returned', async () => {
    mockCreateCheckoutSessionAction.mockResolvedValue({
      clientSecret: 'cs_test_secret_abc123',
    });

    renderInDialog(<CheckoutStep tier="minimum" />);

    await waitFor(() => {
      expect(screen.getByTestId('checkout-provider')).toBeInTheDocument();
      expect(screen.getByTestId('checkout-form')).toBeInTheDocument();
    });
  });

  it('should show an error when the action returns an error string', async () => {
    mockCreateCheckoutSessionAction.mockResolvedValue({
      clientSecret: null,
      error: 'Missing Stripe Price ID for tier: minimum',
    });

    renderInDialog(<CheckoutStep tier="minimum" />);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Missing Stripe Price ID for tier: minimum')).toBeInTheDocument();
    });
  });

  it('should show an error when the action returns no client secret and no error', async () => {
    mockCreateCheckoutSessionAction.mockResolvedValue({ clientSecret: null });

    renderInDialog(<CheckoutStep tier="minimum" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to initialize checkout')).toBeInTheDocument();
    });
  });

  it('should catch and display errors thrown by the action (e.g. missing Stripe config)', async () => {
    mockCreateCheckoutSessionAction.mockRejectedValue(
      new Error('No API key provided. Set your Stripe secret key.')
    );

    renderInDialog(<CheckoutStep tier="minimum" />);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText('No API key provided. Set your Stripe secret key.')
      ).toBeInTheDocument();
    });
  });

  it('should show a generic error when an unknown value is thrown', async () => {
    mockCreateCheckoutSessionAction.mockRejectedValue('unexpected string error');

    renderInDialog(<CheckoutStep tier="minimum" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to initialize checkout')).toBeInTheDocument();
    });
  });

  it('should pass customerEmail to the action', async () => {
    mockCreateCheckoutSessionAction.mockResolvedValue({
      clientSecret: 'cs_test_xyz',
    });

    renderInDialog(<CheckoutStep tier="extra" customerEmail="test@example.com" />);

    await waitFor(() => {
      expect(mockCreateCheckoutSessionAction).toHaveBeenCalledWith('extra', 'test@example.com');
    });
  });

  it('should omit undefined values when no email is provided', async () => {
    mockCreateCheckoutSessionAction.mockResolvedValue({
      clientSecret: 'cs_test_xyz',
    });

    renderInDialog(<CheckoutStep tier="minimum" />);

    await waitFor(() => {
      expect(mockCreateCheckoutSessionAction).toHaveBeenCalledWith('minimum', undefined);
    });
  });

  it('should not update state when component unmounts before action resolves (cancelled success)', async () => {
    expect.assertions(0);
    let resolveAction: (value: unknown) => void;
    mockCreateCheckoutSessionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        })
    );

    const { unmount } = renderInDialog(<CheckoutStep tier="minimum" />);

    // Unmount triggers cancelled = true
    unmount();

    // Resolve after unmount — the cancelled check on line 35 prevents setState
    resolveAction!({ clientSecret: 'cs_test_after_unmount' });
    // No error from setState after unmount
  });

  it('should not update state when component unmounts before action rejects (cancelled error)', async () => {
    expect.assertions(0);
    let rejectAction: (reason: unknown) => void;
    mockCreateCheckoutSessionAction.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectAction = reject;
        })
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderInDialog(<CheckoutStep tier="minimum" />);

    // Unmount triggers cancelled = true
    unmount();

    // Reject after unmount — the cancelled check on line 44 prevents setState
    rejectAction!(new Error('After unmount'));
    consoleSpy.mockRestore();
  });

  it('should pass customerEmail null coalesced to undefined', async () => {
    mockCreateCheckoutSessionAction.mockResolvedValue({
      clientSecret: 'cs_test_xyz',
    });

    renderInDialog(<CheckoutStep tier="minimum" customerEmail={null} />);

    await waitFor(() => {
      // customerEmail ?? undefined should convert null to undefined
      expect(mockCreateCheckoutSessionAction).toHaveBeenCalledWith('minimum', undefined);
    });
  });
});
