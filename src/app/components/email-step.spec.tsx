/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dialog } from '@/app/components/ui/dialog';

import { EmailStep } from './email-step';

const mockResolveSubscriberAction = vi.fn();
const mockVerifyTurnstile = vi.fn();

vi.mock('@/lib/actions/resolve-subscriber-action', () => ({
  resolveSubscriberAction: (...args: unknown[]) => mockResolveSubscriberAction(...args),
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
    const user = userEvent.setup();

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.click(screen.getByTestId('verify-turnstile'));

    expect(screen.getByRole('button', { name: 'Continue to Checkout' })).toBeEnabled();
  });

  it('should call onCancel when Back button is clicked', async () => {
    const user = userEvent.setup();

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should show validation error when submitting without email', async () => {
    const user = userEvent.setup();

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
    const user = userEvent.setup();

    renderInDialog(<EmailStep {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'valid@example.com' } });
    await user.click(screen.getByTestId('verify-turnstile'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
    });
  });

  it('should call resolveSubscriberAction and onConfirm for a new user', async () => {
    const user = userEvent.setup();
    mockResolveSubscriberAction.mockResolvedValue({ success: true, status: 'created' });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(mockVerifyTurnstile).toHaveBeenCalledWith('mock-turnstile-token');
      expect(mockResolveSubscriberAction).toHaveBeenCalledWith({
        email: 'new@example.com',
        termsAccepted: true,
      });
      expect(defaultProps.onConfirm).toHaveBeenCalledWith('new@example.com');
    });
  });

  it('should show "Checking..." while the action is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockVerifyTurnstile.mockImplementation(() => new Promise(() => {}));

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByTestId('verify-turnstile'));

    // After Turnstile verify, we need to submit the form manually
    // Use queryAllByRole to handle the transition state
    const submitButtons = screen.queryAllByRole('button', { name: 'Continue to Checkout' });
    if (submitButtons.length > 0) {
      await user.click(submitButtons[0]);
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
    });

    vi.useRealTimers();
  });

  it('should call onConfirm immediately for existing users', async () => {
    const user = userEvent.setup();
    mockResolveSubscriberAction.mockResolvedValue({ success: true, status: 'existing' });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'existing@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledWith('existing@example.com');
    });
  });

  it('should display a server error when the action fails', async () => {
    const user = userEvent.setup();
    mockResolveSubscriberAction.mockResolvedValue({
      success: false,
      error: 'Disposable email addresses are not allowed',
    });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'test@tempmail.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Disposable email addresses are not allowed')).toBeInTheDocument();
    });

    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('should display a generic server error when no error message is returned', async () => {
    const user = userEvent.setup();
    mockResolveSubscriberAction.mockResolvedValue({ success: false });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('should show error and not call resolveSubscriberAction when Turnstile verification fails', async () => {
    const user = userEvent.setup();
    mockVerifyTurnstile.mockResolvedValue({
      success: false,
      error: 'Turnstile verification failed',
    });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Turnstile verification failed')).toBeInTheDocument();
    });

    expect(mockResolveSubscriberAction).not.toHaveBeenCalled();
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('should show default error message when Turnstile verification fails without error string', async () => {
    const user = userEvent.setup();
    mockVerifyTurnstile.mockResolvedValue({ success: false });

    renderInDialog(<EmailStep {...defaultProps} />);

    await fillFormAndVerify(user, 'test@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Bot verification failed. Please try again.')).toBeInTheDocument();
    });
  });
});
