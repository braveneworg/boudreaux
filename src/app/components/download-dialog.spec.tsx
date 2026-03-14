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

describe('DownloadDialog', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    premiumPrice: 8,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByText('Choose your preferred download format.')).toBeInTheDocument();
  });

  it('should render the free download radio option', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText('Download free (320Kbps)')).toBeInTheDocument();
  });

  it('should render the premium download radio option with price', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(
      screen.getByText('Download premium digital formats (FLAC, WAV, etc.)')
    ).toBeInTheDocument();
    expect(screen.getByText(/from \$8/)).toBeInTheDocument();
  });

  it('should show tip amount input when premium is selected', async () => {
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
      expect(screen.getByLabelText('Tip amount')).toBeInTheDocument();
    });

    expect(screen.getByText(/to extend your support for/)).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('should not show tip amount input when free is selected', async () => {
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

    expect(screen.queryByLabelText('Tip amount')).not.toBeInTheDocument();
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
      screen.getByText(/Want ACCESS TO ALL music on the Fake Four Inc. record label\?/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument();
  });

  it('should navigate to /subscribe when subscribe button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    const subscribeButton = screen.getByRole('button', { name: 'Subscribe' });
    await user.click(subscribeButton);

    expect(mockPush).toHaveBeenCalledWith('/subscribe');
  });

  it('should use default premium price of $8', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog artistName="Some Artist">
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText(/from \$8/)).toBeInTheDocument();
  });

  it('should show custom premium price when provided', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog artistName="Some Artist" premiumPrice={12}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));

    expect(screen.getByText(/from \$12/)).toBeInTheDocument();
  });

  it('should show validation error for negative tip amount', async () => {
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
      expect(screen.getByLabelText('Tip amount')).toBeInTheDocument();
    });

    // Enter negative tip
    const tipInput = screen.getByLabelText('Tip amount');
    await user.type(tipInput, '-5');

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /Download for/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Tip amount must be a positive number')).toBeInTheDocument();
    });
  });
});

describe('DownloadDialog — dialog lifecycle', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8 };

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should close the dialog when the subscribe button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.getByRole('heading', { name: 'Download' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Download' })).not.toBeInTheDocument();
    });
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
    await waitFor(() => expect(screen.getByLabelText('Tip amount')).toBeInTheDocument());

    // Close via Escape
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Download' })).not.toBeInTheDocument()
    );

    // Reopen — form should be reset
    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    expect(screen.queryByLabelText('Tip amount')).not.toBeInTheDocument();
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
});

describe('DownloadDialog — submit button label', () => {
  const defaultProps = { artistName: 'Test Artist', premiumPrice: 8 };

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

  it('should show "Download for $8" when premium is selected without a tip', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download for $8' })).toBeInTheDocument();
    });
  });

  it('should show "Download for $8 + $5" when premium is selected with a tip', async () => {
    const user = userEvent.setup();

    render(
      <DownloadDialog {...defaultProps}>
        <button>Open Download</button>
      </DownloadDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Download' }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));

    await waitFor(() => expect(screen.getByLabelText('Tip amount')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Tip amount'), '5');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download for $8 + $5' })).toBeInTheDocument();
    });
  });
});
