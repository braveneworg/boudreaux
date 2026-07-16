/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    data: {
      user?: {
        email?: string;
        id?: string;
      };
    } | null;
    status: string;
  }
>();

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => mockUseSession(),
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
    autoStart,
    initialSelectedFormats,
  }: {
    releaseId: string;
    availableFormats: Array<{ formatType: string; fileName: string }>;
    downloadCount: number;
    onDownloadComplete?: () => void;
    autoStart?: boolean;
    initialSelectedFormats?: string[];
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
        data-auto-start={autoStart ? 'true' : 'false'}
        data-initial-selected-formats={(initialSelectedFormats ?? []).join(',')}
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

let currentFreeStatusData:
  | {
      availableFreeFormats: string[];
      blockedReason?: string | null;
      resetsAtIso?: string | null;
    }
  | undefined = {
  availableFreeFormats: ['MP3_320KBPS', 'AAC'],
};
const mockUseFreeDownloadStatusQuery = vi.fn(() => ({ data: currentFreeStatusData }));

vi.mock('@/app/hooks/use-free-download-status-query', () => ({
  useFreeDownloadStatusQuery: () => mockUseFreeDownloadStatusQuery(),
}));

vi.mock('@/app/components/free-format-select-step', () => ({
  FreeFormatSelectStep: ({
    releaseId,
    availableFreeFormats,
    onDownloadComplete,
  }: {
    releaseId: string;
    availableFreeFormats: ReadonlyArray<string>;
    onDownloadComplete?: () => void;
  }) => (
    <div
      data-testid="free-format-select-step"
      data-release-id={releaseId}
      data-available={availableFreeFormats.join(',')}
    >
      Mock Free Format Select Step
      {onDownloadComplete && (
        <button data-testid="mock-free-download-btn" onClick={onDownloadComplete}>
          Trigger free complete
        </button>
      )}
    </div>
  ),
}));

// File-level baseline so no describe inherits another's mock state. Global
// clearMocks resets call history but NOT mockReturnValue/mockImplementation, so
// a persistent stub from one describe — the fixed useFreeDownloadStatusQuery
// return value, or an authenticated session — would otherwise leak into sibling
// describes that don't set these themselves, making the file order-dependent.
// Re-establishing the baseline before every test fixes that; describes needing
// a different session/status override it in their own beforeEach (which runs
// after this one). The query mock keeps its implementation so the free-download
// describe can drive it by mutating currentFreeStatusData.
beforeEach(() => {
  currentFreeStatusData = { availableFreeFormats: ['MP3_320KBPS', 'AAC'] };
  mockUseFreeDownloadStatusQuery.mockImplementation(() => ({ data: currentFreeStatusData }));
  mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
});

describe('DownloadDialog', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
  };

  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockUseFreeDownloadStatusQuery.mockReturnValue({
      data: { availableFreeFormats: ['MP3_320KBPS', 'AAC'] },
    });
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText(/digital formats: MP3 \(320Kbps\) and AAC/)).toBeInTheDocument();
  });

  it('should render the premium download radio option with price', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText(/Premium digital formats/)).toBeInTheDocument();
  });

  it('should show custom amount input when premium is selected', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

  it('should use default premium price of $8', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog artistName="Some Artist" releaseId="release-123">
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toHaveAttribute('placeholder', '$8.00');
    });
  });

  it('should show custom premium price when provided', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog artistName="Some Artist" releaseId="release-123" premiumPrice={12}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Custom amount')).toHaveAttribute('placeholder', '$12.00');
    });
  });

  it('should strip non-numeric characters from custom amount input', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should advance to the free-format-select step when the free option is submitted', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog
        {...defaultProps}
        availableFormats={[
          { formatType: 'MP3_320KBPS', fileName: 'album-mp3.zip' },
          { formatType: 'AAC', fileName: 'album-aac.zip' },
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
        ]}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /free/i }));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByTestId('free-format-select-step')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should reset the form when the dialog is closed and reopened', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const handleClick = vi.fn();

    render(<DownloadTriggerButton onClick={handleClick} />);

    await user.click(screen.getByRole('button', { name: 'Download music' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should stop propagation so parent click handlers are not called', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const parentHandler = vi.fn();

    render(
      <div onClick={parentHandler} onKeyDown={parentHandler} role="button" tabIndex={-1}>
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
  it('should show the placeholder with the premium price', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it('should show "Download" when free option is selected', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

describe('DownloadDialog — hasPurchase button variants', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should show sign-in link on download step when hasPurchase=true and not signed in', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps} hasPurchase downloadCount={5} resetInHours={3}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.getByText(/you've reached your download limit for/i)).toBeInTheDocument();
    expect(screen.getByText(/resets in 3 hours/i)).toBeInTheDocument();
    expect(screen.queryByText(/support@fakefourinc\.com/i)).not.toBeInTheDocument();
  });

  it('should show disabled "Download limit reached" button when hasPurchase=true and signed in and over limit', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should navigate to purchase-checkout step when authenticated user submits premium', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });
  });

  it('should set purchaseMode and navigate to email-step when unauthenticated user submits premium', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));

    await waitFor(() => {
      expect(screen.getByTestId('email-step')).toBeInTheDocument();
    });
  });

  it('should show a form error when cents < 50 (amount less than $0.50)', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockCheckGuestPurchaseAction.mockReset();
  });

  const openAndSubmitPremium = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    const amountInput = screen.getByLabelText('Custom amount');
    fireEvent.change(amountInput, { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => {
      expect(screen.getByTestId('email-step')).toBeInTheDocument();
    });
  };

  it('should go back to download step when onCancel is called from email step', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await openAndSubmitPremium(user);

    // Click Back (onCancel) from email step
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();
  });

  it('should navigate to returning-download step when purchaseMode=true and guest has existing purchase', async () => {
    mockCheckGuestPurchaseAction.mockResolvedValue({
      hasPurchase: true,
      atCap: false,
      resetInHours: null,
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
      resetInHours: null,
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    mockCheckGuestPurchaseAction.mockReset();
  });

  it('should render purchase-checkout step with mock controls', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
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

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
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

  it('should advance to format-select step when Continue is clicked', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog
        {...defaultProps}
        availableFormats={[{ formatType: 'FLAC', fileName: 'album.flac.zip' }]}
        downloadCount={2}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Custom amount'), {
      target: { value: '10' },
    });
    await user.click(screen.getByRole('button', { name: /Buy & Download/i }));
    await waitFor(() => expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Trigger Already Purchased' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText(/Select formats/i)).toBeInTheDocument());
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
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockCheckGuestPurchaseAction.mockReset();
  });

  const navigateToReturningDownload = async (
    user: ReturnType<typeof userEvent.setup>,
    atCap: boolean,
    resetInHours: number | null = null
  ) => {
    mockCheckGuestPurchaseAction.mockResolvedValue({
      hasPurchase: true,
      atCap,
      resetInHours,
    });

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    const amountInput = screen.getByLabelText('Custom amount');
    fireEvent.change(amountInput, { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('email-step')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument()
    );
  };

  it('should show sign-in link when guestAtCap is false', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await navigateToReturningDownload(user, true, 2);

    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.getByText(/you've reached your download limit for/i)).toBeInTheDocument();
    expect(screen.getByText(/resets in 2 hours/i)).toBeInTheDocument();
    expect(screen.queryByText(/support@fakefourinc\.com/i)).not.toBeInTheDocument();
  });

  it('should show singular hour text when guest cap resetInHours is 1', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await navigateToReturningDownload(user, true, 1);

    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.getByText(/resets in 1 hour\./i)).toBeInTheDocument();
  });

  it('should omit reset-hours text for guest cap when resetInHours is null', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await navigateToReturningDownload(user, true, null);

    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.queryByText(/resets in/i)).not.toBeInTheDocument();
  });
});

describe('DownloadDialog — suggestedPrice prop', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should use suggestedPrice over premiumPrice when provided', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
      expect(screen.getByLabelText('Custom amount')).toHaveAttribute('placeholder', '$10.00');
    });

    // The Buy & Download button should show suggestedPrice
    expect(screen.getByRole('button', { name: /Buy & Download for \$10\.00/ })).toBeInTheDocument();
  });

  it('should fall back to premiumPrice when suggestedPrice is null', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
      expect(screen.getByLabelText('Custom amount')).toHaveAttribute('placeholder', '$8.00');
    });
  });
});

describe('DownloadDialog — onBlur with empty input', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8, releaseId: 'release-123' };

  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should not change the input value when blurring with an empty input', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

describe('DownloadDialog — dialog auto-dismiss after download', () => {
  beforeEach(() => {
    mockCheckGuestPurchaseAction.mockReset();
  });

  it('closes on format-select download completion', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog
        artistName="Test Artist"
        premiumPrice={8}
        releaseId="release-123"
        releaseTitle="Test Release"
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

    await user.click(screen.getByTestId('mock-format-download-btn'));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Download Again' })).not.toBeInTheDocument();
    });
  });

  it('closes on purchase-success download completion', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog artistName="Test Artist" premiumPrice={8} releaseId="release-123">
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await user.click(screen.getByRole('button', { name: /Buy & Download for \$8\.00/i }));
    await waitFor(() => {
      expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Confirm Purchase' }));
    await waitFor(() => {
      expect(screen.getByTestId('purchase-success-step')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('mock-success-download-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('purchase-success-step')).not.toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — effectiveSuggestedPrice fallback', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should fall back to default premiumPrice ($8) when both suggestedPrice and premiumPrice are undefined', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

  it('should fall back to $5 when suggestedPrice and premiumPrice are both null', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog
        artistName="Test Artist"
        releaseId="release-123"
        premiumPrice={null as unknown as number}
        suggestedPrice={null}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Buy & Download for \$5\.00/ })
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
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
  });

  it('should auto-advance to format-select when signed in with hasPurchase', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

  it('should show download limit reached on format-select when at cap with hasPurchase', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

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

  it('should show singular hour text on format-select when resetInHours is 1', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'authed@example.com', id: 'user-1' } },
      status: 'authenticated',
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...purchaseProps} downloadCount={5} resetInHours={1}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Download Again' })).toBeInTheDocument();
    });
    expect(screen.getByText(/resets in 1 hour\./i)).toBeInTheDocument();
  });
});

describe('DownloadDialog — free download flow (007 US1)', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
  };

  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    currentFreeStatusData = { availableFreeFormats: ['MP3_320KBPS', 'AAC'] };
  });

  it('advances to free-format-select step when free radio is submitted', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    const freeRadio = screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i });
    await user.click(freeRadio);
    await user.click(screen.getByRole('button', { name: /^Download$/ }));

    expect(await screen.findByTestId('free-format-select-step')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Free Download/ })).toBeInTheDocument();
  });

  it('passes availableFreeFormats from the free-status query into FreeFormatSelectStep', async () => {
    currentFreeStatusData = { availableFreeFormats: ['MP3_320KBPS'] };
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }));
    await user.click(screen.getByRole('button', { name: /^Download$/ }));

    const step = await screen.findByTestId('free-format-select-step');
    expect(step.getAttribute('data-available')).toBe('MP3_320KBPS');
  });

  it('back navigation returns to the download step', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }));
    await user.click(screen.getByRole('button', { name: /^Download$/ }));
    await screen.findByTestId('free-format-select-step');

    await user.click(screen.getByRole('button', { name: /^Back$/ }));

    expect(screen.queryByTestId('free-format-select-step')).not.toBeInTheDocument();
    expect(screen.getByText('Choose download format(s)')).toBeInTheDocument();
  });

  it('closing the dialog mid-download resets the step state', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }));
    await user.click(screen.getByRole('button', { name: /^Download$/ }));
    await screen.findByTestId('free-format-select-step');

    // onDownloadComplete closes the dialog and resets state.
    await user.click(screen.getByTestId('mock-free-download-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('free-format-select-step')).not.toBeInTheDocument();
    });
  });

  it('disables the free radio with hint when no free formats are published', async () => {
    currentFreeStatusData = { availableFreeFormats: [] };
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    const freeRadio = screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i });
    expect(freeRadio).toBeDisabled();
    expect(screen.getByText(/Not available for this release/i)).toBeInTheDocument();
  });

  it('falls back to an empty free-format list when the free-status query has no data', async () => {
    // freeStatus is undefined → `availableFreeFormats = undefined ?? []`. The free
    // radio is still enabled (freeRadioDisabled only trips when freeStatus is defined).
    currentFreeStatusData = undefined;
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }));
    await user.click(screen.getByRole('button', { name: /^Download$/ }));

    const step = await screen.findByTestId('free-format-select-step');
    expect(step.getAttribute('data-available')).toBe('');
  });

  it('passes cap-reached resets-at into FreeFormatSelectStep when the cap is hit', async () => {
    // blockedReason === 'cap-reached' selects the resetsAtIso branch for
    // capReachedResetsAtIso (otherwise null).
    currentFreeStatusData = {
      availableFreeFormats: ['MP3_320KBPS', 'AAC'],
      blockedReason: 'cap-reached',
      resetsAtIso: '2026-06-16T00:00:00.000Z',
    };
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }));
    await user.click(screen.getByRole('button', { name: /^Download$/ }));

    expect(await screen.findByTestId('free-format-select-step')).toBeInTheDocument();
  });
});

describe('DownloadDialog — purchase-confirmed step variants', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
    releaseId: 'release-123',
    releaseTitle: 'Test Release',
  };

  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@test.com', id: 'user-123' } },
      status: 'authenticated',
    });
    mockCheckGuestPurchaseAction.mockReset();
  });

  const advanceToConfirmed = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByLabelText('Custom amount')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: /Buy & Download/ }));
    await waitFor(() => expect(screen.getByTestId('purchase-checkout-step')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Trigger Already Purchased' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument()
    );
  };

  it('shows "a previous date" when purchasedAt is null on the confirmed step', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps} purchasedAt={null} downloadCount={2}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await advanceToConfirmed(user);

    expect(screen.getByText(/a previous date/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('shows a disabled limit-reached button on the confirmed step when at the download cap', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog
        {...defaultProps}
        downloadCount={5}
        resetInHours={4}
        purchasedAt={new Date('2025-06-15T12:00:00')}
      >
        <button>Open Download</button>
      </DownloadDialog>
    );

    await advanceToConfirmed(user);

    // purchasedAt is set → the date is formatted (covers the truthy ternary branch).
    expect(screen.getByText(/June 15, 2025/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.getByText(/resets in 4 hours/i)).toBeInTheDocument();
  });

  it('shows singular hour text on the confirmed step when resetInHours is 1', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps} downloadCount={5} resetInHours={1}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await advanceToConfirmed(user);

    expect(screen.getByText(/resets in 1 hour\./i)).toBeInTheDocument();
  });

  it('omits reset text on the confirmed step when resetInHours is null and at cap', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <DownloadDialog {...defaultProps} downloadCount={5} resetInHours={null}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await advanceToConfirmed(user);

    expect(screen.getByRole('button', { name: /Download limit reached/ })).toBeDisabled();
    expect(screen.queryByText(/resets in/i)).not.toBeInTheDocument();
  });
});
