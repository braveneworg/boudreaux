/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dialog } from '@/app/components/ui/dialog';

import { EmailStep } from './email-step';

const mockResolveSubscriberAction = vi.fn();

vi.mock('@/lib/actions/resolve-subscriber-action', () => ({
  resolveSubscriberAction: (...args: unknown[]) => mockResolveSubscriberAction(...args),
}));

const renderInDialog = (ui: React.ReactElement) => render(<Dialog open>{ui}</Dialog>);

describe('EmailStep', () => {
  const defaultProps = {
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

  it('should call onCancel when Back button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should show validation error when submitting without email', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    // Toggle terms on
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  it('should show validation error when terms are not accepted', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'valid@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
    });
  });

  it('should call resolveSubscriberAction and onConfirm for a new user', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockResolveSubscriberAction.mockResolvedValue({ success: true, status: 'created' });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(mockResolveSubscriberAction).toHaveBeenCalledWith({
        email: 'new@example.com',
        termsAccepted: true,
      });
      expect(defaultProps.onConfirm).toHaveBeenCalledWith('new@example.com');
    });
  });

  it('should show "Checking..." while the action is pending', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockResolveSubscriberAction.mockImplementation(() => new Promise(() => {}));

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
    });
  });

  it('should show magic link message for existing users, then call onConfirm after delay', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockResolveSubscriberAction.mockResolvedValue({ success: true, status: 'existing' });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'existing@example.com');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Check Your Email' })).toBeInTheDocument();
      expect(screen.getByText(/We sent a verification link/)).toBeInTheDocument();
    });

    // onConfirm should not be called immediately
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();

    // Advance timers to trigger the setTimeout
    vi.advanceTimersByTime(2000);

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('existing@example.com');
  });

  it('should display a server error when the action fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockResolveSubscriberAction.mockResolvedValue({
      success: false,
      error: 'Disposable email addresses are not allowed',
    });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'test@tempmail.com');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Disposable email addresses are not allowed')).toBeInTheDocument();
    });

    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('should display a generic server error when no error message is returned', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockResolveSubscriberAction.mockResolvedValue({ success: false });

    renderInDialog(<EmailStep {...defaultProps} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });
});
