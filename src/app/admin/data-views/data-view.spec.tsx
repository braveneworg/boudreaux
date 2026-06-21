/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentProps } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { ENTITIES } from '@/lib/constants';

import { DataView } from './data-view';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type DataViewProps = ComponentProps<typeof DataView>;

const okMutation = vi.fn(() => Promise.resolve({ success: true }));

/** Renders DataView for the `artist` entity with overridable, list-friendly defaults. */
const renderDataView = (overrides: Partial<DataViewProps> = {}) =>
  render(
    <DataView
      entity={ENTITIES.artist}
      data={{ artists: [] }}
      fieldsToShow={['firstName']}
      onPublishEntity={okMutation}
      onDeleteEntity={okMutation}
      onRestoreEntity={okMutation}
      refetch={vi.fn()}
      isPending={false}
      searchValue=""
      onSearchChange={vi.fn()}
      showPublished
      onShowPublishedChange={vi.fn()}
      showUnpublished
      onShowUnpublishedChange={vi.fn()}
      showDeleted={false}
      onShowDeletedChange={vi.fn()}
      {...overrides}
    />
  );

describe('DataView refresh overlay', () => {
  it('renders the overlay while the query is fetching', () => {
    renderDataView({ isFetching: true });
    expect(screen.getByTestId('data-view-overlay')).toBeInTheDocument();
  });

  it('does not render the overlay when the query is idle', () => {
    renderDataView({ isFetching: false });
    expect(screen.queryByTestId('data-view-overlay')).not.toBeInTheDocument();
  });

  it('keeps the underlying content mounted beneath the overlay while fetching', () => {
    renderDataView({ isFetching: true });
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('keeps the overlay hidden while paging in more items', () => {
    renderDataView({ isFetching: true, isFetchingNextPage: true, fetchNextPage: vi.fn() });
    expect(screen.queryByTestId('data-view-overlay')).not.toBeInTheDocument();
  });

  it('labels the overlay region for assistive technology', () => {
    renderDataView({ isFetching: true });
    expect(screen.getByRole('status', { name: 'Loading artists' })).toBeInTheDocument();
  });
});

describe('DataView create button', () => {
  it('shows the create button by default', () => {
    renderDataView();
    expect(screen.getByRole('button', { name: /create artist/i })).toBeInTheDocument();
  });

  it('hides the create button when canCreate is false', () => {
    renderDataView({ canCreate: false });
    expect(screen.queryByRole('button', { name: /create artist/i })).not.toBeInTheDocument();
  });
});

describe('DataView entity mutations', () => {
  const activeArtist = { id: 'a-1', firstName: 'Jane', displayName: 'Jane Doe', deletedOn: null };
  const deletedArtist = {
    id: 'a-2',
    firstName: 'Joe',
    displayName: 'Joe Doe',
    deletedOn: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

  it('publishes an entity via the injected callback and toasts success', async () => {
    const onPublishEntity = vi.fn(() => Promise.resolve({ success: true }));
    renderDataView({ data: { artists: [activeArtist] }, onPublishEntity });

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onPublishEntity).toHaveBeenCalledWith('a-1'));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Successfully published artist - Jane Doe'
    );
  });

  it('deletes an entity via the injected callback and toasts success', async () => {
    const onDeleteEntity = vi.fn(() => Promise.resolve({ success: true }));
    renderDataView({ data: { artists: [activeArtist] }, onDeleteEntity });

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onDeleteEntity).toHaveBeenCalledWith('a-1'));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Successfully deleted artist - Jane Doe');
  });

  it('toasts the error when a delete callback reports failure', async () => {
    const onDeleteEntity = vi.fn(() => Promise.resolve({ success: false, error: 'Boom' }));
    renderDataView({ data: { artists: [activeArtist] }, onDeleteEntity });

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete artist: Boom')
    );
  });

  it('toasts the underlying error message when a delete callback rejects', async () => {
    const onDeleteEntity = vi.fn(() => Promise.reject(new Error('network')));
    renderDataView({ data: { artists: [activeArtist] }, onDeleteEntity });

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete artist: network')
    );
  });

  it('toasts a generic error when a delete callback rejects with a non-Error', async () => {
    const onDeleteEntity = vi.fn(() => Promise.reject('boom'));
    renderDataView({ data: { artists: [activeArtist] }, onDeleteEntity });

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete artist: Unknown error')
    );
  });

  it('restores a soft-deleted entity via the injected callback', async () => {
    const onRestoreEntity = vi.fn(() => Promise.resolve({ success: true }));
    renderDataView({ data: { artists: [deletedArtist] }, onRestoreEntity });

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onRestoreEntity).toHaveBeenCalledWith('a-2'));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Successfully restored artist - Joe Doe');
  });
});
