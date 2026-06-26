// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { setSignupsPausedAction } from '@/lib/actions/set-signups-paused-action';

import { SignupsPausedToggle } from './signups-paused-toggle';

const mockAction = vi.mocked(setSignupsPausedAction);

vi.mock('@/lib/actions/set-signups-paused-action', () => ({
  setSignupsPausedAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SignupsPausedToggle', () => {
  it('renders the switch reflecting the paused state', () => {
    render(<SignupsPausedToggle paused envForced={false} />);
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('renders the switch unchecked when not paused', () => {
    render(<SignupsPausedToggle paused={false} envForced={false} />);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('disables the switch and shows a note when env-forced', () => {
    render(<SignupsPausedToggle paused envForced />);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/AUTH_DISABLE_SIGNUP/)).toBeInTheDocument();
  });

  it('calls the action when toggled', async () => {
    mockAction.mockResolvedValue({ success: true });
    render(<SignupsPausedToggle paused={false} envForced={false} />);
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(mockAction).toHaveBeenCalledWith({ paused: true }));
  });

  it('shows a success toast when the action succeeds', async () => {
    const { toast } = await import('sonner');
    mockAction.mockResolvedValue({ success: true });
    render(<SignupsPausedToggle paused={false} envForced={false} />);
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('shows an error toast when the action fails', async () => {
    const { toast } = await import('sonner');
    mockAction.mockResolvedValue({ success: false, error: 'unauthorized' });
    render(<SignupsPausedToggle paused={false} envForced={false} />);
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
