/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  deleteSubmissionAction,
  setSubmissionListedAction,
} from '@/lib/actions/submission-actions';

import { SubmissionOwnerControls } from './submission-owner-controls';
import { SubmissionModalContext } from './use-submission-modal';

const { mockToast, mockRouter, mockQueryClient } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { push: vi.fn(), refresh: vi.fn() },
  mockQueryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQueryClient }));
vi.mock('@/lib/actions/submission-actions', () => ({
  deleteSubmissionAction: vi.fn(),
  setSubmissionListedAction: vi.fn(),
}));

const ID = 'c'.repeat(24);
const LISTED_LABEL = 'Show on the User Submitted Content page';

const saved = (listed: boolean) => ({
  success: true as const,
  data: { id: ID, status: 'APPROVED' as const, listed, queuePosition: null },
});

describe('SubmissionOwnerControls', () => {
  it('links to the form and to the owner’s list', () => {
    render(<SubmissionOwnerControls submissionId={ID} status="DRAFT" listed={false} />);

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/community/${ID}/edit`
    );
    expect(screen.getByRole('link', { name: 'Your submissions' })).toHaveAttribute(
      'href',
      '/community/mine'
    );
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'REJECTED'] as const)(
    'offers no listed switch on a %s submission',
    (status) => {
      render(<SubmissionOwnerControls submissionId={ID} status={status} listed={false} />);

      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    }
  );

  it('shows an approved submission’s listed choice as a switch', () => {
    render(<SubmissionOwnerControls submissionId={ID} status="APPROVED" listed />);

    expect(screen.getByRole('switch', { name: LISTED_LABEL })).toBeChecked();
  });

  it('switches an approved submission to listed and says where it now appears', async () => {
    vi.mocked(setSubmissionListedAction).mockResolvedValueOnce(saved(true));
    render(<SubmissionOwnerControls submissionId={ID} status="APPROVED" listed={false} />);

    await userEvent.click(screen.getByRole('switch', { name: LISTED_LABEL }));

    expect(vi.mocked(setSubmissionListedAction).mock.calls).toEqual([
      [{ submissionId: ID, listed: true }],
    ]);
    await waitFor(() => expect(mockToast.success.mock.calls).toEqual([['Listed.']]));
    expect(screen.getByRole('switch', { name: LISTED_LABEL })).toBeChecked();
  });

  it('says only people with the link can open it when switched to unlisted', async () => {
    vi.mocked(setSubmissionListedAction).mockResolvedValueOnce(saved(false));
    render(<SubmissionOwnerControls submissionId={ID} status="APPROVED" listed />);

    await userEvent.click(screen.getByRole('switch', { name: LISTED_LABEL }));

    await waitFor(() =>
      expect(mockToast.success.mock.calls).toEqual([
        ['Unlisted. Only people with the link can open it.'],
      ])
    );
  });

  it('puts the switch back and shows the reason when the change is refused', async () => {
    vi.mocked(setSubmissionListedAction).mockResolvedValueOnce({
      success: false,
      error: 'Only an approved submission can be listed or unlisted.',
      code: 'NOT_FOUND',
    });
    render(<SubmissionOwnerControls submissionId={ID} status="APPROVED" listed={false} />);

    await userEvent.click(screen.getByRole('switch', { name: LISTED_LABEL }));

    await waitFor(() =>
      expect(mockToast.error.mock.calls).toEqual([
        ['Only an approved submission can be listed or unlisted.'],
      ])
    );
    expect(screen.getByRole('switch', { name: LISTED_LABEL })).not.toBeChecked();
  });

  it('has the submission read again once the switch is stored, so its status line follows', async () => {
    vi.mocked(setSubmissionListedAction).mockResolvedValueOnce(saved(true));
    render(<SubmissionOwnerControls submissionId={ID} status="APPROVED" listed={false} />);

    await userEvent.click(screen.getByRole('switch', { name: LISTED_LABEL }));

    await waitFor(() =>
      expect(mockQueryClient.invalidateQueries.mock.calls).toEqual([
        [{ queryKey: ['submissions', 'detail', ID] }],
      ])
    );
  });

  it('reads nothing again when the switch is refused', async () => {
    vi.mocked(setSubmissionListedAction).mockResolvedValueOnce({
      success: false,
      error: 'Only an approved submission can be listed or unlisted.',
      code: 'NOT_FOUND',
    });
    render(<SubmissionOwnerControls submissionId={ID} status="APPROVED" listed={false} />);

    await userEvent.click(screen.getByRole('switch', { name: LISTED_LABEL }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1));
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('closes the submission modal once the submission is deleted: there is nothing left to show', async () => {
    const modal = { open: vi.fn(), close: vi.fn() };
    vi.mocked(deleteSubmissionAction).mockResolvedValueOnce({ success: true, data: { id: ID } });
    render(
      <SubmissionModalContext value={modal}>
        <SubmissionOwnerControls submissionId={ID} status="DRAFT" listed={false} />
      </SubmissionModalContext>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(modal.close).toHaveBeenCalledTimes(1));
  });

  it('leaves the submission modal open when the delete is refused', async () => {
    const modal = { open: vi.fn(), close: vi.fn() };
    vi.mocked(deleteSubmissionAction).mockResolvedValueOnce({
      success: false,
      error: 'We could not delete your submission. Please try again.',
      code: 'NOT_FOUND',
    });
    render(
      <SubmissionModalContext value={modal}>
        <SubmissionOwnerControls submissionId={ID} status="DRAFT" listed={false} />
      </SubmissionModalContext>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1));
    expect(modal.close).not.toHaveBeenCalled();
  });

  it('deletes only after the owner confirms, then returns to their list', async () => {
    vi.mocked(deleteSubmissionAction).mockResolvedValueOnce({ success: true, data: { id: ID } });
    render(<SubmissionOwnerControls submissionId={ID} status="DRAFT" listed={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteSubmissionAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(vi.mocked(deleteSubmissionAction).mock.calls).toEqual([[{ submissionId: ID }]]);
    await waitFor(() => expect(mockRouter.push.mock.calls).toEqual([['/community/mine']]));
  });
});
