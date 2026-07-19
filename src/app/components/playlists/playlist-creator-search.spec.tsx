/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRef } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { toast } from 'sonner';

import type {
  PlaylistActionResult,
  PlaylistItemPayload,
  PlaylistListRow,
  PlaylistSearchItem,
  PlaylistSearchResponse,
} from '@/lib/types/domain/playlist';
import type { AddPlaylistItemInput } from '@/lib/validation/playlist-schema';

import { PlaylistCreatorSearch, type PlaylistCreatorSearchHandle } from './playlist-creator-search';

const searchQueryMock = vi.hoisted(() => vi.fn());
const playlistsQueryMock = vi.hoisted(() => vi.fn());
const addPlaylistItemAsyncMock = vi.hoisted(() =>
  vi.fn<
    (input: AddPlaylistItemInput) => Promise<PlaylistActionResult<{ item: PlaylistItemPayload }>>
  >()
);

vi.mock('./_hooks/use-playlist-media-search-query', () => ({
  usePlaylistMediaSearchQuery: searchQueryMock,
}));

vi.mock('./_hooks/use-playlists-query', () => ({
  usePlaylistsQuery: playlistsQueryMock,
}));

vi.mock('./_hooks/mutations/use-playlist-mutations', () => ({
  useAddPlaylistItemMutation: () => ({
    addPlaylistItemAsync: addPlaylistItemAsyncMock,
    isAddingPlaylistItem: false,
  }),
}));

vi.mock('@/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T): T => value,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span data-src={props.src as string} data-testid="next-image" />
  ),
}));

const SONG: PlaylistSearchItem = {
  key: 'track:tf-1',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 125,
  source: { trackFileId: 'tf-1', releaseId: 'rel-1' },
};

const VIDEO: PlaylistSearchItem = {
  key: 'video:v-1',
  itemType: 'video',
  title: 'Live at the Fest',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 240,
  source: { videoId: 'v-1' },
  context: 'Official video',
};

const GROUPS: PlaylistSearchResponse = {
  groups: [
    { key: 'songs', label: 'Songs', items: [SONG] },
    { key: 'videos', label: 'Videos', items: [VIDEO] },
    { key: 'releases', label: 'Releases', items: [] },
  ],
};

const ROAD_TRIP: PlaylistListRow = {
  id: 'pl-1',
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 2,
  totalDuration: 300,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const ADDED_ITEM: PlaylistItemPayload = {
  id: 'item-1',
  itemType: 'track',
  sortOrder: 0,
  title: 'Cold Wind',
  artistName: 'Ceschi',
  duration: 125,
  available: true,
  trackFileId: 'tf-1',
  releaseId: 'rel-1',
  releaseTitle: null,
  videoId: null,
  coverArt: null,
  s3Key: null,
  streamUrl: null,
  posterUrl: null,
};

const SUCCESS_RESULT: PlaylistActionResult<{ item: PlaylistItemPayload }> = {
  success: true,
  data: { item: ADDED_ITEM },
};

const mockSearchReturn = ({
  isPending = false,
  data,
}: {
  isPending?: boolean;
  data?: PlaylistSearchResponse;
}): void => {
  searchQueryMock.mockReturnValue({
    isPending,
    error: new Error('Unknown error'),
    data,
    refetch: vi.fn(),
  });
};

beforeEach(() => {
  mockSearchReturn({ data: GROUPS });
  playlistsQueryMock.mockReturnValue({
    isPending: false,
    error: new Error('Unknown error'),
    rows: [ROAD_TRIP],
    nextSkip: null,
    loadMore: vi.fn(),
    isLoadingMore: false,
    refetch: vi.fn(),
  });
  addPlaylistItemAsyncMock.mockResolvedValue(SUCCESS_RESULT);
});

type SearchProps = Parameters<typeof PlaylistCreatorSearch>[0];

const renderSearch = (overrides: Partial<SearchProps> = {}) => {
  const props: SearchProps = { onAdd: vi.fn(), onNewPlaylist: vi.fn(), ...overrides };
  const view = render(<PlaylistCreatorSearch {...props} />);
  return { ...view, props };
};

const typeQuery = async (user: UserEvent): Promise<void> =>
  user.type(screen.getByPlaceholderText('Search songs and videos…'), 'ce');

const songRow = (): HTMLElement => screen.getByRole('option', { name: /Cold Wind/ });
const videoRow = (): HTMLElement => screen.getByRole('option', { name: /Live at the Fest/ });
const findPicker = (): HTMLElement | null => screen.queryByPlaceholderText('Find a playlist…');

const openPickerFor = async (user: UserEvent, row: HTMLElement): Promise<void> =>
  user.click(within(row).getByRole('button', { name: 'Add to another playlist' }));

describe('PlaylistCreatorSearch', () => {
  describe('empty states', () => {
    it('shows the hint line while the query is under two characters', () => {
      renderSearch();

      expect(screen.getByText('Search songs, videos, artists, releases…')).toBeInTheDocument();
    });

    it('does not show "No matches found." while the query is under two characters', () => {
      renderSearch();

      expect(screen.queryByText('No matches found.')).not.toBeInTheDocument();
    });

    it('renders no result rows while the query is under two characters', () => {
      renderSearch();

      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('shows "Searching…" while the first fetch for a query is in flight', async () => {
      const user = userEvent.setup();
      mockSearchReturn({ isPending: true });
      renderSearch();

      await typeQuery(user);

      expect(screen.getByText('Searching…')).toBeInTheDocument();
    });

    it('shows "No matches found." when a query returns zero groups', async () => {
      const user = userEvent.setup();
      mockSearchReturn({ data: { groups: [] } });
      renderSearch();

      await typeQuery(user);

      expect(screen.getByText('No matches found.')).toBeInTheDocument();
    });
  });

  describe('grouped results', () => {
    it('renders group headings in response order', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);

      const headings = screen.getAllByText(/^(Songs|Videos)$/);
      expect(headings.map((heading) => heading.textContent)).toEqual(['Songs', 'Videos']);
    });

    it('omits groups with no items', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);

      expect(screen.queryByText('Releases')).not.toBeInTheDocument();
    });

    it('renders one row per item across groups', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);

      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  describe('primary add', () => {
    it('fires onAdd with the item when its row is selected', async () => {
      const user = userEvent.setup();
      const { props } = renderSearch();

      await typeQuery(user);
      await user.click(songRow());

      expect(props.onAdd).toHaveBeenCalledTimes(1);
      expect(props.onAdd).toHaveBeenCalledWith(SONG);
    });
  });

  describe('new playlist from song', () => {
    it('fires onNewPlaylist with the item from the row button', async () => {
      const user = userEvent.setup();
      const { props } = renderSearch();

      await typeQuery(user);
      await user.click(
        within(songRow()).getByRole('button', { name: 'New playlist from this song' })
      );

      expect(props.onNewPlaylist).toHaveBeenCalledTimes(1);
      expect(props.onNewPlaylist).toHaveBeenCalledWith(SONG);
    });

    it('does not fire onAdd when the new-playlist button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderSearch();

      await typeQuery(user);
      await user.click(
        within(songRow()).getByRole('button', { name: 'New playlist from this song' })
      );

      expect(props.onAdd).not.toHaveBeenCalled();
    });
  });

  describe('picker toggling', () => {
    it('opens the inline playlist picker below the row', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());

      expect(findPicker()).toBeInTheDocument();
    });

    it('closes the picker when the same row button is clicked again', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await openPickerFor(user, songRow());

      expect(findPicker()).not.toBeInTheDocument();
    });

    it('keeps only one picker open at a time', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await openPickerFor(user, videoRow());

      expect(screen.getAllByPlaceholderText('Find a playlist…')).toHaveLength(1);
    });

    it("moves the picker to the last-toggled row's item", async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await openPickerFor(user, videoRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      await waitFor(() =>
        expect(addPlaylistItemAsyncMock).toHaveBeenCalledWith({
          itemType: 'video',
          videoId: 'v-1',
          playlistId: 'pl-1',
          force: false,
        })
      );
    });
  });

  describe('add to another playlist', () => {
    it('adds the item to the picked playlist and toasts the title', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added to Road Trip'));
      expect(addPlaylistItemAsyncMock).toHaveBeenCalledWith({
        itemType: 'track',
        trackFileId: 'tf-1',
        playlistId: 'pl-1',
        force: false,
      });
    });

    it('closes the picker after a successful add', async () => {
      const user = userEvent.setup();
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      await waitFor(() => expect(findPicker()).not.toBeInTheDocument());
    });

    it('toasts the error and keeps the picker open on a non-duplicate failure', async () => {
      const user = userEvent.setup();
      addPlaylistItemAsyncMock.mockResolvedValue({ success: false, error: 'UNAUTHORIZED' });
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('UNAUTHORIZED'));
      expect(findPicker()).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  describe('duplicate flow', () => {
    it('opens the duplicate confirm dialog naming the item on DUPLICATE_ITEM', async () => {
      const user = userEvent.setup();
      addPlaylistItemAsyncMock.mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' });
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/Cold Wind/)).toBeInTheDocument();
    });

    it('re-calls the mutation with force on confirm and toasts success', async () => {
      const user = userEvent.setup();
      addPlaylistItemAsyncMock
        .mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' })
        .mockResolvedValueOnce(SUCCESS_RESULT);
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));
      await user.click(await screen.findByRole('button', { name: 'Add again' }));

      await waitFor(() =>
        expect(addPlaylistItemAsyncMock).toHaveBeenCalledWith({
          itemType: 'track',
          trackFileId: 'tf-1',
          playlistId: 'pl-1',
          force: true,
        })
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added to Road Trip'));
    });

    it('closes the picker after a successful forced add', async () => {
      const user = userEvent.setup();
      addPlaylistItemAsyncMock
        .mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' })
        .mockResolvedValueOnce(SUCCESS_RESULT);
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));
      await user.click(await screen.findByRole('button', { name: 'Add again' }));

      await waitFor(() => expect(findPicker()).not.toBeInTheDocument());
    });

    it('toasts the error when the forced add still fails', async () => {
      const user = userEvent.setup();
      addPlaylistItemAsyncMock
        .mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' })
        .mockResolvedValueOnce({ success: false, error: 'PLAYLIST_FULL' });
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));
      await user.click(await screen.findByRole('button', { name: 'Add again' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('PLAYLIST_FULL'));
    });

    it('does not re-call the mutation when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      addPlaylistItemAsyncMock.mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' });
      renderSearch();

      await typeQuery(user);
      await openPickerFor(user, songRow());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(addPlaylistItemAsyncMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('imperative handle', () => {
    it('focuses the search input via ref.focus()', async () => {
      const ref = createRef<PlaylistCreatorSearchHandle>();
      render(<PlaylistCreatorSearch onAdd={vi.fn()} onNewPlaylist={vi.fn()} ref={ref} />);

      ref.current?.focus();

      await waitFor(() =>
        expect(screen.getByPlaceholderText('Search songs and videos…')).toHaveFocus()
      );
    });
  });
});
