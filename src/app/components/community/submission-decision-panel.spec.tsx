/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { approveSubmissionAction, rejectSubmissionAction } from '@/lib/actions/submission-actions';

import { SubmissionDecisionPanel } from './submission-decision-panel';

const { mockToast, mockRouter } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@/lib/actions/submission-actions', () => ({
  approveSubmissionAction: vi.fn(),
  rejectSubmissionAction: vi.fn(),
}));

const ID = 'c'.repeat(24);
const LOADED = '2026-11-10T09:00:00.000Z';

const decided = (status: 'APPROVED' | 'REJECTED') => ({
  success: true as const,
  data: { id: ID, status, listed: false, queuePosition: null },
});

const panel = (status: 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED') =>
  render(<SubmissionDecisionPanel submissionId={ID} status={status} loadedUpdatedAt={LOADED} />);

const openRejectDialog = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
  return screen.findByRole('dialog', { name: 'Reject this submission' });
};

describe('SubmissionDecisionPanel', () => {
  it('offers approve and reject on a submission awaiting approval', () => {
    panel('AWAITING_APPROVAL');

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('offers only reject on an approved submission', () => {
    panel('APPROVED');

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('offers no decision on a rejected submission, and says what happens next', () => {
    panel('REJECTED');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByText('Rejected. It returns here if its owner edits it and publishes again.')
    ).toBeInTheDocument();
  });

  it('approves the content as loaded, says so and returns to the queue', async () => {
    vi.mocked(approveSubmissionAction).mockResolvedValueOnce(decided('APPROVED'));
    panel('AWAITING_APPROVAL');

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(vi.mocked(approveSubmissionAction).mock.calls).toEqual([
      [{ submissionId: ID, loadedUpdatedAt: LOADED }],
    ]);
    await waitFor(() => expect(mockRouter.push.mock.calls).toEqual([['/admin/community']]));
    expect(mockToast.success.mock.calls).toEqual([['Approved. Its owner has been told.']]);
  });

  it('reloads the page when the content changed since it was loaded', async () => {
    vi.mocked(approveSubmissionAction).mockResolvedValueOnce({
      success: false,
      error: 'This submission changed since you opened it. Review it again before deciding.',
      code: 'DUPLICATE',
    });
    panel('AWAITING_APPROVAL');

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
    expect(mockToast.error.mock.calls).toEqual([
      ['This submission changed since you opened it. Review it again before deciding.'],
    ]);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('shows any other refusal without leaving the page', async () => {
    vi.mocked(approveSubmissionAction).mockResolvedValueOnce({
      success: false,
      error: 'A manager cannot decide on their own submission. Another approver has to.',
      code: 'INVALID_INPUT',
    });
    panel('AWAITING_APPROVAL');

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mockToast.error.mock.calls).toEqual([
        ['A manager cannot decide on their own submission. Another approver has to.'],
      ])
    );
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('asks for a reason before rejecting, and sends nothing without one', async () => {
    panel('AWAITING_APPROVAL');
    const dialog = await openRejectDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reject and tell the owner' })
    );

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Give a reason of at least 10 characters'
    );
    expect(rejectSubmissionAction).not.toHaveBeenCalled();
  });

  it('rejects with the reason, says so and returns to the queue', async () => {
    vi.mocked(rejectSubmissionAction).mockResolvedValueOnce(decided('REJECTED'));
    panel('APPROVED');
    const dialog = await openRejectDialog();

    await userEvent.type(
      within(dialog).getByLabelText('Reason, shown to the owner'),
      'Not your recording.'
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reject and tell the owner' })
    );

    await waitFor(() =>
      expect(vi.mocked(rejectSubmissionAction).mock.calls).toEqual([
        [{ submissionId: ID, loadedUpdatedAt: LOADED, reason: 'Not your recording.' }],
      ])
    );
    await waitFor(() => expect(mockRouter.push.mock.calls).toEqual([['/admin/community']]));
    expect(mockToast.success.mock.calls).toEqual([['Rejected. Its owner has been told why.']]);
  });

  it('shows the server’s refusal of a reason inside the dialog', async () => {
    vi.mocked(rejectSubmissionAction).mockResolvedValueOnce({
      success: false,
      error: 'Check the highlighted fields and try again.',
      code: 'INVALID_INPUT',
      fieldErrors: { reason: ['Keep the reason to 1000 characters or fewer'] },
    });
    panel('AWAITING_APPROVAL');
    const dialog = await openRejectDialog();

    await userEvent.type(
      within(dialog).getByLabelText('Reason, shown to the owner'),
      'A reason that is long enough.'
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reject and tell the owner' })
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Keep the reason to 1000 characters or fewer'
    );
  });
});
