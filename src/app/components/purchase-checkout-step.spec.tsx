/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PurchaseCheckoutStep } from './purchase-checkout-step';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

const mockCheckoutState = vi.fn();

vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => null,
  useCheckout: () => mockCheckoutState(),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}));

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const mockCreatePurchaseCheckoutSessionAction = vi.fn();

vi.mock('@/lib/actions/create-purchase-checkout-session-action', () => ({
  createPurchaseCheckoutSessionAction: (...args: unknown[]) =>
    mockCreatePurchaseCheckoutSessionAction(...args),
}));

vi.mock('lucide-react', () => ({
  Loader2Icon: () => null,
  CheckCircle2Icon: () => null,
}));

vi.mock('@/app/components/ui/dialog', () => ({
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DefaultProps {
  releaseId: string;
  releaseTitle: string;
  amountCents: number;
  customerEmail: string;
  onConfirmed: () => void;
  onError: (message: string) => void;
}

const buildProps = (overrides: Partial<DefaultProps> = {}): DefaultProps => ({
  releaseId: 'release-123',
  releaseTitle: 'Test Release',
  amountCents: 1000,
  customerEmail: 'buyer@example.com',
  onConfirmed: vi.fn(),
  onError: vi.fn(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PurchaseCheckoutStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: useQuery returns no data so onConfirmed is not triggered
    mockUseQuery.mockReturnValue({ data: undefined });
    // Default: useCheckout in loading state (form not yet ready)
    mockCheckoutState.mockReturnValue({ type: 'loading' });
  });

  it('shows error UI when createPurchaseCheckoutSessionAction returns a failure', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'stripe_error',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(
        screen.getByText('Something went wrong with the payment provider. Please try again.')
      ).toBeDefined();
    });
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('shows a loading spinner while the session is being created', () => {
    // Action never resolves — simulates in-flight network request
    mockCreatePurchaseCheckoutSessionAction.mockReturnValue(new Promise(() => {}));

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    // While clientSecret is null the component shows the "preparing" state
    expect(screen.getByText('Preparing your checkout...')).toBeDefined();
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('renders the "Purchase {releaseTitle}" heading after the session is created successfully', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const props = buildProps({ releaseTitle: 'My Album' });
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('Purchase My Album')).toBeDefined();
    });
  });

  it('calls onConfirmed when useQuery reports confirmed: true', async () => {
    // Simulate webhook confirmation arriving immediately
    mockUseQuery.mockReturnValue({ data: { confirmed: true } });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const onConfirmed = vi.fn();
    const props = buildProps({ onConfirmed });
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getPurchaseErrorMessage fallback and error code mapping
  // ---------------------------------------------------------------------------

  it('falls back to the raw error code when the code is not in the error map', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'unknown_code_xyz',
    });

    const onError = vi.fn();
    render(<PurchaseCheckoutStep {...buildProps({ onError })} />);

    await waitFor(() => {
      expect(screen.getByText('unknown_code_xyz')).toBeDefined();
    });
    expect(onError).toHaveBeenCalledWith('unknown_code_xyz');
  });

  it('maps "already_purchased" to a user-friendly message', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'already_purchased',
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('You have already purchased this release.')).toBeDefined();
    });
  });

  it('maps "amount_below_minimum" to a user-friendly message', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'amount_below_minimum',
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('The minimum purchase amount is $0.50.')).toBeDefined();
    });
  });

  it('maps "release_unavailable" to a user-friendly message', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'release_unavailable',
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('This release is no longer available for purchase.')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // createSession catch block
  // ---------------------------------------------------------------------------

  it('uses Error.message when createSession throws an Error instance', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreatePurchaseCheckoutSessionAction.mockRejectedValue(new Error('Network failure'));

    const onError = vi.fn();
    render(<PurchaseCheckoutStep {...buildProps({ onError })} />);

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeDefined();
    });
    expect(onError).toHaveBeenCalledWith('Network failure');
    vi.mocked(console.error).mockRestore();
  });

  it('uses fallback message when createSession throws a non-Error value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreatePurchaseCheckoutSessionAction.mockRejectedValue('some string');

    const onError = vi.fn();
    render(<PurchaseCheckoutStep {...buildProps({ onError })} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to initialize checkout')).toBeDefined();
    });
    expect(onError).toHaveBeenCalledWith('Failed to initialize checkout');
    vi.mocked(console.error).mockRestore();
  });

  // ---------------------------------------------------------------------------
  // cancelled cleanup — unmount before async action settles
  // ---------------------------------------------------------------------------

  it('does not update state when unmounted before session action resolves', async () => {
    let resolveAction!: (value: unknown) => void;
    mockCreatePurchaseCheckoutSessionAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );

    const onError = vi.fn();
    const { unmount } = render(<PurchaseCheckoutStep {...buildProps({ onError })} />);

    unmount();

    await act(async () => {
      resolveAction({ success: false, error: 'stripe_error' });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('does not update state when unmounted before session action rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectAction!: (reason: unknown) => void;
    mockCreatePurchaseCheckoutSessionAction.mockReturnValue(
      new Promise((_, reject) => {
        rejectAction = reject;
      })
    );

    const onError = vi.fn();
    const { unmount } = render(<PurchaseCheckoutStep {...buildProps({ onError })} />);

    unmount();

    await act(async () => {
      rejectAction(new Error('Network failure'));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onError).not.toHaveBeenCalled();
    vi.mocked(console.error).mockRestore();
  });

  // ---------------------------------------------------------------------------
  // PurchaseCheckoutForm — internal form states
  // ---------------------------------------------------------------------------

  it('renders checkout error message when useCheckout returns error state', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });
    mockCheckoutState.mockReturnValue({
      type: 'error',
      error: { message: 'Card was declined' },
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Card was declined')).toBeDefined();
    });
  });

  it('disables the Pay button when canConfirm is false', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });
    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { confirm: vi.fn(), canConfirm: false },
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Pay $10.00')).toBeDefined();
    });
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows "Processing..." while payment confirmation is in progress', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    let resolveConfirm!: (value: unknown) => void;
    const mockConfirm = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveConfirm = resolve;
      })
    );

    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { confirm: mockConfirm, canConfirm: true },
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Pay $10.00')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeDefined();
    });

    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

    // Clean up the pending promise
    await act(async () => {
      resolveConfirm({ type: 'success' });
    });
  });

  it('displays inline error and re-enables button when confirm returns an error', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const mockConfirm = vi.fn().mockResolvedValue({
      type: 'error',
      error: { message: 'Your card was declined.' },
    });

    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { confirm: mockConfirm, canConfirm: true },
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Pay $10.00')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Your card was declined.')).toBeDefined();
    });

    // Button should be re-enabled after error
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    expect(mockConfirm).toHaveBeenCalledWith({ redirect: 'if_required' });
  });

  it('transitions to "Payment received!" state on successful confirm', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const mockConfirm = vi.fn().mockResolvedValue({ type: 'success' });
    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { confirm: mockConfirm, canConfirm: true },
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Pay $10.00')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Payment received!')).toBeDefined();
    });
    expect(screen.getByText('Confirming your purchase...')).toBeDefined();
    expect(screen.getByRole('status')).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // useQuery refetchInterval
  // ---------------------------------------------------------------------------

  describe('useQuery refetchInterval', () => {
    it('returns false when query data shows confirmed', async () => {
      mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
        success: true,
        clientSecret: 'cs_xxx',
        paymentIntentId: 'pi_xxx',
      });

      render(<PurchaseCheckoutStep {...buildProps()} />);

      await waitFor(() => expect(mockUseQuery).toHaveBeenCalled());

      const options = mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1][0] as Record<
        string,
        unknown
      >;
      const refetchInterval = options.refetchInterval as (query: unknown) => number | false;
      const result = refetchInterval({
        state: { data: { confirmed: true }, fetchStatus: 'idle' },
      });
      expect(result).toBe(false);
    });

    it('returns POLL_INTERVAL_MS when not confirmed and below MAX_POLL_COUNT', async () => {
      mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
        success: true,
        clientSecret: 'cs_xxx',
        paymentIntentId: 'pi_xxx',
      });

      render(<PurchaseCheckoutStep {...buildProps()} />);

      await waitFor(() => expect(mockUseQuery).toHaveBeenCalled());

      const options = mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1][0] as Record<
        string,
        unknown
      >;
      const refetchInterval = options.refetchInterval as (query: unknown) => number | false;
      const result = refetchInterval({
        state: { data: { confirmed: false }, fetchStatus: 'idle' },
      });
      expect(result).toBe(2000);
    });

    it('returns false when poll count reaches MAX_POLL_COUNT', async () => {
      mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
        success: true,
        clientSecret: 'cs_xxx',
        paymentIntentId: 'pi_xxx',
      });

      const mockConfirm = vi.fn().mockResolvedValue({ type: 'success' });
      mockCheckoutState.mockReturnValue({
        type: 'success',
        checkout: { confirm: mockConfirm, canConfirm: true },
      });

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ confirmed: false }),
      } as Response);

      let capturedQueryFn: (() => Promise<unknown>) | null = null;
      mockUseQuery.mockImplementation((options: Record<string, unknown>) => {
        capturedQueryFn = options.queryFn as () => Promise<unknown>;
        return { data: { confirmed: false } };
      });

      render(<PurchaseCheckoutStep {...buildProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Pay $10.00')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Payment received!')).toBeDefined();
      });

      // Increment pollCount to MAX_POLL_COUNT (45)
      await act(async () => {
        for (let i = 0; i < 45; i++) {
          await capturedQueryFn!();
        }
      });

      const latestOptions = mockUseQuery.mock.calls[
        mockUseQuery.mock.calls.length - 1
      ][0] as Record<string, unknown>;
      const refetchInterval = latestOptions.refetchInterval as (query: unknown) => number | false;
      const result = refetchInterval({
        state: { data: { confirmed: false }, fetchStatus: 'idle' },
      });
      expect(result).toBe(false);

      fetchSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Timed-out state
  // ---------------------------------------------------------------------------

  it('shows timed-out message when polling exceeds MAX_POLL_COUNT without confirmation', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const mockConfirm = vi.fn().mockResolvedValue({ type: 'success' });
    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { confirm: mockConfirm, canConfirm: true },
    });

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ confirmed: false }),
    } as Response);

    let capturedQueryFn: (() => Promise<unknown>) | null = null;
    mockUseQuery.mockImplementation((options: Record<string, unknown>) => {
      capturedQueryFn = options.queryFn as () => Promise<unknown>;
      return { data: { confirmed: false } };
    });

    render(<PurchaseCheckoutStep {...buildProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Pay $10.00')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Payment received!')).toBeDefined();
    });

    // Increment pollCount to MAX_POLL_COUNT (45)
    await act(async () => {
      for (let i = 0; i < 45; i++) {
        await capturedQueryFn!();
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/This is taking longer than expected/)).toBeDefined();
    });

    // The confirming spinner should not be shown when timed out
    expect(screen.queryByRole('status')).toBeNull();

    fetchSpy.mockRestore();
  });
});
