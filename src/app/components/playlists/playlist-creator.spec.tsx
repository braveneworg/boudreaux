/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRef, useImperativeHandle, useRef, type Ref } from 'react';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import type {
  PlaylistActionResult,
  PlaylistDetailResponse,
  PlaylistItemPayload,
  PlaylistItemSourceRef,
  PlaylistSearchItem,
} from '@/lib/types/domain/playlist';
import type {
  AddPlaylistItemInput,
  ReorderPlaylistItemsInput,
} from '@/lib/validation/playlist-schema';

import { PlaylistCreator, type PlaylistCreatorHandle } from './playlist-creator';

import type { PlaylistCreatorItemData } from './playlist-creator-item';
import type { PlaylistCreatorSearchHandle } from './playlist-creator-search';

interface SearchStubProps {
  onAdd: (item: PlaylistSearchItem) => void;
  onNewPlaylist: (item: PlaylistSearchItem) => void;
  ref?: Ref<PlaylistCreatorSearchHandle>;
}

interface SaveDialogStubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  playlistId: string | null;
  initialValues: { title: string; isPublic: boolean; coverImages: string[] };
  pendingItemRefs: PlaylistItemSourceRef[];
  availableArtistImages: string[];
  onSaved: (playlist: PlaylistDetailResponse) => void;
  onAddSongs?: () => void;
}

interface ListStubProps {
  items: PlaylistCreatorItemData[];
  onReorder: (orderedIds: string[]) => void;
  onRemove: (id: string) => void;
}

const playlistQueryMock = vi.hoisted(() => vi.fn());
const addPlaylistItemAsyncMock = vi.hoisted(() =>
  vi.fn<
    (input: AddPlaylistItemInput) => Promise<PlaylistActionResult<{ item: PlaylistItemPayload }>>
  >()
);
const removePlaylistItemMock = vi.hoisted(() =>
  vi.fn<
    (
      input: { playlistId: string; itemId: string },
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => void
  >()
);
const reorderPlaylistItemsMock = vi.hoisted(() =>
  vi.fn<
    (input: ReorderPlaylistItemsInput, options?: { onError?: (error: Error) => void }) => void
  >()
);
const capturedSearch = vi.hoisted(() => ({ current: null as SearchStubProps | null }));
const capturedSaveDialog = vi.hoisted(() => ({ current: null as SaveDialogStubProps | null }));
const capturedList = vi.hoisted(() => ({ current: null as ListStubProps | null }));

vi.mock('./playlist-creator-search', () => ({
  PlaylistCreatorSearch: (props: SearchStubProps) => {
    capturedSearch.current = props;
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(props.ref, () => ({ focus: () => inputRef.current?.focus() }), []);
    return <input ref={inputRef} aria-label="mock search" />;
  },
}));

vi.mock('./playlist-save-dialog', () => ({
  PlaylistSaveDialog: (props: SaveDialogStubProps) => {
    capturedSaveDialog.current = props;
    return (
      <div
        data-testid="save-dialog"
        data-mode={props.mode}
        data-title={props.initialValues.title}
      />
    );
  },
}));

vi.mock('./playlist-creator-item-list', () => ({
  PlaylistCreatorItemList: (props: ListStubProps) => {
    capturedList.current = props;
    return (
      <ul data-testid="item-list">
        {props.items.map((row) => (
          <li key={row.id}>{row.title}</li>
        ))}
      </ul>
    );
  },
}));

vi.mock('@/hooks/use-playlist-query', () => ({
  usePlaylistQuery: playlistQueryMock,
}));

vi.mock('@/hooks/use-playlist-mutations', () => ({
  useAddPlaylistItemMutation: () => ({
    addPlaylistItemAsync: addPlaylistItemAsyncMock,
    isAddingPlaylistItem: false,
  }),
  useRemovePlaylistItemMutation: () => ({
    removePlaylistItem: removePlaylistItemMock,
    isRemovingPlaylistItem: false,
  }),
  useReorderPlaylistItemsMutation: () => ({
    reorderPlaylistItems: reorderPlaylistItemsMock,
    isReorderingPlaylistItems: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const SONG: PlaylistSearchItem = {
  key: 'track:tf-1',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: 'https://cdn.example/cover-1.jpg',
  duration: 125,
  source: { trackFileId: 'tf-1', releaseId: 'rel-1' },
};

const SONG_SAME_COVER: PlaylistSearchItem = {
  key: 'track:tf-2',
  itemType: 'track',
  title: 'Warm Rain',
  artistName: 'Ceschi',
  coverArt: 'https://cdn.example/cover-1.jpg',
  duration: 140,
  source: { trackFileId: 'tf-2', releaseId: 'rel-1' },
};

const VIDEO: PlaylistSearchItem = {
  key: 'video:v-1',
  itemType: 'video',
  title: 'Live at the Fest',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 240,
  source: { videoId: 'v-1' },
};

const detailItem = (overrides: Partial<PlaylistItemPayload>): PlaylistItemPayload => ({
  id: 'it-1',
  itemType: 'track',
  sortOrder: 0,
  title: 'First',
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
  ...overrides,
});

const DETAIL: PlaylistDetailResponse = {
  id: 'pl-1',
  title: 'Road Trip',
  isPublic: false,
  isOwner: true,
  coverImages: ['https://cdn.example/pl-cover.jpg'],
  itemCount: 2,
  totalDuration: 300,
  items: [
    detailItem({
      id: 'it-2',
      sortOrder: 1,
      title: 'Second',
      trackFileId: 'tf-2',
      itemType: 'video',
      videoId: 'v-9',
    }),
    detailItem({
      id: 'it-1',
      sortOrder: 0,
      title: 'First',
      coverArt: 'https://cdn.example/d1.jpg',
    }),
  ],
};

const queryReturn = ({
  isPending = false,
  data,
}: {
  isPending?: boolean;
  data?: PlaylistDetailResponse;
}) => ({ isPending, error: new Error('Unknown error'), data, refetch: vi.fn() });

type CreatorProps = Parameters<typeof PlaylistCreator>[0];

const renderCreator = (overrides: Partial<CreatorProps> = {}) => {
  const props: CreatorProps = { editPlaylistId: null, onEditHandled: vi.fn(), ...overrides };
  const view = render(<PlaylistCreator {...props} />);
  return { ...view, props };
};

const addSong = (item: PlaylistSearchItem = SONG): void => {
  act(() => capturedSearch.current?.onAdd(item));
};

const closeSaveDialog = (): void => {
  act(() => capturedSaveDialog.current?.onOpenChange(false));
};

const saveDialog = (): HTMLElement | null => screen.queryByTestId('save-dialog');

const listTitles = (): string[] => (capturedList.current?.items ?? []).map(({ title }) => title);

/** Draft add + save-dialog save — lands the creator in the saved phase for pl-1. */
const goToSaved = (): void => {
  playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));
  addSong(SONG);
  act(() => capturedSaveDialog.current?.onSaved(DETAIL));
};

beforeEach(() => {
  capturedSearch.current = null;
  capturedSaveDialog.current = null;
  capturedList.current = null;
  // The global `clearMocks` only clears calls — reset implementations too so
  // per-test `mockImplementation`s never leak across the shuffled test order.
  playlistQueryMock.mockReset();
  addPlaylistItemAsyncMock.mockReset();
  removePlaylistItemMock.mockReset();
  reorderPlaylistItemsMock.mockReset();
  playlistQueryMock.mockReturnValue(queryReturn({ isPending: true }));
  addPlaylistItemAsyncMock.mockResolvedValue({
    success: true,
    data: { item: detailItem({}) },
  });
});

describe('PlaylistCreator', () => {
  describe('draft phase', () => {
    it('shows the "New playlist" heading', () => {
      renderCreator();

      expect(screen.getByRole('heading', { name: 'New playlist' })).toBeInTheDocument();
    });

    it('stages an added item in the list', () => {
      renderCreator();

      addSong();

      expect(within(screen.getByTestId('item-list')).getByText('Cold Wind')).toBeInTheDocument();
    });

    it('opens the save dialog in create mode on the first add', () => {
      renderCreator();

      addSong();

      expect(saveDialog()).toHaveAttribute('data-mode', 'create');
    });

    it('passes the default initial values to the create dialog', () => {
      renderCreator();

      addSong();

      expect(capturedSaveDialog.current?.initialValues).toEqual({
        title: '',
        isPublic: false,
        coverImages: [],
      });
    });

    it('does not reopen the save dialog on later adds in the same draft session', () => {
      renderCreator();

      addSong();
      closeSaveDialog();
      addSong(VIDEO);

      expect(saveDialog()).not.toBeInTheDocument();
    });

    it('shows the "Unsaved" badge once the draft has items', () => {
      renderCreator();

      addSong();

      expect(screen.getByText('Unsaved')).toBeInTheDocument();
    });

    it('shows no "Unsaved" badge while the draft is empty', () => {
      renderCreator();

      expect(screen.queryByText('Unsaved')).not.toBeInTheDocument();
    });

    it('keeps the save dialog open when onOpenChange reports open', () => {
      renderCreator();

      addSong();
      act(() => capturedSaveDialog.current?.onOpenChange(true));

      expect(saveDialog()).toBeInTheDocument();
    });

    it('reopens the save dialog from the "Save playlist" button', async () => {
      const user = userEvent.setup();
      renderCreator();

      addSong();
      closeSaveDialog();
      await user.click(screen.getByRole('button', { name: 'Save playlist' }));

      expect(saveDialog()).toBeInTheDocument();
    });

    it('maps the pending items to source refs for the save dialog', () => {
      renderCreator();

      addSong(SONG);
      addSong(VIDEO);

      expect(capturedSaveDialog.current?.pendingItemRefs).toEqual([
        { itemType: 'track', trackFileId: 'tf-1' },
        { itemType: 'video', videoId: 'v-1' },
      ]);
    });

    it('dedupes the pending items cover arts for the save dialog', () => {
      renderCreator();

      addSong(SONG);
      addSong(SONG_SAME_COVER);
      addSong(VIDEO);

      expect(capturedSaveDialog.current?.availableArtistImages).toEqual([
        'https://cdn.example/cover-1.jpg',
      ]);
    });

    it('opens the duplicate confirm dialog when the same source is added twice', async () => {
      renderCreator();

      addSong(SONG);
      addSong(SONG);

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/Cold Wind/)).toBeInTheDocument();
    });

    it('stages the duplicate again when the confirm dialog is accepted', async () => {
      const user = userEvent.setup();
      renderCreator();

      addSong(SONG);
      addSong(SONG);
      await user.click(await screen.findByRole('button', { name: 'Add again' }));

      expect(listTitles()).toEqual(['Cold Wind', 'Cold Wind']);
    });

    it('does not stage the duplicate when the confirm dialog is cancelled', async () => {
      const user = userEvent.setup();
      renderCreator();

      addSong(SONG);
      addSong(SONG);
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(listTitles()).toEqual(['Cold Wind']);
    });
  });

  describe('saved phase', () => {
    it('shows the playlist title heading after saving', () => {
      renderCreator();

      goToSaved();

      expect(screen.getByRole('heading', { name: 'Road Trip' })).toBeInTheDocument();
    });

    it('closes the save dialog after saving', () => {
      renderCreator();

      goToSaved();

      expect(saveDialog()).not.toBeInTheDocument();
    });

    it('renders the detail items sorted by sortOrder', () => {
      renderCreator();

      goToSaved();

      expect(listTitles()).toEqual(['First', 'Second']);
    });

    it('delegates an add to the add-item mutation with the playlist id', async () => {
      renderCreator();

      goToSaved();
      addSong(VIDEO);

      await waitFor(() =>
        expect(addPlaylistItemAsyncMock).toHaveBeenCalledWith({
          itemType: 'video',
          videoId: 'v-1',
          playlistId: 'pl-1',
          force: false,
        })
      );
    });

    it('opens the duplicate confirm dialog on a DUPLICATE_ITEM result', async () => {
      renderCreator();

      goToSaved();
      addPlaylistItemAsyncMock.mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' });
      addSong(SONG);

      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/Cold Wind/)).toBeInTheDocument();
    });

    it('re-calls the mutation with force after the duplicate is confirmed', async () => {
      const user = userEvent.setup();
      renderCreator();

      goToSaved();
      addPlaylistItemAsyncMock.mockResolvedValueOnce({ success: false, error: 'DUPLICATE_ITEM' });
      addSong(SONG);
      await user.click(await screen.findByRole('button', { name: 'Add again' }));

      await waitFor(() =>
        expect(addPlaylistItemAsyncMock).toHaveBeenCalledWith({
          itemType: 'track',
          trackFileId: 'tf-1',
          playlistId: 'pl-1',
          force: true,
        })
      );
    });

    it('toasts the error for a non-duplicate add failure', async () => {
      renderCreator();

      goToSaved();
      addPlaylistItemAsyncMock.mockResolvedValueOnce({ success: false, error: 'PLAYLIST_FULL' });
      addSong(SONG);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('PLAYLIST_FULL'));
    });

    it('toasts a generic error when the add mutation rejects', async () => {
      renderCreator();

      goToSaved();
      addPlaylistItemAsyncMock.mockRejectedValueOnce(new Error('network down'));
      addSong(SONG);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to add to playlist'));
    });

    it('applies a reorder optimistically', () => {
      renderCreator();

      goToSaved();
      act(() => capturedList.current?.onReorder(['it-2', 'it-1']));

      expect(listTitles()).toEqual(['Second', 'First']);
    });

    it('sends the reorder mutation with the new item id order', () => {
      renderCreator();

      goToSaved();
      act(() => capturedList.current?.onReorder(['it-2', 'it-1']));

      expect(reorderPlaylistItemsMock).toHaveBeenCalledWith(
        { playlistId: 'pl-1', orderedItemIds: ['it-2', 'it-1'] },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });

    it('reverts the optimistic order and toasts when the reorder mutation fails', () => {
      reorderPlaylistItemsMock.mockImplementation((_input, options) =>
        options?.onError?.(new Error('REORDER_FAILED'))
      );
      renderCreator();

      goToSaved();
      act(() => capturedList.current?.onReorder(['it-2', 'it-1']));

      expect(listTitles()).toEqual(['First', 'Second']);
      expect(toast.error).toHaveBeenCalledWith('REORDER_FAILED');
    });

    it('sends the remove mutation with the playlist and item ids', () => {
      renderCreator();

      goToSaved();
      act(() => capturedList.current?.onRemove('it-1'));

      expect(removePlaylistItemMock).toHaveBeenCalledWith(
        { playlistId: 'pl-1', itemId: 'it-1' },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });

    it('drops the removed item from the list when the remove mutation succeeds', () => {
      removePlaylistItemMock.mockImplementation((_input, options) => options?.onSuccess?.());
      renderCreator();

      goToSaved();
      act(() => capturedList.current?.onRemove('it-1'));

      expect(listTitles()).toEqual(['Second']);
    });

    it('toasts when the remove mutation fails', () => {
      removePlaylistItemMock.mockImplementation((_input, options) =>
        options?.onError?.(new Error('REMOVE_FAILED'))
      );
      renderCreator();

      goToSaved();
      act(() => capturedList.current?.onRemove('it-1'));

      expect(toast.error).toHaveBeenCalledWith('REMOVE_FAILED');
    });

    it('opens the edit dialog from the pencil button with the detail values', async () => {
      const user = userEvent.setup();
      renderCreator();

      goToSaved();
      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));

      expect(saveDialog()).toHaveAttribute('data-mode', 'edit');
      expect(saveDialog()).toHaveAttribute('data-title', 'Road Trip');
    });

    it('offers the detail item cover arts as available artist images', async () => {
      const user = userEvent.setup();
      renderCreator();

      goToSaved();
      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));

      expect(capturedSaveDialog.current?.availableArtistImages).toEqual([
        'https://cdn.example/d1.jpg',
      ]);
    });

    it('starts a fresh seeded draft from onNewPlaylist', () => {
      renderCreator();

      goToSaved();
      act(() => capturedSearch.current?.onNewPlaylist(VIDEO));

      expect(screen.getByRole('heading', { name: 'New playlist' })).toBeInTheDocument();
      expect(listTitles()).toEqual(['Live at the Fest']);
      expect(saveDialog()).toHaveAttribute('data-mode', 'create');
    });
  });

  describe('editing phase', () => {
    it('does not mount the editing dialog until the detail is loaded', async () => {
      const user = userEvent.setup();
      renderCreator();

      goToSaved();
      playlistQueryMock.mockReturnValue(queryReturn({ isPending: true }));
      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));

      expect(saveDialog()).not.toBeInTheDocument();
    });

    it('mounts the editing dialog once the detail arrives', async () => {
      const user = userEvent.setup();
      const { rerender, props } = renderCreator();

      goToSaved();
      playlistQueryMock.mockReturnValue(queryReturn({ isPending: true }));
      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));
      playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));
      rerender(<PlaylistCreator {...props} />);

      expect(saveDialog()).toHaveAttribute('data-mode', 'edit');
    });

    it('closes the editing dialog and keeps the saved heading after onSaved', async () => {
      const user = userEvent.setup();
      renderCreator();

      goToSaved();
      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));
      act(() => capturedSaveDialog.current?.onSaved(DETAIL));

      expect(saveDialog()).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Road Trip' })).toBeInTheDocument();
    });

    it('refocuses the search after onAddSongs', async () => {
      const user = userEvent.setup();
      renderCreator();

      goToSaved();
      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));
      act(() => capturedSaveDialog.current?.onAddSongs?.());

      await waitFor(() => expect(screen.getByLabelText('mock search')).toHaveFocus());
    });
  });

  describe('edit param', () => {
    it('enables the detail query for the edit id', () => {
      playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));

      renderCreator({ editPlaylistId: 'pl-1' });

      expect(playlistQueryMock).toHaveBeenCalledWith(
        'pl-1',
        expect.objectContaining({ enabled: true })
      );
    });

    it('opens the edit dialog when the edit param detail arrives', async () => {
      playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));

      renderCreator({ editPlaylistId: 'pl-1' });

      await waitFor(() => expect(saveDialog()).toHaveAttribute('data-mode', 'edit'));
      expect(saveDialog()).toHaveAttribute('data-title', 'Road Trip');
    });

    it('notifies onEditHandled after loading the edit target', async () => {
      playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));

      const { props } = renderCreator({ editPlaylistId: 'pl-1' });

      await waitFor(() => expect(props.onEditHandled).toHaveBeenCalledTimes(1));
    });

    it('handles the edit param only once per id', async () => {
      playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));
      const { rerender, props } = renderCreator({ editPlaylistId: 'pl-1' });

      await waitFor(() => expect(props.onEditHandled).toHaveBeenCalled());
      rerender(<PlaylistCreator {...props} />);

      expect(props.onEditHandled).toHaveBeenCalledTimes(1);
    });

    it('does not re-handle a consumed edit id when the effect re-runs', async () => {
      playlistQueryMock.mockReturnValue(queryReturn({ data: DETAIL }));
      const { rerender, props } = renderCreator({ editPlaylistId: 'pl-1' });
      await waitFor(() => expect(props.onEditHandled).toHaveBeenCalled());

      const nextOnEditHandled = vi.fn();
      rerender(<PlaylistCreator editPlaylistId="pl-1" onEditHandled={nextOnEditHandled} />);

      expect(nextOnEditHandled).not.toHaveBeenCalled();
    });

    it('waits without acking while the edit detail is still loading', () => {
      playlistQueryMock.mockReturnValue(queryReturn({ isPending: true }));

      const { props } = renderCreator({ editPlaylistId: 'pl-1' });

      expect(props.onEditHandled).not.toHaveBeenCalled();
    });

    it('toasts and hands back the edit param when the detail query fails', async () => {
      playlistQueryMock.mockReturnValue(queryReturn({ isPending: false }));

      const { props } = renderCreator({ editPlaylistId: 'pl-9' });

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load playlist'));
      expect(props.onEditHandled).toHaveBeenCalledTimes(1);
    });

    it('leaves the draft untouched when the edit param query fails', async () => {
      playlistQueryMock.mockReturnValue(queryReturn({ isPending: false }));

      const { props } = renderCreator({ editPlaylistId: 'pl-9' });

      await waitFor(() => expect(props.onEditHandled).toHaveBeenCalled());
      expect(saveDialog()).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'New playlist' })).toBeInTheDocument();
    });
  });

  describe('imperative handle', () => {
    it('focuses the search input via focusSearch()', async () => {
      const ref = createRef<PlaylistCreatorHandle>();
      render(<PlaylistCreator editPlaylistId={null} onEditHandled={vi.fn()} ref={ref} />);

      act(() => ref.current?.focusSearch());

      await waitFor(() => expect(screen.getByLabelText('mock search')).toHaveFocus());
    });
  });
});
