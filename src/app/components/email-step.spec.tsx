/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dialog } from '@/app/components/ui/dialog';

import { EmailStep } from './email-step';

const mockVerifyTurnstile = vi.fn();

vi.mock('@/app/components/ui/turnstile-widget', () => ({
  TurnstileWidget: ({
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

const renderInDialog = (ui: React.ReactElement) => render(<Dialog open>{ui}</Dialog>);

/** Fill the form and verify Turnstile so the submit button is enabled. */
const fillFormAndVerify = async (user: ReturnType<typeof userEvent.setup>, email: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  await user.click(screen.getByRole('switch'));
  await user.click(screen.getByTestId('verify-turnstile'));
};

describe('EmailStep', () => {
  const defaultProps = {
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    mockVerifyTurnstile.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render the email form with heading and description', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Your Email' })).toBeInTheDocument();
    expect(screen.getByText('Enter your email to continue to checkout.')).toBeInTheDocument();
  });

  it('should render the email input field', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('should render the terms and conditions switch', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText(/I accept the/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'terms and conditions' })).toHaveAttribute(
      'href',
      '/legal/terms-and-conditions'
    );
  });

  it('should render Back and Continue to Checkout buttons', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to Checkout' })).toBeInTheDocument();
  });

  it('should render the Turnstile widget', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByTestId('verify-turnstile')).toBeInTheDocument();
  });

  it('should disable Continue to Checkout when Turnstile is not verified', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Continue to Checkout' })).toBeDisabled();
  });

  it('should enable Continue to Checkout after Turnstile verification', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.click(screen.getByTestId('verify-turnstile'));

    expect(screen.getByRole('button', { name: 'Continue to Checkout' })).toBeEnabled();
  });

  it('should call onCancel when Back button is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should show validation error when submitting without email', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    // Toggle terms on and verify Turnstile
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByTestId('verify-turnstile'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  it('should show validation error when terms are not accepted', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'valid@example.com' } });
    await user.click(screen.getByTestId('verify-turnstile'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
    });
  });

  it('should call onConfirm with the entered email after successful Turnstile verification', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn();

    renderInDialog(<EmailStep onCancel={defaultProps.onCancel} onConfirm={onConfirm} />);

    await fillFormAndVerify(user, 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(mockVerifyTurnstile).toHaveBeenCalledWith('mock-turnstile-token');
      expect(onConfirm).toHaveBeenCalledWith('new@example.com');
    });
  });

  it('should show error and not call onConfirm when Turnstile verification fails', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn();
    mockVerifyTurnstile.mockResolvedValue({
      success: false,
      error: 'Turnstile verification failed',
    });

    renderInDialog(<EmailStep onCancel={defaultProps.onCancel} onConfirm={onConfirm} />);

    await fillFormAndVerify(user, 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Turnstile verification failed')).toBeInTheDocument();
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should focus the email input on mount', () => {
    renderInDialog(<EmailStep {...defaultProps} />);

    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('should show "Checking..." on the submit button while verification is pending', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    let resolveVerify: ((value: { success: boolean }) => void) | undefined;
    mockVerifyTurnstile.mockReturnValue(
      new Promise<{ success: boolean }>((resolve) => {
        resolveVerify = resolve;
      })
    );

    const onConfirm = vi.fn();
    const { container } = renderInDialog(
      <EmailStep onCancel={defaultProps.onCancel} onConfirm={onConfirm} />
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pending@example.com' } });
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByTestId('verify-turnstile'));

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    // Submit while verifyTurnstile is still unresolved (deferred promise).
    fireEvent.click(submitButton);

    // While verifyTurnstile is unresolved, the submit button shows pending copy.
    await waitFor(() => {
      expect(submitButton).toHaveTextContent('Checking...');
    });

    resolveVerify?.({ success: true });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('pending@example.com');
    });
  });

  it('should clear verification and reset the token when verification fails', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn();
    mockVerifyTurnstile.mockResolvedValue({ success: false, error: 'Failed verification' });

    renderInDialog(<EmailStep onCancel={defaultProps.onCancel} onConfirm={onConfirm} />);

    await fillFormAndVerify(user, 'reset@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    // After a failed verification the button reverts to disabled (isVerified
    // reset to false) and surfaces the error.
    await waitFor(() => {
      expect(screen.getByText('Failed verification')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Continue to Checkout' })).toBeDisabled();
  });

  it('should show default error message when Turnstile verification fails without error string', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    mockVerifyTurnstile.mockResolvedValue({ success: false });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Bot verification failed. Please try again.')).toBeInTheDocument();
    });
  });
});
