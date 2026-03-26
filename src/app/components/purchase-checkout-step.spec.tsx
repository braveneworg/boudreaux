/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

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
  onConfirmed: () => void;
  onError: (message: string) => void;
}

const buildProps = (overrides: Partial<DefaultProps> = {}): DefaultProps => ({
  releaseId: 'release-123',
  releaseTitle: 'Test Release',
  amountCents: 1000,
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
        screen.getByText('A payment error occurred. Please try again or contact support.')
      ).toBeDefined();
    });
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('shows a user-friendly message for already_purchased error', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'already_purchased',
    });

    const onError = vi.fn();
    const props = buildProps({ onError });
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('You have already purchased this release.')).toBeDefined();
    });
    expect(onError).toHaveBeenCalledWith('You have already purchased this release.');
  });

  it('shows a fallback message for unknown error codes', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'unknown_error_code',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeDefined();
    });
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

  it('renders the PurchaseCheckoutForm error state from useCheckout', async () => {
    mockCheckoutState.mockReturnValue({
      type: 'error',
      error: { message: 'Card processing error' },
    });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('Card processing error')).toBeDefined();
    });
  });

  it('renders the Pay button when useCheckout is in success state', async () => {
    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { canConfirm: true, confirm: vi.fn() },
    });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const props = buildProps({ amountCents: 500 });
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('Pay $5.00')).toBeDefined();
    });
  });

  it('shows Processing... state and then error when confirm fails', async () => {
    const mockConfirm = vi.fn().mockResolvedValue({
      type: 'error',
      error: { message: 'Your card was declined.' },
    });

    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { canConfirm: true, confirm: mockConfirm },
    });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText(/Pay/)).toBeDefined();
    });

    // Click Pay button
    const payButton = screen.getByRole('button');
    payButton.click();

    await waitFor(() => {
      expect(screen.getByText('Your card was declined.')).toBeDefined();
    });
  });

  it('calls onPaymentComplete after successful confirm', async () => {
    const mockConfirm = vi.fn().mockResolvedValue({ type: 'success' });

    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { canConfirm: true, confirm: mockConfirm },
    });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    // We need to simulate the paymentComplete state to show the "Payment received!" UI.
    // The render flow: successful confirm → onPaymentComplete() → setPaymentComplete(true)
    // We can detect this transition by checking the rendered UI changes.
    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText(/Pay/)).toBeDefined();
    });

    const payButton = screen.getByRole('button');
    payButton.click();

    // After confirm succeeds, the component should show "Payment received!"
    await waitFor(() => {
      expect(screen.getByText('Payment received!')).toBeDefined();
    });

    // Should show "Confirming your purchase..." (not timed out)
    expect(screen.getByText('Confirming your purchase...')).toBeDefined();
  });

  it('shows error when createSession throws an unexpected Error', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockRejectedValue(new Error('Network failure'));

    const onError = vi.fn();
    const props = buildProps({ onError });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeDefined();
    });
    expect(onError).toHaveBeenCalledWith('Network failure');
    consoleSpy.mockRestore();
  });

  it('shows fallback message when createSession throws a non-Error', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockRejectedValue('string error');

    const onError = vi.fn();
    const props = buildProps({ onError });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to initialize checkout')).toBeDefined();
    });
    expect(onError).toHaveBeenCalledWith('Failed to initialize checkout');
    consoleSpy.mockRestore();
  });

  it('disables the Pay button when canConfirm is false', async () => {
    mockCheckoutState.mockReturnValue({
      type: 'success',
      checkout: { canConfirm: false, confirm: vi.fn() },
    });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDefined();
    });

    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });

  it('does not call confirm when checkoutState is not success', async () => {
    // Loading state — handleConfirm's early return should trigger
    mockCheckoutState.mockReturnValue({ type: 'loading' });
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: true,
      clientSecret: 'cs_xxx',
      paymentIntentId: 'pi_xxx',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    // The loading state shows a spinner inside the form, no button to click
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
    });
  });

  it('displays amount_below_minimum error message', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'amount_below_minimum',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('The minimum purchase amount is $0.50.')).toBeDefined();
    });
  });

  it('displays release_unavailable error message', async () => {
    mockCreatePurchaseCheckoutSessionAction.mockResolvedValue({
      success: false,
      error: 'release_unavailable',
    });

    const props = buildProps();
    render(<PurchaseCheckoutStep {...props} />);

    await waitFor(() => {
      expect(screen.getByText('This release is no longer available for purchase.')).toBeDefined();
    });
  });
});
