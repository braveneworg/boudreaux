// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatReportAbusePopover } from './chat-report-abuse-popover';

const submitMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/submit-abuse-report-action', () => ({
  submitAbuseReportAction: submitMock,
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

beforeEach(() => {
  submitMock.mockReset();
  toastErrorMock.mockReset();
});

describe('ChatReportAbusePopover', () => {
  it('renders the sticky trigger link with the icon', () => {
    render(<ChatReportAbusePopover />);
    expect(
      screen.getByRole('button', { name: /report abuse \(anonymously\)/i })
    ).toBeInTheDocument();
  });

  it('opens the form state when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));

    expect(await screen.findByPlaceholderText('Type username')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^report$/i })).toBeInTheDocument();
  });

  it('disables submit until a non-empty username is typed', async () => {
    const user = userEvent.setup();
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    const submit = await screen.findByRole('button', { name: /^report$/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Type username'), 'troll');
    expect(submit).toBeEnabled();
  });

  it('shows the confirmation state on a successful submit', async () => {
    submitMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    expect(submitMock).toHaveBeenCalledWith({ reportedUsername: 'troll' });
    expect(
      await screen.findByText(/thank you for keeping our community safe/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });

  it('toasts a rate-limit message on rate_limited', async () => {
    submitMock.mockResolvedValue({
      success: false,
      error: 'rate_limited',
      retryAfterSeconds: 30,
    });
    const user = userEvent.setup();
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/30 seconds/);
  });

  it("toasts a self-report message when the server rejects the user's own username", async () => {
    submitMock.mockResolvedValue({ success: false, error: 'self_report' });
    const user = userEvent.setup();
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'self');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/your own account/i);
  });

  it('closes via the X button', async () => {
    const user = userEvent.setup();
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    expect(await screen.findByPlaceholderText('Type username')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close report dialog/i }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Type username')).not.toBeInTheDocument()
    );
  });
});
