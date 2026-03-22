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
  userId: string;
  onConfirmed: () => void;
  onError: (message: string) => void;
}

const buildProps = (overrides: Partial<DefaultProps> = {}): DefaultProps => ({
  releaseId: 'release-123',
  releaseTitle: 'Test Release',
  amountCents: 1000,
  userId: 'user-abc',
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
      expect(screen.getByText('stripe_error')).toBeDefined();
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
});
