/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { fileSubmissionReportAction } from '@/lib/actions/file-submission-report-action';

import { SubmissionReportDialog } from './submission-report-dialog';

vi.mock('@/lib/actions/file-submission-report-action', () => ({
  fileSubmissionReportAction: vi.fn(),
}));

// A widget the test passes by hand, so "not verified yet" can be observed.
// It says which round it is on: a new round is a new widget.
let widgetsMounted = 0;
vi.mock('@/app/components/ui/turnstile-widget', async () => {
  const { useState } = await import('react');

  return {
    TurnstileWidget: ({
      setIsVerified,
      onToken,
    }: {
      setIsVerified: (verified: boolean) => void;
      onToken?: (token: string) => void;
    }) => {
      const [round] = useState(() => {
        widgetsMounted += 1;
        return widgetsMounted;
      });

      return (
        <button
          type="button"
          onClick={() => {
            setIsVerified(true);
            onToken?.(`token-${round}`);
          }}
        >
          Pass verification
        </button>
      );
    },
  };
});

const ID = 'c'.repeat(24);
const SENT = { success: true as const, data: { sent: true as const } };

const onOpenChange = vi.fn();

const renderDialog = (): ReturnType<typeof userEvent.setup> => {
  render(
    <SubmissionReportDialog submissionId={ID} title="Bus poem" open onOpenChange={onOpenChange} />
  );
  return userEvent.setup();
};

const send = (): HTMLElement => screen.getByRole('button', { name: 'Send report' });

beforeEach(() => {
  widgetsMounted = 0;
  vi.mocked(fileSubmissionReportAction).mockReset();
  onOpenChange.mockReset();
});

describe('SubmissionReportDialog', () => {
  it('names the submission it reports', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Report “Bus poem”' })).toBeInTheDocument();
  });

  it('says a person reads every report and that a report takes nothing down by itself', () => {
    renderDialog();

    expect(
      screen.getByText(
        'Tell our team what is wrong. A person reads every report. A report does not take this down by itself.'
      )
    ).toBeInTheDocument();
  });

  it('offers the three reasons, none chosen', () => {
    renderDialog();

    const reasons = screen.getAllByRole('radio');

    expect(reasons.map((reason) => reason.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(screen.getByRole('radio', { name: /^It's harmful/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^It isn't theirs to post/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Something else/ })).toBeInTheDocument();
  });

  it('says who can read a contact email and how long it is kept', () => {
    renderDialog();

    expect(
      screen.getByText(
        'Only if you want a reply. Only our admins can see it, and we erase it after 90 days.'
      )
    ).toBeInTheDocument();
  });

  it('keeps Send report locked until verification has passed', async () => {
    const user = renderDialog();

    expect(send()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Pass verification' }));

    expect(send()).toBeEnabled();
  });

  it('asks for a reason before sending anything', async () => {
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));

    await user.click(send());

    expect(await screen.findByText('Choose a reason')).toBeInTheDocument();
    expect(fileSubmissionReportAction).not.toHaveBeenCalled();
  });

  it('asks for a note when the reason is something else', async () => {
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^Something else/ }));

    await user.click(send());

    expect(
      await screen.findByText('Tell us what is wrong, in at least 10 characters')
    ).toBeInTheDocument();
    expect(fileSubmissionReportAction).not.toHaveBeenCalled();
  });

  it('refuses a malformed email on its field', async () => {
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));
    await user.type(screen.getByLabelText('Email (optional)'), 'nope');

    await user.click(send());

    expect(
      await screen.findByText('Enter a valid email address, or leave this empty')
    ).toBeInTheDocument();
    expect(fileSubmissionReportAction).not.toHaveBeenCalled();
  });

  it('sends the reason, the note, the email and the verification token', async () => {
    vi.mocked(fileSubmissionReportAction).mockResolvedValueOnce(SENT);
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It isn't theirs to post/ }));
    await user.type(screen.getByLabelText('What should we know?'), 'That is my photo.');
    await user.type(screen.getByLabelText('Email (optional)'), 'me@example.com');

    await user.click(send());

    await waitFor(() =>
      expect(vi.mocked(fileSubmissionReportAction).mock.calls).toEqual([
        [
          {
            submissionId: ID,
            reason: 'NOT_THEIRS',
            note: 'That is my photo.',
            contactEmail: 'me@example.com',
            turnstileToken: 'token-1',
          },
        ],
      ])
    );
  });

  it('thanks the reporter in place of the form once the report is sent', async () => {
    vi.mocked(fileSubmissionReportAction).mockResolvedValueOnce(SENT);
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));

    await user.click(send());

    expect(await screen.findByText('Thanks. Our team has your report.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull();
  });

  it('closes from the thanks message', async () => {
    vi.mocked(fileSubmissionReportAction).mockResolvedValueOnce(SENT);
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));
    await user.click(send());
    await screen.findByText('Thanks. Our team has your report.');

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('closes on Cancel without sending', async () => {
    const user = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(fileSubmissionReportAction).not.toHaveBeenCalled();
  });

  it('shows a limit’s refusal and keeps what was typed', async () => {
    vi.mocked(fileSubmissionReportAction).mockResolvedValueOnce({
      success: false,
      error: 'You have already reported this submission. Our team has your report.',
      code: 'LIMIT_EXCEEDED',
    });
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));
    await user.type(screen.getByLabelText('What should we know?'), 'Threats in the about.');

    await user.click(send());

    expect(
      await screen.findByText(
        'You have already reported this submission. Our team has your report.'
      )
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('What should we know?')).toHaveValue('Threats in the about.');
  });

  it('puts a refusal the server placed on a field under that field', async () => {
    vi.mocked(fileSubmissionReportAction).mockResolvedValueOnce({
      success: false,
      error: 'Check the highlighted fields and try again.',
      code: 'INVALID_INPUT',
      fieldErrors: { contactEmail: ['That email address is too long'] },
    });
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));

    await user.click(send());

    expect(await screen.findByText('That email address is too long')).toBeInTheDocument();
  });

  it('asks for verification again after a refused send, since a token is single use', async () => {
    vi.mocked(fileSubmissionReportAction)
      .mockResolvedValueOnce({
        success: false,
        error: 'Invalid verification. Please try again.',
        code: 'INVALID_INPUT',
        fieldErrors: { turnstileToken: ['Invalid verification. Please try again.'] },
      })
      .mockResolvedValueOnce(SENT);
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));
    await user.click(send());

    expect(await screen.findByText('Invalid verification. Please try again.')).toBeInTheDocument();
    expect(send()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(send());

    await waitFor(() =>
      expect(
        vi.mocked(fileSubmissionReportAction).mock.calls.map(([input]) => {
          const { turnstileToken } = input as { turnstileToken: string };
          return turnstileToken;
        })
      ).toEqual(['token-1', 'token-2'])
    );
  });

  it('locks Send report while a report is on its way', async () => {
    let finish: (result: typeof SENT) => void = () => undefined;
    vi.mocked(fileSubmissionReportAction).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const user = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pass verification' }));
    await user.click(screen.getByRole('radio', { name: /^It's harmful/ }));

    await user.click(send());

    await waitFor(() => expect(send()).toBeDisabled());
    finish(SENT);
    await screen.findByText('Thanks. Our team has your report.');
  });
});
