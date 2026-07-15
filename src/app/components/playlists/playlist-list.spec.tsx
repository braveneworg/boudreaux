/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import type { PlaylistListRow, PlaylistsResponse } from '@/lib/types/domain/playlist';

import { PlaylistList } from './playlist-list';

const usePlaylistsQueryMock = vi.hoisted(() => vi.fn());

interface DeleteMutateOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

const deletePlaylistMock = vi.hoisted(() =>
  vi.fn<(input: { playlistId: string }, options?: DeleteMutateOptions) => void>()
);

vi.mock('@/hooks/use-playlists-query', () => ({
  usePlaylistsQuery: usePlaylistsQueryMock,
}));

vi.mock('@/hooks/use-playlist-mutations', () => ({
  useDeletePlaylistMutation: () => ({ deletePlaylist: deletePlaylistMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

interface RowStubProps {
  row: PlaylistListRow;
  onEdit: () => void;
  onPlay: () => void;
  onDelete: () => void;
}

vi.mock('./playlist-row', () => ({
  PlaylistRow: ({ row, onEdit, onPlay, onDelete }: RowStubProps) => (
    <li data-testid="playlist-row">
      <span>{row.title}</span>
      <button type="button" onClick={onPlay}>{`stub-play-${row.id}`}</button>
      <button type="button" onClick={onEdit}>{`stub-edit-${row.id}`}</button>
      <button type="button" onClick={onDelete}>{`stub-delete-${row.id}`}</button>
    </li>
  ),
}));

const makeRow = (id: string, title: string): PlaylistListRow => ({
  id,
  title,
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const ROAD_TRIP = makeRow('pl-1', 'Road Trip');
const CHILL_MIX = makeRow('pl-2', 'Chill Mix');

const mockQueryState = ({
  isPending = false,
  data,
}: {
  isPending?: boolean;
  data?: PlaylistsResponse;
}): void => {
  usePlaylistsQueryMock.mockReturnValue({
    isPending,
    error: new Error('Unknown error'),
    data,
    refetch: vi.fn(),
  });
};

const mockRows = (rows: PlaylistListRow[]): void =>
  mockQueryState({ data: { rows, nextSkip: null } });

type ListProps = Parameters<typeof PlaylistList>[0];

const renderList = (overrides: Partial<ListProps> = {}) => {
  const props: ListProps = {
    onEdit: vi.fn(),
    onPlay: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaylistList {...props} />), props };
};

const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

const lastDeleteOptions = (): DeleteMutateOptions | undefined =>
  deletePlaylistMock.mock.calls.at(0)?.[1];

describe('PlaylistList', () => {
  describe('loading state', () => {
    it('renders three skeleton rows while the query is pending', () => {
      mockQueryState({ isPending: true });
      renderList();

      expect(screen.getAllByTestId('playlist-row-skeleton')).toHaveLength(3);
    });
  });

  describe('error state', () => {
    it('renders a muted error line when the query settles without data', () => {
      mockQueryState({});
      renderList();

      expect(screen.getByText("Couldn't load playlists.")).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders the empty-state copy when the user has no playlists', () => {
      mockRows([]);
      renderList();

      expect(
        screen.getByText('No playlists yet — build one with the creator.')
      ).toBeInTheDocument();
    });
  });

  describe('rows', () => {
    it('renders one row per playlist', () => {
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderList();

      expect(screen.getAllByTestId('playlist-row')).toHaveLength(2);
    });

    it('renders the rows inside a semantic list', () => {
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderList();

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('composes className onto the list element', () => {
      mockRows([ROAD_TRIP]);
      renderList({ className: 'custom-list' });

      expect(screen.getByRole('list')).toHaveClass('custom-list');
    });

    it('calls onPlay with the clicked row id', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      const { props } = renderList();

      await user.click(screen.getByRole('button', { name: 'stub-play-pl-2' }));

      expect(props.onPlay).toHaveBeenCalledWith('pl-2');
    });

    it('calls onEdit with the clicked row id', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      const { props } = renderList();

      await user.click(screen.getByRole('button', { name: 'stub-edit-pl-2' }));

      expect(props.onEdit).toHaveBeenCalledWith('pl-2');
    });
  });

  describe('delete flow', () => {
    it('fires the delete mutation with the row playlistId', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderList();

      await user.click(screen.getByRole('button', { name: 'stub-delete-pl-1' }));

      expect(deletePlaylistMock).toHaveBeenCalledWith(
        { playlistId: 'pl-1' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('toasts success when the delete mutation succeeds', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP]);
      renderList();

      await user.click(screen.getByRole('button', { name: 'stub-delete-pl-1' }));
      lastDeleteOptions()?.onSuccess?.();

      expect(toastSuccessMock).toHaveBeenCalledWith('Playlist deleted');
    });

    it('toasts the error message when the delete mutation fails', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP]);
      renderList();

      await user.click(screen.getByRole('button', { name: 'stub-delete-pl-1' }));
      lastDeleteOptions()?.onError?.(new Error('Delete failed'));

      expect(toastErrorMock).toHaveBeenCalledWith('Delete failed');
    });
  });
});
