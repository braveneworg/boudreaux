// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, render, screen, waitFor } from '@testing-library/react';
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));

    expect(await screen.findByPlaceholderText('Type username')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^report$/i })).toBeInTheDocument();
  });

  it('is modal while open: outside pointer events are disabled, then restored', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await screen.findByPlaceholderText('Type username');
    // Radix modal popovers disable pointer events outside the layer, which
    // also pauses the chat drawer's focus trap so it can't steal focus
    // from the username input (the popover portals outside the drawer).
    expect(document.body.style.pointerEvents).toBe('none');

    await user.click(screen.getByRole('button', { name: /close report dialog/i }));
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  });

  it('disables submit until a non-empty username is typed', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    const submit = await screen.findByRole('button', { name: /^report$/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Type username'), 'troll');
    expect(submit).toBeEnabled();
  });

  it('shows the confirmation state on a successful submit', async () => {
    submitMock.mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/30 seconds/);
  });

  it("toasts a self-report message when the server rejects the user's own username", async () => {
    submitMock.mockResolvedValue({ success: false, error: 'self_report' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'self');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/your own account/i);
  });

  it('closes via the X button', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    expect(await screen.findByPlaceholderText('Type username')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close report dialog/i }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Type username')).not.toBeInTheDocument()
    );
  });

  it('toasts a sign-in message on unauthorized', async () => {
    submitMock.mockResolvedValue({ success: false, error: 'unauthorized' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/please sign in/i);
  });

  it('toasts the field error message on invalid', async () => {
    submitMock.mockResolvedValue({
      success: false,
      error: 'invalid',
      fieldErrors: { reportedUsername: ['Username is too short.'] },
    });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'x');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/too short/i);
  });

  it('toasts a generic invalid fallback when no field error is present', async () => {
    submitMock.mockResolvedValue({ success: false, error: 'invalid' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'x');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/valid username/i);
  });

  it('toasts a generic message on an unknown error', async () => {
    submitMock.mockResolvedValue({ success: false, error: 'boom' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/could not submit your report/i);
  });

  it('toasts a generic message when the action throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    submitMock.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/could not submit your report/i);
    consoleSpy.mockRestore();
  });

  it('closes via the confirmation Close button after a successful submit', async () => {
    submitMock.mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await user.click(await screen.findByRole('button', { name: /^close$/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/thank you for keeping our community safe/i)
      ).not.toBeInTheDocument()
    );
  });

  it('ignores a second submit while the first is still in flight', async () => {
    let resolveSubmit: ((value: { success: true }) => void) | undefined;
    submitMock.mockReturnValue(
      new Promise<{ success: true }>((resolve) => {
        resolveSubmit = resolve;
      })
    );
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    const input = await screen.findByPlaceholderText('Type username');
    await user.type(input, 'troll');
    const form = input.closest('form') as HTMLFormElement;

    // First submit leaves isSubmitting=true (promise unresolved); the
    // input/button become disabled, so dispatch a raw submit event to
    // re-enter handleSubmit while the first call is still pending.
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    // Second submit re-enters handleSubmit and hits the `isSubmitting`
    // guard, returning early without calling the action again.
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(submitMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit?.({ success: true });
    });
  });

  it('falls back to a vague delay when rate_limited omits retryAfterSeconds', async () => {
    submitMock.mockResolvedValue({ success: false, error: 'rate_limited' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toMatch(/a little while seconds/i);
  });

  it('keeps focus off the input when re-opening into the confirmation state', async () => {
    submitMock.mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));
    await screen.findByText(/thank you for keeping our community safe/i);

    // Close with Escape, then immediately re-open before the 150ms reset
    // fires — onOpenAutoFocus runs with state still 'confirmation', taking
    // the preventDefault branch.
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));

    expect(
      await screen.findByText(/thank you for keeping our community safe/i)
    ).toBeInTheDocument();
  });

  it('resets back to the form state after the close transition delay', async () => {
    submitMock.mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatReportAbusePopover />);

    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    await user.type(await screen.findByPlaceholderText('Type username'), 'troll');
    await user.click(screen.getByRole('button', { name: /^report$/i }));
    // Reach the confirmation state, then close it via the Close button.
    await screen.findByText(/thank you for keeping our community safe/i);
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    // Wait for the 150ms reset timer to fire (reset() returns state to 'form').
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // Re-open: the form state (input) is shown again, proving reset ran.
    await user.click(screen.getByRole('button', { name: /report abuse \(anonymously\)/i }));
    expect(await screen.findByPlaceholderText('Type username')).toBeInTheDocument();
  });
});
