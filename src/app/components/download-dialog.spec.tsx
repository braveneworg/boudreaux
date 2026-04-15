/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DownloadDialog, DownloadTriggerButton } from './download-dialog';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockUseSession = vi.fn<
  () => {
    data: { user?: { email?: string; stripeCustomerId?: string; id?: string } } | null;
    status: string;
  }
>();

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('@/app/components/checkout-step', () => ({
  CheckoutStep: ({ tier, customerEmail }: { tier: string; customerEmail?: string | null }) => (
    <div data-testid="checkout-step" data-tier={tier} data-email={customerEmail ?? ''}>
      Mock Checkout Step
    </div>
  ),
}));

vi.mock('@/app/components/email-step', () => ({
  EmailStep: ({
    onCancel,
    onConfirm,
  }: {
    onCancel: () => void;
    onConfirm: (email: string) => void;
  }) => (
    <div data-testid="email-step">
      <button onClick={onCancel}>Back</button>
      <button onClick={() => onConfirm('test@example.com')}>Continue to Checkout</button>
    </div>
  ),
}));

vi.mock('@/app/components/purchase-checkout-step', () => ({
  PurchaseCheckoutStep: ({
    onConfirmed,
    onCancel,
    onError,
  }: {
    onConfirmed: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
  }) => (
    <div data-testid="purchase-checkout-step">
      <button onClick={onConfirmed}>Confirm Purchase</button>
      <button onClick={onCancel}>Cancel Purchase</button>
      <button onClick={() => onError('Test payment error')}>Trigger Error</button>
      <button onClick={() => onError('You have already purchased this release.')}>
        Trigger Already Purchased
      </button>
    </div>
  ),
}));

vi.mock('@/app/components/purchase-success-step', () => ({
  PurchaseSuccessStep: ({
    releaseTitle,
    availableFormats,
    downloadCount,
    onDownloadComplete,
  }: {
    releaseId: string;
    releaseTitle: string;
    availableFormats?: Array<{ formatType: string; fileName: string }>;
    downloadCount?: number;
    onDownloadComplete?: () => void;
  }) => (
    <div
      data-testid="purchase-success-step"
      data-format-count={availableFormats?.length ?? 0}
      data-download-count={downloadCount ?? 0}
    >
      Purchase complete for {releaseTitle}
      {onDownloadComplete && (
        <button data-testid="mock-success-download-btn" onClick={onDownloadComplete}>
          Download
        </button>
      )}
    </div>
  ),
}));

const mockCheckGuestPurchaseAction = vi.fn();
vi.mock('@/lib/actions/check-guest-purchase-action', () => ({
  checkGuestPurchaseAction: (...args: unknown[]) => mockCheckGuestPurchaseAction(...args),
}));

vi.mock('@/app/components/format-bundle-download', () => ({
  FormatBundleDownload: ({
    releaseId,
    availableFormats,
    downloadCount,
    onDownloadComplete,
  }: {
    releaseId: string;
    availableFormats: Array<{ formatType: string; fileName: string }>;
    downloadCount: number;
    onDownloadComplete?: () => void;
  }) => {
    if (availableFormats.length === 0) {
      return <p>No digital formats available for download.</p>;
    }
    return (
      <div
        data-testid="format-bundle-download"
        data-release-id={releaseId}
        data-format-count={availableFormats.length}
        data-download-count={downloadCount}
      >
        Mock Format Bundle Download
        {onDownloadComplete && (
          <button data-testid="mock-format-download-btn" onClick={onDownloadComplete}>
            Download Formats
          </button>
        )}
      </div>
    );
  },
}));

describe('DownloadDialog', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should render the trigger element', () => {
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    expect(screen.getByRole('button', { name: 'Open Download' })).toBeInTheDocument();
  });

  it('should open the dialog when the trigger is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByText('Choose download format(s)')).toBeInTheDocument();
  });

  it('should render the free download radio option', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText('Free (320Kbps)')).toBeInTheDocument();
  });

  it('should render the premium download radio option with price', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText(/Premium digital formats/)).toBeInTheDocument();
    expect(screen.getByText(/pay what you want/)).toBeInTheDocument();
  });

  it('should show custom amount input when premium is selected', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    // Select premium option
    const premiumRadio = screen.getByRole('radio', { name: /premium/i });
    await user.click(premiumRadio);

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    expect(screen.getByText(/to extend your support for/)).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('should not show custom amount input when free is selected', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    // Select free option
    const freeRadio = screen.getByRole('radio', { name: /free/i });
    await user.click(freeRadio);

    expect(screen.queryByLabelText('Custom amount')).not.toBeInTheDocument();
  });

  it('should show validation error when submitting without selecting an option', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    // Click submit without selecting
    const submitButton = screen.getByRole('button', { name: 'Download' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please select a download option')).toBeInTheDocument();
    });
  });

  it('should render the subscribe CTA section', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(
      screen.getByText((content, element) => {
        return (
          element?.tagName === 'P' &&
          /Want\s+ACCESS TO ALL\s+music on the Fake Four Inc\. record label\?/.test(
            element.textContent ?? ''
          )
        );
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Subscribe/ })).toBeInTheDocument();
  });

  it('should show rate-select step when subscribe button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    const subscribeButton = screen.getByRole('button', { name: /Subscribe/ });
    await user.click(subscribeButton);

    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();
  });

  it('should use default premium price of $8', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog artistName="Some Artist" releaseId="release-123">
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByText(/suggested \$8/)).toBeInTheDocument();
    });
  });

  it('should show custom premium price when provided', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog artistName="Some Artist" releaseId="release-123" premiumPrice={12}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByText(/suggested \$12/)).toBeInTheDocument();
    });
  });

  it('should strip non-numeric characters from custom amount input', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    // Select premium option
    const premiumRadio = screen.getByRole('radio', { name: /premium/i });
    await user.click(premiumRadio);

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    // Enter value with non-numeric characters
    const amountInput = screen.getByLabelText('Custom amount');
    await user.type(amountInput, '-5abc');

    // The input mask should strip everything except digits and decimal, then prefix with $
    expect(amountInput).toHaveValue('$5');
  });
});

describe('DownloadDialog — dialog lifecycle', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8, releaseId: 'release-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should close the dialog after a successful form submission', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /free/i }));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Download' })).not.toBeInTheDocument();
    });
  });

  it('should stay open and show rate-select step when the subscribe button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Subscribe/ }));

    // Dialog stays open, now showing rate-select step
    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('should reset the form when the dialog is closed and reopened', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    // Open and select premium option
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());

    // Close via Escape
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Download' })).not.toBeInTheDocument()
    );

    // Reopen — form should be reset
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.queryByLabelText('Custom amount')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });
});

describe('DownloadTriggerButton', () => {
  it('should render with the correct aria-label', () => {
    render(<DownloadTriggerButton />);

    expect(screen.getByRole('button', { name: 'Download music' })).toBeInTheDocument();
  });

  it('should render the download label text', () => {
    render(<DownloadTriggerButton />);

    expect(screen.getByText('download')).toBeInTheDocument();
  });

  it('should call the onClick prop when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<DownloadTriggerButton onClick={handleClick} />);

    await user.click(screen.getByRole('button', { name: 'Download music' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should stop propagation so parent click handlers are not called', async () => {
    const user = userEvent.setup();
    const parentHandler = vi.fn();

    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={parentHandler}>
        <DownloadTriggerButton />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Download music' }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('should forward the ref to the underlying button element', () => {
    const ref = React.createRef<HTMLButtonElement>();

    render(<DownloadTriggerButton ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('should accept and spread additional button props', () => {
    render(<DownloadTriggerButton data-custom="test-value" />);

    expect(screen.getByRole('button', { name: 'Download music' })).toHaveAttribute(
      'data-custom',
      'test-value'
    );
  });

  it('should merge custom className with default styles', () => {
    render(<DownloadTriggerButton className="extra-class" />);

    const button = screen.getByRole('button', { name: 'Download music' });
    expect(button).toHaveClass('extra-class');
    // Should also retain base styles
    expect(button).toHaveClass('flex');
  });
});

describe('DownloadDialog — custom amount input behavior', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8, releaseId: 'release-123' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show the placeholder with the premium price', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toHaveAttribute('placeholder', '$8.00');
    });
  });

  it('should limit to two decimal places while typing', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Custom amount');
    await user.type(input, '12.999');

    // Should truncate to 2 decimal places, prefixed with $
    expect(input).toHaveValue('$12.99');
  });

  it('should strip multiple decimal points', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Custom amount');
    await user.type(input, '1.2.3');

    // Second decimal should be stripped; result is $1.23
    expect(input).toHaveValue('$1.23');
  });

  it('should format the value on blur', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Custom amount');
    await user.type(input, '5');
    await user.tab(); // trigger blur

    // On blur, should format to $5.00
    expect(input).toHaveValue('$5.00');
  });

  it('should show "Pay" label and suggested price text', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByText('Pay')).toBeInTheDocument();
    });
  });

  it('should show suggested price (not $NaN) in button when only a lone dot is typed', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Custom amount'), '.');

    // Should fall back to the suggested/premium price, never display "$NaN"
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /\$NaN/ })).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Buy & Download for \$8\.00/i })
      ).toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — submit button label', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8, releaseId: 'release-123' };

  it('should show "Download" when no option is selected', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it('should show "Download" when free option is selected', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /free/i }));

    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it('should show "Buy & Download for $8.00" when premium is selected without a custom amount', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Buy & Download for \$8\.00/i })
      ).toBeInTheDocument();
    });
  });

  it('should show "Buy & Download for $5.00" when premium is selected with a custom amount', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '5');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Buy & Download for \$5\.00/i })
      ).toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — subscription multi-step flow', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8, releaseId: 'release-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  const openDialogAndClickSubscribe = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('button', { name: /Subscribe/ }));
  };

  it('should show rate-select step with all tier options after clicking subscribe', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Minimum/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Extra Extra/)).toBeInTheDocument();
  });

  it('should navigate back from rate-select to download step', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);
    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
  });

  it('should show email step when unauthenticated user confirms rate selection', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    // Select a tier
    await user.click(screen.getByLabelText(/Minimum/));
    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    expect(screen.getByTestId('email-step')).toBeInTheDocument();
  });

  it('should skip email step and go straight to checkout when user is authenticated', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    // Select a tier and confirm
    await user.click(screen.getByLabelText(/Minimum/));
    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    // Should go straight to checkout, not email step
    expect(screen.queryByTestId('email-step')).not.toBeInTheDocument();
    const checkoutStep = screen.getByTestId('checkout-step');
    expect(checkoutStep).toBeInTheDocument();
    // Authenticated users skip email — customerEmail is not set, resolved server-side
    expect(checkoutStep).toHaveAttribute('data-email', '');
  });

  it('should navigate from email step to checkout step on confirm', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    // Select a tier and confirm
    await user.click(screen.getByLabelText(/Minimum/));
    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    // Email step
    expect(screen.getByTestId('email-step')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    // Should now be at checkout
    const checkoutStep = screen.getByTestId('checkout-step');
    expect(checkoutStep).toBeInTheDocument();
    expect(checkoutStep).toHaveAttribute('data-email', 'test@example.com');
  });

  it('should navigate back from email step to rate-select step', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    // Select a tier and confirm
    await user.click(screen.getByLabelText(/Minimum/));
    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    // Email step — click Back
    expect(screen.getByTestId('email-step')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();
  });

  it('should reset to download step and clear state when dialog is closed from rate-select', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);
    expect(screen.getByRole('heading', { name: 'Choose Your Plan' })).toBeInTheDocument();

    // Close via Escape
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Choose Your Plan' })).not.toBeInTheDocument()
    );

    // Reopen — should be back at download step
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
  });

  it('should disable Go for It button when no tier is selected', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    expect(screen.getByRole('button', { name: /Go for It/ })).toBeDisabled();
  });

  it('should pass the selected tier to the checkout step', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    await user.click(screen.getByLabelText(/Extra Extra/));
    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    expect(screen.getByTestId('checkout-step')).toHaveAttribute('data-tier', 'extraExtra');
  });

  it('should skip email step for authenticated user and resolve email server-side', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          email: 'subscriber@example.com',
          stripeCustomerId: 'cus_test123',
        },
      },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openDialogAndClickSubscribe(user);

    await user.click(screen.getByLabelText(/Minimum/));
    await user.click(screen.getByRole('button', { name: /Go for It/ }));

    const checkoutStep = screen.getByTestId('checkout-step');
    // Authenticated users skip email — customerEmail resolved server-side
    expect(checkoutStep).toHaveAttribute('data-email', '');
    // stripeCustomerId is no longer passed as a prop; it is resolved server-side in the action
    expect(checkoutStep).not.toHaveAttribute('data-stripe-customer-id');
  });
});

describe('DownloadDialog — hasPurchase button variants', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should show sign-in link on download step when hasPurchase=true and not signed in', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        hasPurchase
        downloadCount={2}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ]}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByText(/already purchased/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/signin');
    // Should NOT show the radio group
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('should auto-advance to format-select when hasPurchase=true and signed in and under limit', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        hasPurchase
        downloadCount={2}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ]}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('format-bundle-download')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('should show disabled "Download limit reached" button when hasPurchase=true and signed in and at limit', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps} hasPurchase downloadCount={5}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.getByText(/download limit for/)).toBeInTheDocument();
    expect(screen.getByText('support@fakefourinc.com')).toBeInTheDocument();
  });

  it('should show disabled "Download limit reached" button when hasPurchase=true and signed in and over limit', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps} hasPurchase downloadCount={7}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
  });

  it('should reset to format-select step when dialog is closed and reopened with hasPurchase', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        hasPurchase
        downloadCount={2}
        availableFormats={[{ formatType: 'FLAC', fileName: 'album-flac.zip' }]}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    // Open — should auto-advance to format-select
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });

    // Close via Escape
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Download Again' })).not.toBeInTheDocument()
    );

    // Reopen — should auto-advance to format-select again
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
  });

  it('should show "No digital formats" message when hasPurchase but no formats available', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps} hasPurchase downloadCount={2} availableFormats={[]}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    // Auto-advances to format-select where no formats message is shown
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.getByText('No digital formats available for download.')).toBeInTheDocument();
  });
});

describe('DownloadDialog — premium-digital submit paths', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should navigate to purchase-checkout step when authenticated user submits premium', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });
  });

  it('should set purchaseMode and navigate to email-step when unauthenticated user submits premium', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('email-step')).toBeInTheDocument();
    });
  });

  it('should show a form error when cents < 50 (amount less than $0.50)', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    // Enter an amount less than $0.50
    await user.type(screen.getByLabelText('Custom amount'), '0.30');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    // Should still be on the download step (dialog did not advance)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('email-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('purchase-checkout-step')).not.toBeInTheDocument();
    // Should show a user-visible error message
    expect(screen.getByText('Minimum amount is $0.50')).toBeInTheDocument();
  });

  it('should use effectiveSuggestedPrice and advance when no custom amount is entered', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    // Submit with no custom amount — handleSubmit falls back to effectiveSuggestedPrice ($8),
    // which is finite and >= $0.50, so no NaN error and the flow advances.
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.queryByText('Amount must be a valid number')).not.toBeInTheDocument();
      expect(screen.queryByText('Minimum amount is $0.50')).not.toBeInTheDocument();
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });
  });

  it('should show a validation error and not advance when a non-numeric amount (lone dot) is submitted', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());

    // Type a lone dot — produces a NaN-parsing amount
    await user.type(screen.getByLabelText('Custom amount'), '.');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    // Zod (or the isFinite guard) should surface an error and block the flow
    await waitFor(() => {
      expect(screen.getByText('Amount must be a valid number')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('email-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('purchase-checkout-step')).not.toBeInTheDocument();
  });
});

describe('DownloadDialog — email step purchase-mode callbacks', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockCheckGuestPurchaseAction.mockReset();
  });

  const openAndSubmitPremium = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => {
      expect(screen.getByTestId('email-step')).toBeInTheDocument();
    });
  };

  it('should go back to download step (not rate-select) when onCancel is called in purchaseMode', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openAndSubmitPremium(user);

    // Click Back (onCancel) from email step
    await user.click(screen.getByRole('button', { name: 'Back' }));

    // Should go back to download step, not rate-select
    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose Your Plan' })).not.toBeInTheDocument();
  });

  it('should navigate to returning-download step when purchaseMode=true and guest has existing purchase', async () => {
    mockCheckGuestPurchaseAction.mockResolvedValue({
      hasPurchase: true,
      atCap: false,
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openAndSubmitPremium(user);

    // Click Continue to Checkout (onConfirm) from email step
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument();
    });
    expect(screen.getByText(/already purchased/)).toBeInTheDocument();
  });

  it('should navigate to purchase-checkout step when purchaseMode=true and guest has no existing purchase', async () => {
    mockCheckGuestPurchaseAction.mockResolvedValue({
      hasPurchase: false,
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openAndSubmitPremium(user);

    // Click Continue to Checkout (onConfirm) from email step
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — purchase-checkout step', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckGuestPurchaseAction.mockReset();
  });

  it('should render purchase-checkout step with mock controls', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Confirm Purchase' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trigger Error' })).toBeInTheDocument();
  });

  it('should transition to purchase-success step when onConfirmed is called', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Confirm Purchase' }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-success-step')).toBeInTheDocument();
    });
    expect(screen.getByText('Purchase complete for Test Release')).toBeInTheDocument();
  });

  it('should set purchaseError and return to download step when onError is called', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Trigger Error' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
    });
    // purchaseError should be displayed
    expect(screen.getByText('Test payment error')).toBeInTheDocument();
  });

  it('should return to download step when onCancel is called on purchase-checkout', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });

    // Click Cancel Purchase to trigger onCancel → setStep('download')
    await user.click(screen.getByRole('button', { name: 'Cancel Purchase' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('purchase-checkout-step')).not.toBeInTheDocument();
  });

  it('should pass availableFormats and downloadCount to PurchaseSuccessStep', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ]}
        downloadCount={2}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Confirm Purchase' }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-success-step')).toBeInTheDocument();
    });

    const successStep = screen.getByTestId('purchase-success-step');
    expect(successStep).toHaveAttribute('data-format-count', '2');
    expect(successStep).toHaveAttribute('data-download-count', '2');
  });
  it('should show purchase-confirmed step instead of error when already_purchased error is returned', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ]}
        downloadCount={2}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument());

    // Trigger already_purchased error
    await user.click(screen.getByRole('button', { name: 'Trigger Already Purchased' }));

    await waitFor(() => {
      // Should show the purchase-confirmed step, not the radio form
      expect(screen.getByText(/already purchased/)).toBeInTheDocument();
    });
    // Should show Continue button to advance to format selection
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText('You have already purchased this release.')).not.toBeInTheDocument();
  });
});

describe('DownloadDialog — returning-download step', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockCheckGuestPurchaseAction.mockReset();
  });

  const navigateToReturningDownload = async (
    user: ReturnType<typeof userEvent.setup>,
    atCap: boolean
  ) => {
    mockCheckGuestPurchaseAction.mockResolvedValue({
      hasPurchase: true,
      atCap,
    });

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('email-step')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument()
    );
  };

  it('should show sign-in link when guestAtCap is false', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await navigateToReturningDownload(user, false);

    expect(screen.getByRole('link', { name: /Sign in to access your downloads/ })).toHaveAttribute(
      'href',
      '/signin'
    );
  });

  it('should show sign-in link when guestAtCap is false even with formats available', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'MP3_V0', fileName: 'album-mp3v0.zip' },
        ]}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await navigateToReturningDownload(user, false);

    expect(screen.getByRole('link', { name: /Sign in to access your downloads/ })).toHaveAttribute(
      'href',
      '/signin'
    );
  });

  it('should show disabled "Download limit reached" button when guestAtCap is true', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await navigateToReturningDownload(user, true);

    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.getByText(/download limit for/)).toBeInTheDocument();
    expect(screen.getByText('support@fakefourinc.com')).toBeInTheDocument();
  });
});

describe('DownloadDialog — suggestedPrice prop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should use suggestedPrice over premiumPrice when provided', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog
        artistName="Test Artist"
        releaseId="release-123"
        premiumPrice={8}
        suggestedPrice={10}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByText(/suggested \$10/)).toBeInTheDocument();
    });

    // The Buy & Download button should show suggestedPrice
    expect(screen.getByRole('button', { name: /Buy & Download for \$10\.00/ })).toBeInTheDocument();
  });

  it('should fall back to premiumPrice when suggestedPrice is null', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog
        artistName="Test Artist"
        releaseId="release-123"
        premiumPrice={8}
        suggestedPrice={null}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByText(/suggested \$8/)).toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — onBlur with empty input', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8, releaseId: 'release-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should not change the input value when blurring with an empty input', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Custom amount');

    // Focus and then blur without typing
    await user.click(input);
    await user.tab(); // trigger blur

    // Input should remain empty (no value set)
    expect(input).toHaveValue('');
  });
});

describe('DownloadDialog — onDownloadComplete closes dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckGuestPurchaseAction.mockReset();
  });

  it('should close the dialog when onDownloadComplete is triggered from purchase-success step', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        artistName="Test Artist"
        premiumPrice={8}
        releaseId="release-123"
        releaseTitle="Test Release"
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    // Navigate to purchase-checkout → purchase-success
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Confirm Purchase' }));
    await waitFor(() => expect(screen.getByTestId('purchase-success-step')).toBeInTheDocument());

    // Click the mock download button that triggers onDownloadComplete → setOpen(false)
    await user.click(screen.getByTestId('mock-success-download-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('purchase-success-step')).not.toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — onDownloadComplete via purchase-confirmed step (already_purchased error)', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckGuestPurchaseAction.mockReset();
  });

  it('should close the dialog when onDownloadComplete is triggered after purchase-confirmed → format-select', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ]}
        downloadCount={2}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    // Navigate to purchase-checkout step
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Custom amount'), '10');
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument());

    // Trigger "already purchased" error → sets purchaseConfirmed=true, step='purchase-confirmed'
    await user.click(screen.getByRole('button', { name: 'Trigger Already Purchased' }));

    await waitFor(() => {
      // Now on purchase-confirmed step
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    // Click Continue to advance to format-select
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByTestId('format-bundle-download')).toBeInTheDocument();
    });

    // Click the mock download button that triggers onDownloadComplete → setOpen(false)
    await user.click(screen.getByTestId('mock-format-download-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('format-bundle-download')).not.toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — onDownloadComplete in format-select step', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should close the dialog when onDownloadComplete is triggered from the format-select step', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog
        {...defaultProps}
        hasPurchase
        downloadCount={2}
        availableFormats={[
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ]}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    // Opens and auto-advances to format-select because hasPurchase + signed in
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('format-bundle-download')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    expect(screen.getByTestId('format-bundle-download')).toBeInTheDocument();

    // Click the mock download button that triggers onDownloadComplete → setOpen(false)
    await user.click(screen.getByTestId('mock-format-download-btn'));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Download Again' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('format-bundle-download')).not.toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — effectiveSuggestedPrice fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should fall back to default premiumPrice ($8) when both suggestedPrice and premiumPrice are undefined', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog
        artistName="Test Artist"
        releaseId="release-123"
        premiumPrice={undefined}
        suggestedPrice={undefined}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Buy & Download for \$8\.00/ })
      ).toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — hasPurchase on download step', () => {
  const purchaseProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
    hasPurchase: true,
    purchasedAt: new Date('2025-06-15T12:00:00'),
    downloadCount: 1,
    availableFormats: [
      { formatType: 'FLAC' as const, fileName: 'test.flac' },
      { formatType: 'MP3_320KBPS' as const, fileName: 'test.mp3' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should auto-advance to format-select when signed in with hasPurchase', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...purchaseProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.getByText(/June 15, 2025/)).toBeInTheDocument();
    expect(screen.getByTestId('format-bundle-download')).toBeInTheDocument();
    // Radio group should not be visible
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('should show Sign in link when not signed in with hasPurchase', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...purchaseProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute('href', '/signin');
    // Radio group should not be visible
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('should still show the Subscribe CTA when hasPurchase is true and not signed in', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...purchaseProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByRole('button', { name: /Subscribe/ })).toBeInTheDocument();
  });

  it('should show download limit reached on format-select when at cap with hasPurchase', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup();

    render(
      <DownloadDialog {...purchaseProps} downloadCount={5}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Continue to Download/ })).not.toBeInTheDocument();
  });
});
