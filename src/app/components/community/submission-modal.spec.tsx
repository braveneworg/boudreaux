/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useSubmissionQuery } from '@/hooks/queries/use-submission-query';
import type { SubmissionViewPayload } from '@/lib/types/domain/submission';

import { SubmissionModal } from './submission-modal';

const useIsMobileMock = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => useIsMobileMock() }));
vi.mock('@/hooks/queries/use-submission-query', () => ({ useSubmissionQuery: vi.fn() }));
vi.mock('./submission-view', () => ({
  SubmissionViewContent: ({
    view,
    reportable,
    titled,
  }: {
    view: SubmissionViewPayload;
    reportable?: boolean;
    titled?: boolean;
  }) => (
    <div
      data-testid="view"
      data-id={view.id}
      data-reportable={String(reportable)}
      data-titled={String(titled)}
    />
  ),
}));
vi.mock('./submission-view-beacon', () => ({
  SubmissionViewBeacon: ({ submissionId }: { submissionId: string }) => (
    <div data-testid="beacon" data-id={submissionId} />
  ),
}));

const ID = 'c'.repeat(24);

const payload = (overrides: Partial<SubmissionViewPayload> = {}): SubmissionViewPayload => ({
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>Poem</p>',
  links: [],
  listed: true,
  status: 'APPROVED',
  rejectionReason: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
  viewer: 'public',
  isPublic: true,
  queuePosition: null,
  attachments: [],
  ...overrides,
});

type QueryState = Partial<ReturnType<typeof useSubmissionQuery>>;

const refetch = vi.fn();

const answer = (state: QueryState): void => {
  vi.mocked(useSubmissionQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch,
    ...state,
  } as ReturnType<typeof useSubmissionQuery>);
};

const onClose = vi.fn();

const renderModal = (open = true, submissionId: string | null = ID) =>
  render(<SubmissionModal submissionId={submissionId} open={open} onClose={onClose} />);

beforeEach(() => {
  useIsMobileMock.mockReturnValue(false);
  onClose.mockReset();
  refetch.mockReset();
  answer({ data: payload() });
});

describe('SubmissionModal', () => {
  it('reads the submission it is asked to show', () => {
    renderModal();

    expect(vi.mocked(useSubmissionQuery).mock.calls.at(-1)).toEqual([ID]);
  });

  it('shows nothing while closed', () => {
    renderModal(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a dialog named by the submission’s title', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Bus poem' });
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('Bus poem');
  });

  it('names an untitled submission as untitled', () => {
    answer({ data: payload({ title: '' }) });

    renderModal();

    expect(screen.getByRole('dialog', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('describes itself by who posted it and its category', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/^Shared by ada in Writings/);
  });

  it('describes a submission whose owner has no username', () => {
    answer({ data: payload({ owner: { username: null, gravatarHash: 'abc123' } }) });

    renderModal();

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/^Shared by A community member/);
  });

  it('shows the submission, offering the report, under its own title', () => {
    renderModal();

    const view = screen.getByTestId('view');
    expect(view).toHaveAttribute('data-id', ID);
    expect(view).toHaveAttribute('data-reportable', 'true');
    expect(view).toHaveAttribute('data-titled', 'false');
  });

  it('is a drawer on a phone', () => {
    useIsMobileMock.mockReturnValue(true);

    renderModal();

    expect(screen.getByRole('dialog', { name: 'Bus poem' })).toHaveAttribute(
      'data-slot',
      'drawer-content'
    );
  });

  it('is a dialog on a wider screen', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Bus poem' })).toHaveAttribute(
      'data-slot',
      'dialog-content'
    );
  });

  it('asks for the opening to be counted when a member of the public opens a public submission', () => {
    renderModal();

    expect(screen.getByTestId('beacon')).toHaveAttribute('data-id', ID);
  });

  it.each(['owner', 'approver'] as const)('asks for no count for the %s', (viewer) => {
    answer({ data: payload({ viewer }) });

    renderModal();

    expect(screen.queryByTestId('beacon')).not.toBeInTheDocument();
  });

  it('asks for no count on a submission the public cannot open', () => {
    answer({ data: payload({ isPublic: false }) });

    renderModal();

    expect(screen.queryByTestId('beacon')).not.toBeInTheDocument();
  });

  it('says it is loading until the submission arrives', () => {
    answer({ isPending: true });

    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Loading submission' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading submission…');
    expect(screen.queryByTestId('view')).not.toBeInTheDocument();
  });

  it('says so, without a reason, when the reader may not open it', () => {
    answer({ data: null });

    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Not available' });
    expect(dialog).toHaveTextContent(
      'This submission is not available. It may have been taken down, or you may need to sign in to see it.'
    );
    expect(screen.queryByTestId('view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beacon')).not.toBeInTheDocument();
  });

  it('offers another try when the read failed', async () => {
    const user = userEvent.setup();
    answer({ isError: true });
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Could not load' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Unable to load this submission.');
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('reports a close to its host, and leaves the closing to it', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks its host where focus goes once it has closed', async () => {
    const onCloseAutoFocus = vi.fn();
    const { rerender } = render(
      <SubmissionModal
        submissionId={ID}
        open
        onClose={onClose}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );

    rerender(
      <SubmissionModal
        submissionId={ID}
        open={false}
        onClose={onClose}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );

    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
