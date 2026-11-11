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

const { mockToast, mockRouter } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
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
