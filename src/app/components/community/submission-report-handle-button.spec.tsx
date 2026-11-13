/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';

import { markSubmissionReportHandledAction } from '@/lib/actions/submission-report-actions';

import { SubmissionReportHandleButton } from './submission-report-handle-button';

const { mockToast, mockRouter } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@/lib/actions/submission-report-actions', () => ({
  markSubmissionReportHandledAction: vi.fn(),
}));

const ID = 'e'.repeat(24);
const HANDLED = { success: true as const, data: { id: ID } };

const press = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Mark handled' }));
};

beforeEach(() => {
  vi.mocked(markSubmissionReportHandledAction).mockReset();
});

describe('SubmissionReportHandleButton', () => {
  it('cannot be pressed in the server markup, where a press would be lost', () => {
    const markup = renderToString(<SubmissionReportHandleButton reportId={ID} />);

    expect(markup).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it('marks this report handled', async () => {
    vi.mocked(markSubmissionReportHandledAction).mockResolvedValueOnce(HANDLED);
    render(<SubmissionReportHandleButton reportId={ID} />);

    await press();

    expect(vi.mocked(markSubmissionReportHandledAction).mock.calls).toEqual([[{ reportId: ID }]]);
  });

  it('says so and reloads the list once it is handled', async () => {
    vi.mocked(markSubmissionReportHandledAction).mockResolvedValueOnce(HANDLED);
    render(<SubmissionReportHandleButton reportId={ID} />);

    await press();

    await waitFor(() => expect(mockToast.success.mock.calls).toEqual([['Marked handled.']]));
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it('says why when it could not be handled, and leaves the list alone', async () => {
    vi.mocked(markSubmissionReportHandledAction).mockResolvedValueOnce({
      success: false,
      error: 'Report not found.',
      code: 'NOT_FOUND',
    });
    render(<SubmissionReportHandleButton reportId={ID} />);

    await press();

    await waitFor(() => expect(mockToast.error.mock.calls).toEqual([['Report not found.']]));
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark handled' })).toBeEnabled();
  });

  it('cannot be pressed twice while the first press is on its way', async () => {
    let finish: (result: typeof HANDLED) => void = () => undefined;
    vi.mocked(markSubmissionReportHandledAction).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    render(<SubmissionReportHandleButton reportId={ID} />);

    await press();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark handled' })).toBeDisabled()
    );
    finish(HANDLED);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });
});
