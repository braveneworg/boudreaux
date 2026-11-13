/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';

import { SubmissionReportControl } from './submission-report-control';

// The dialog has its own spec. Here a stand-in shows what it was given, and
// counts its mounts: a fresh mount is a fresh form.
let dialogMounts = 0;
vi.mock('next/dynamic', async () => {
  const { useState } = await import('react');

  return {
    default: () =>
      function SubmissionReportDialogStub({
        submissionId,
        title,
        open,
        onOpenChange,
      }: {
        submissionId: string;
        title: string;
        open: boolean;
        onOpenChange: (open: boolean) => void;
      }) {
        const [mount] = useState(() => {
          dialogMounts += 1;
          return dialogMounts;
        });

        return open ? (
          <div role="dialog" aria-label={title} data-submission={submissionId} data-mount={mount}>
            <button type="button" onClick={() => onOpenChange(false)}>
              Close the stand-in
            </button>
          </div>
        ) : null;
      },
  };
});

const ID = 'c'.repeat(24);

const renderControl = (): ReturnType<typeof userEvent.setup> => {
  render(<SubmissionReportControl submissionId={ID} title="Bus poem" />);
  return userEvent.setup();
};

beforeEach(() => {
  dialogMounts = 0;
});

describe('SubmissionReportControl', () => {
  it('offers a Report button that opens a dialog', () => {
    renderControl();

    expect(screen.getByRole('button', { name: 'Report' })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    );
  });

  it('cannot be pressed in the server markup, where a press would be lost', () => {
    const markup = renderToString(<SubmissionReportControl submissionId={ID} title="Bus poem" />);

    expect(markup).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it('can be pressed once the page has hydrated', () => {
    renderControl();

    expect(screen.getByRole('button', { name: 'Report' })).toBeEnabled();
  });

  it('renders no dialog, and loads none, until Report is pressed', () => {
    renderControl();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dialogMounts).toBe(0);
  });

  it('opens the report dialog for this submission', async () => {
    const user = renderControl();

    await user.click(screen.getByRole('button', { name: 'Report' }));

    expect(screen.getByRole('dialog', { name: 'Bus poem' })).toHaveAttribute('data-submission', ID);
  });

  it('closes the dialog when the dialog asks to', async () => {
    const user = renderControl();
    await user.click(screen.getByRole('button', { name: 'Report' }));

    await user.click(screen.getByRole('button', { name: 'Close the stand-in' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts a fresh form each time it is opened', async () => {
    const user = renderControl();
    await user.click(screen.getByRole('button', { name: 'Report' }));
    await user.click(screen.getByRole('button', { name: 'Close the stand-in' }));

    await user.click(screen.getByRole('button', { name: 'Report' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-mount', '2');
  });
});
