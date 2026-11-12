/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { removeAttachmentAction } from '@/lib/actions/submission-attachment-actions';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import type { AttachmentView, ConfirmedAttachment } from '@/lib/types/domain/submission-attachment';

import { SubmissionAttachments } from './submission-attachments';

import type { PendingUpload } from './use-attachment-uploads';

const { mockToast, mockRouter, mockRefetch, uploads, query } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { refresh: vi.fn() },
  mockRefetch: vi.fn(),
  uploads: {
    list: [] as PendingUpload[],
    notice: '',
    add: vi.fn(),
    dismiss: vi.fn(),
    onConfirmed: undefined as ((confirmed: ConfirmedAttachment) => void) | undefined,
  },
  query: { data: undefined as { status: string; attachments: AttachmentView[] } | undefined },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@/lib/actions/submission-attachment-actions', () => ({
  removeAttachmentAction: vi.fn(),
}));
vi.mock('./use-submission-attachments-query', () => ({
  useSubmissionAttachmentsQuery: () => ({ data: query.data, refetch: mockRefetch }),
}));
vi.mock('./use-attachment-uploads', () => ({
  useAttachmentUploads: ({
    onConfirmed,
  }: {
    onConfirmed: (confirmed: ConfirmedAttachment) => void;
  }) => {
    uploads.onConfirmed = onConfirmed;

    return {
      uploads: uploads.list,
      notice: uploads.notice,
      add: uploads.add,
      dismiss: uploads.dismiss,
    };
  },
}));

const SUBMISSION_ID = 'c'.repeat(24);
const UPDATED = '2026-11-11T12:00:00.000Z';

const attachment = (overrides: Partial<AttachmentView> = {}): AttachmentView => ({
  id: 'e'.repeat(24),
  kind: 'IMAGE',
  fileName: 'show.jpg',
  state: 'ready',
  error: null,
  progress: null,
  url: 'https://signed.example/copy.jpg',
  cardUrl: 'https://signed.example/card.webp',
  posterUrl: null,
  width: 1200,
  height: 800,
  durationSeconds: null,
  ...overrides,
});

const renderSection = (attachments: AttachmentView[] = [], status: SubmissionStatus = 'DRAFT') => {
  query.data = { status, attachments };

  return render(
    <SubmissionAttachments
      submissionId={SUBMISSION_ID}
      status={status}
      updatedAt={UPDATED}
      initialAttachments={attachments}
    />
  );
};

const picker = (): HTMLInputElement => screen.getByLabelText('Add attachments');
const photo = (): File => new File(['x'], 'new.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  uploads.list = [];
  uploads.notice = '';
  uploads.add.mockReset();
  uploads.dismiss.mockReset();
  mockRefetch.mockReset();
  mockRouter.refresh.mockReset();
  mockToast.error.mockReset();
  vi.mocked(removeAttachmentAction)
    .mockReset()
    .mockResolvedValue({ success: true, data: { status: 'DRAFT' } });
});

describe('SubmissionAttachments', () => {
  it('says what can be attached and how many', () => {
    renderSection();

    expect(
      screen.getByText(
        'Photos, audio and video. Up to 10 files, re-encoded before anyone sees them.'
      )
    ).toBeInTheDocument();
  });

  it('marks the section hydrated, so a test never sets a file too early', () => {
    renderSection();

    expect(screen.getByRole('group', { name: 'Attachments' })).toHaveAttribute(
      'data-hydrated',
      'true'
    );
  });

  it('starts uploading the files that were picked', async () => {
    const file = photo();
    renderSection();

    await userEvent.upload(picker(), file);

    expect(uploads.add.mock.calls).toEqual([[[file]]]);
  });

  it('lists a ready attachment by its file name', () => {
    renderSection([attachment()]);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('show.jpg')).toBeInTheDocument();
    expect(within(row).getByText('Ready')).toBeInTheDocument();
  });

  it('shows a processing attachment’s stage and how far through it is', () => {
    renderSection([
      attachment({
        state: 'processing',
        url: null,
        cardUrl: null,
        progress: { stage: 'encoding', percent: 40, at: UPDATED },
      }),
    ]);

    expect(screen.getByRole('status')).toHaveTextContent('Processing: re-encoding, 40%');
  });

  it('shows a stage that reports no percentage without one', () => {
    renderSection([
      attachment({
        state: 'processing',
        url: null,
        cardUrl: null,
        progress: { stage: 'probing', at: UPDATED },
      }),
    ]);

    expect(screen.getByRole('status')).toHaveTextContent(/^Processing: checking the file$/);
  });

  it.each([
    ['IMAGE', 'photo.heic'],
    ['AUDIO', 'take.wav'],
    ['VIDEO', 'clip.mov'],
  ] as const)('lists a %s attachment that has no picture yet', (kind, fileName) => {
    renderSection([attachment({ kind, fileName, state: 'failed', cardUrl: null, error: 'No.' })]);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText(fileName)).toBeInTheDocument();
    expect(within(row).queryByRole('presentation')).not.toBeInTheDocument();
  });

  it('says a processing attachment is waiting before its first checkpoint', () => {
    renderSection([attachment({ state: 'processing', url: null, cardUrl: null })]);

    expect(screen.getByRole('status')).toHaveTextContent('Processing: waiting to start');
  });

  it('shows why an attachment failed', () => {
    renderSection([
      attachment({
        state: 'failed',
        url: null,
        cardUrl: null,
        error: "We couldn't read this file. It may be damaged.",
      }),
    ]);

    expect(screen.getByText("We couldn't read this file. It may be damaged.")).toBeInTheDocument();
  });

  it('will not remove an attachment while it is processing', () => {
    renderSection([attachment({ state: 'processing', url: null, cardUrl: null })]);

    expect(screen.getByRole('button', { name: 'Remove show.jpg' })).toBeDisabled();
  });

  it('removes an attachment and reads the list again', async () => {
    renderSection([attachment()]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove show.jpg' }));

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    expect(vi.mocked(removeAttachmentAction).mock.calls).toEqual([
      [{ attachmentId: 'e'.repeat(24) }],
    ]);
  });

  it('says why a removal was refused', async () => {
    vi.mocked(removeAttachmentAction).mockResolvedValueOnce({
      success: false,
      error: 'A published submission needs something to show.',
      code: 'INVALID_INPUT',
    });
    renderSection([attachment()]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove show.jpg' }));

    await waitFor(() =>
      expect(mockToast.error.mock.calls).toEqual([
        ['A published submission needs something to show.'],
      ])
    );
  });

  it('says a removal failed when the server gave no reason', async () => {
    vi.mocked(removeAttachmentAction).mockResolvedValueOnce({
      success: false,
      error: '',
      code: 'UNKNOWN',
    });
    renderSection([attachment()]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove show.jpg' }));

    await waitFor(() =>
      expect(mockToast.error.mock.calls).toEqual([
        ['We could not remove that attachment. Please try again.'],
      ])
    );
  });

  it('lists a file that is uploading, with its progress', () => {
    uploads.list = [{ localId: 'u1', fileName: 'clip.mov', fraction: 0.4, error: null }];
    renderSection();

    expect(screen.getByText('clip.mov')).toBeInTheDocument();
    expect(screen.getByText('Uploading, 40%')).toBeInTheDocument();
  });

  it('cancels a file that is uploading', async () => {
    uploads.list = [{ localId: 'u1', fileName: 'clip.mov', fraction: 0.4, error: null }];
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel clip.mov' }));

    expect(uploads.dismiss.mock.calls).toEqual([['u1']]);
  });

  it('shows why a file was refused, and clears it', async () => {
    uploads.list = [
      { localId: 'u1', fileName: 'zine.pdf', fraction: 0, error: 'That kind is not accepted.' },
    ];
    renderSection();

    expect(screen.getByText('That kind is not accepted.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss zine.pdf' }));

    expect(uploads.dismiss.mock.calls).toEqual([['u1']]);
  });

  it('shows a notice about the batch as a whole', () => {
    uploads.notice = 'A submission can have 10 attachments. Remove one to add another.';
    renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent('A submission can have 10 attachments.');
  });

  it('reads the list again once an upload is confirmed', () => {
    renderSection();

    uploads.onConfirmed?.({ attachmentId: 'f'.repeat(24), status: 'DRAFT' });

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('refreshes the page when a confirmed upload moved the submission to another state', () => {
    renderSection([attachment()], 'APPROVED');

    uploads.onConfirmed?.({ attachmentId: 'f'.repeat(24), status: 'AWAITING_APPROVAL' });

    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it('leaves the page alone when the state did not change', () => {
    renderSection();

    uploads.onConfirmed?.({ attachmentId: 'f'.repeat(24), status: 'DRAFT' });

    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  describe('on an approved submission', () => {
    it('warns before an upload, and uploads nothing yet', async () => {
      renderSection([attachment()], 'APPROVED');

      await userEvent.upload(picker(), photo());

      expect(
        screen.getByText(
          'Adding or removing an attachment takes this offline until it is approved again.'
        )
      ).toBeInTheDocument();
      expect(uploads.add).not.toHaveBeenCalled();
    });

    it('uploads once the owner confirms', async () => {
      const file = photo();
      renderSection([attachment()], 'APPROVED');
      await userEvent.upload(picker(), file);

      await userEvent.click(screen.getByRole('button', { name: 'Take it offline' }));

      expect(uploads.add.mock.calls).toEqual([[[file]]]);
    });

    it('uploads nothing when the owner keeps it as it is', async () => {
      renderSection([attachment()], 'APPROVED');
      await userEvent.upload(picker(), photo());

      await userEvent.click(screen.getByRole('button', { name: 'Keep it as it is' }));

      expect(uploads.add).not.toHaveBeenCalled();
    });

    it('warns before a removal, and removes nothing yet', async () => {
      renderSection([attachment()], 'APPROVED');

      await userEvent.click(screen.getByRole('button', { name: 'Remove show.jpg' }));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(removeAttachmentAction).not.toHaveBeenCalled();
    });

    it('removes once the owner confirms, and refreshes the page', async () => {
      vi.mocked(removeAttachmentAction).mockResolvedValueOnce({
        success: true,
        data: { status: 'AWAITING_APPROVAL' },
      });
      renderSection([attachment()], 'APPROVED');
      await userEvent.click(screen.getByRole('button', { name: 'Remove show.jpg' }));

      await userEvent.click(screen.getByRole('button', { name: 'Take it offline' }));

      await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    });
  });
});
