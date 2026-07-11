/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { sendSmsBlastAction } from '@/lib/actions/send-sms-blast-action';
import { SMS_BLAST_MESSAGE_MAX } from '@/lib/validation/sms-blast-schema';
import { buildSmsBlastMessage, getSmsOptOutLine } from '@/utils/sms-blast-message';

import { AnnouncementComposeForm } from './announcement-compose-form';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/actions/send-sms-blast-action', () => ({
  sendSmsBlastAction: vi.fn(),
}));

/** Type a valid message, then click through to open the confirm dialog. */
const composeAndConfirm = async (message: string): Promise<void> => {
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
  await user.click(screen.getByRole('button', { name: 'Send announcement' }));
  await user.click(await screen.findByRole('button', { name: 'Send now' }));
};

describe('AnnouncementComposeForm', () => {
  it('shows the live character counter as the admin types', async () => {
    const user = userEvent.setup();
    render(<AnnouncementComposeForm recipientCount={5} />);

    await user.type(screen.getByLabelText('Message'), 'Hello');

    expect(screen.getByText(`5/${SMS_BLAST_MESSAGE_MAX}`)).toBeInTheDocument();
  });

  it('shows a single SMS segment for a short message', () => {
    render(<AnnouncementComposeForm recipientCount={5} />);

    expect(screen.getByText('1 SMS segment')).toBeInTheDocument();
  });

  it('flips to multiple SMS segments past the single-segment boundary', () => {
    render(<AnnouncementComposeForm recipientCount={5} />);
    const longMessage = 'a'.repeat(200);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: longMessage } });

    const expectedSegments = Math.ceil(buildSmsBlastMessage(longMessage).length / 153);
    expect(screen.getByText(`${expectedSegments} SMS segments`)).toBeInTheDocument();
  });

  it('shows the opt-out line appended automatically to every blast', () => {
    render(<AnnouncementComposeForm recipientCount={5} />);

    expect(screen.getByText(`Appended automatically: ${getSmsOptOutLine()}`)).toBeInTheDocument();
  });

  it('shows the recipient preview count', () => {
    render(<AnnouncementComposeForm recipientCount={7} />);

    expect(screen.getByText('Will send to 7 subscribers')).toBeInTheDocument();
  });

  it('disables the send button when there are no recipients', () => {
    render(<AnnouncementComposeForm recipientCount={0} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi there' } });

    expect(screen.getByRole('button', { name: 'Send announcement' })).toBeDisabled();
  });

  it('tells the admin when no one has opted in to SMS', () => {
    render(<AnnouncementComposeForm recipientCount={0} />);

    expect(screen.getByText('No subscribers have opted in to SMS yet.')).toBeInTheDocument();
  });

  it('opens the confirmation dialog with the recipient count', async () => {
    const user = userEvent.setup();
    render(<AnnouncementComposeForm recipientCount={5} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Show tonight!' } });
    await user.click(screen.getByRole('button', { name: 'Send announcement' }));

    expect(await screen.findByText('Send announcement?')).toBeInTheDocument();
    expect(
      screen.getByText('Send this message to 5 subscribers? This cannot be undone.')
    ).toBeInTheDocument();
  });

  it('sends the blast with the composed message when confirmed', async () => {
    vi.mocked(sendSmsBlastAction).mockResolvedValue({
      success: true,
      recipientCount: 5,
      sentCount: 5,
      failedCount: 0,
    });
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    expect(sendSmsBlastAction).toHaveBeenCalledWith({ message: 'Show tonight!' });
  });

  it('shows a success toast summarising the send', async () => {
    vi.mocked(sendSmsBlastAction).mockResolvedValue({
      success: true,
      recipientCount: 5,
      sentCount: 4,
      failedCount: 0,
    });
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Sent to 4 of 5 subscribers')
    );
  });

  it('appends the failure count to the success toast when sends fail', async () => {
    vi.mocked(sendSmsBlastAction).mockResolvedValue({
      success: true,
      recipientCount: 5,
      sentCount: 3,
      failedCount: 2,
    });
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Sent to 3 of 5 subscribers — 2 failed')
    );
  });

  it('resets the message after a successful send', async () => {
    vi.mocked(sendSmsBlastAction).mockResolvedValue({
      success: true,
      recipientCount: 5,
      sentCount: 5,
      failedCount: 0,
    });
    render(<AnnouncementComposeForm recipientCount={5} />);
    const textarea = screen.getByLabelText('Message');

    await composeAndConfirm('Show tonight!');

    await waitFor(() => expect(textarea).toHaveValue(''));
  });

  it('refreshes the page after a successful send', async () => {
    vi.mocked(sendSmsBlastAction).mockResolvedValue({
      success: true,
      recipientCount: 5,
      sentCount: 5,
      failedCount: 0,
    });
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('shows an error toast when the send fails', async () => {
    vi.mocked(sendSmsBlastAction).mockResolvedValue({
      success: false,
      error: 'Rate limit exceeded — try again later',
    });
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Rate limit exceeded — try again later')
    );
  });

  it('shows an error toast when the action rejects', async () => {
    vi.mocked(sendSmsBlastAction).mockRejectedValue(new Error('network boom'));
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Something went wrong — check History before retrying'
      )
    );
  });

  it('re-enables sending after the action rejects', async () => {
    vi.mocked(sendSmsBlastAction).mockRejectedValue(new Error('network boom'));
    render(<AnnouncementComposeForm recipientCount={5} />);

    await composeAndConfirm('Show tonight!');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send announcement' })).toBeEnabled()
    );
  });
});
