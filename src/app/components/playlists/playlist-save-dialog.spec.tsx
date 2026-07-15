/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ComponentProps } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { createPlaylistAction, updatePlaylistAction } from '@/lib/actions/playlist-actions';
import { queryKeys } from '@/lib/query-keys';
import type { PlaylistDetailResponse, PlaylistItemSourceRef } from '@/lib/types/domain/playlist';
import { playlistTitleSchema } from '@/lib/validation/playlist-schema';

import { PlaylistSaveDialog } from './playlist-save-dialog';

const uploadFilesMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const setQueryDataMock = vi.hoisted(() => vi.fn());
const ARTIST_IMAGE_URL = vi.hoisted(() => 'https://cdn.example.com/artist-1.jpg');

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  }),
}));

vi.mock('@/lib/actions/playlist-actions', () => ({
  createPlaylistAction: vi.fn(),
  updatePlaylistAction: vi.fn(),
  generatePlaylistCoverUploadUrlsAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./use-playlist-cover-upload', () => ({
  usePlaylistCoverUpload: () => ({
    uploadFiles: uploadFilesMock,
    isUploading: false,
    error: null,
  }),
}));

interface FieldStubProps {
  value: string[];
  onChange: (value: string[]) => void;
  playlistId: string | null;
  availableArtistImages: string[];
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
}

vi.mock('./playlist-cover-art-field', () => ({
  PlaylistCoverArtField: ({
    value,
    onChange,
    playlistId,
    availableArtistImages,
    pendingFiles,
    onPendingFilesChange,
  }: FieldStubProps) => (
    <div
      data-testid="cover-art-field"
      data-playlist-id={playlistId ?? 'none'}
      data-artist-images={availableArtistImages.join('|')}
      data-pending-count={pendingFiles.length}
    >
      <button type="button" onClick={() => onChange([...value, ARTIST_IMAGE_URL])}>
        stub-select-artist-image
      </button>
      <button
        type="button"
        onClick={() =>
          onPendingFilesChange([
            ...pendingFiles,
            new File(['x'], `pending-${pendingFiles.length + 1}.jpg`, { type: 'image/jpeg' }),
          ])
        }
      >
        stub-add-pending-file
      </button>
    </div>
  ),
}));

const CREATED_ID = '507f191e810c19729de860ea';
const PLAYLIST_ID = '507f191e810c19729de860ec';
const UPLOADED_URL = 'https://cdn.example.com/uploaded-1.jpg';

const CREATED: PlaylistDetailResponse = {
  id: CREATED_ID,
  title: 'Road Trip',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 1,
  totalDuration: 180,
  items: [],
};

const UPDATED: PlaylistDetailResponse = { ...CREATED, coverImages: [UPLOADED_URL] };

const PENDING_REFS: PlaylistItemSourceRef[] = [
  { itemType: 'track', trackFileId: '507f191e810c19729de860eb' },
];

const emptyTitleParse = playlistTitleSchema.safeParse('');
const EMPTY_TITLE_MESSAGE = emptyTitleParse.success
  ? ''
  : (emptyTitleParse.error.issues.at(0)?.message ?? '');

const createActionMock = vi.mocked(createPlaylistAction);
const updateActionMock = vi.mocked(updatePlaylistAction);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

const callSequence: string[] = [];

type DialogProps = ComponentProps<typeof PlaylistSaveDialog>;
type User = ReturnType<typeof userEvent.setup>;

const renderDialog = (overrides: Partial<DialogProps> = {}) => {
  const props: DialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    mode: 'create',
    playlistId: null,
    initialValues: { title: '', isPublic: false, coverImages: [] },
    pendingItemRefs: [],
    availableArtistImages: [],
    onSaved: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaylistSaveDialog {...props} />), props };
};

const VALID_INITIAL_VALUES: DialogProps['initialValues'] = {
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
};

const clickSave = async (user: User): Promise<void> =>
  user.click(screen.getByRole('button', { name: 'Save' }));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T,>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  callSequence.length = 0;
  createActionMock.mockImplementation(async () => {
    callSequence.push('create');
    return { success: true, data: CREATED };
  });
  updateActionMock.mockImplementation(async () => {
    callSequence.push('update');
    return { success: true, data: UPDATED };
  });
  uploadFilesMock.mockImplementation(async () => {
    callSequence.push('upload');
    return [UPLOADED_URL];
  });
});

describe('PlaylistSaveDialog', () => {
  describe('rendering', () => {
    it('renders a dialog titled "New playlist" in create mode', () => {
      renderDialog();

      expect(screen.getByRole('dialog', { name: 'New playlist' })).toBeInTheDocument();
    });

    it('renders a dialog titled "Edit playlist" in edit mode', () => {
      renderDialog({ mode: 'edit', playlistId: PLAYLIST_ID });

      expect(screen.getByRole('dialog', { name: 'Edit playlist' })).toBeInTheDocument();
    });

    it('prefills the title and public switch from initialValues', () => {
      renderDialog({
        mode: 'edit',
        playlistId: PLAYLIST_ID,
        initialValues: { title: 'Mixtape', isPublic: true, coverImages: [] },
      });

      expect(screen.getByLabelText('Title')).toHaveValue('Mixtape');
      expect(screen.getByRole('switch', { name: 'Public playlist' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    });

    it('passes the playlist id and artist images through to the cover art field', () => {
      renderDialog({
        mode: 'edit',
        playlistId: PLAYLIST_ID,
        availableArtistImages: [ARTIST_IMAGE_URL],
      });

      const field = screen.getByTestId('cover-art-field');
      expect(field).toHaveAttribute('data-playlist-id', PLAYLIST_ID);
      expect(field).toHaveAttribute('data-artist-images', ARTIST_IMAGE_URL);
    });

    it('passes a null playlist id to the cover art field in create mode', () => {
      renderDialog();

      expect(screen.getByTestId('cover-art-field')).toHaveAttribute('data-playlist-id', 'none');
    });
  });

  describe('validation', () => {
    it('shows the title schema error when the title is empty', async () => {
      const user = userEvent.setup();
      renderDialog();

      await clickSave(user);

      expect(await screen.findByText(EMPTY_TITLE_MESSAGE)).toBeInTheDocument();
    });

    it('does not call the create action when the title is empty', async () => {
      const user = userEvent.setup();
      renderDialog();

      await clickSave(user);

      await screen.findByText(EMPTY_TITLE_MESSAGE);
      expect(createActionMock).not.toHaveBeenCalled();
    });
  });

  describe('public switch', () => {
    it('toggles on when clicked', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(screen.getByRole('switch', { name: 'Public playlist' }));

      expect(screen.getByRole('switch', { name: 'Public playlist' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    });
  });

  describe('create submit', () => {
    it('calls createPlaylistAction with the form values and pending item refs', async () => {
      const user = userEvent.setup();
      renderDialog({ pendingItemRefs: PENDING_REFS });

      await user.type(screen.getByLabelText('Title'), 'Road Trip');
      await user.click(screen.getByRole('switch', { name: 'Public playlist' }));
      await user.click(screen.getByRole('button', { name: 'stub-select-artist-image' }));
      await clickSave(user);

      await waitFor(() =>
        expect(createActionMock).toHaveBeenCalledWith({
          title: 'Road Trip',
          isPublic: true,
          coverImages: [ARTIST_IMAGE_URL],
          items: PENDING_REFS,
        })
      );
    });

    it('seeds the detail cache and invalidates only the listing', async () => {
      const user = userEvent.setup();
      renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await waitFor(() =>
        expect(setQueryDataMock).toHaveBeenCalledWith(
          queryKeys.playlists.detail(CREATED_ID),
          CREATED
        )
      );
      expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.mine(),
      });
    });

    it('toasts success, closes, and reports the created playlist', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(CREATED));
      expect(toastSuccessMock).toHaveBeenCalledWith('Playlist saved');
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('neither uploads nor updates when there are no pending files', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
      expect(uploadFilesMock).not.toHaveBeenCalled();
      expect(updateActionMock).not.toHaveBeenCalled();
    });
  });

  describe('create submit with pending files', () => {
    it('sequences create, upload, then update', async () => {
      const user = userEvent.setup();
      renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() => expect(callSequence).toEqual(['create', 'upload', 'update']));
    });

    it('uploads the pending files against the created playlist id', async () => {
      const user = userEvent.setup();
      renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() =>
        expect(uploadFilesMock).toHaveBeenCalledWith(CREATED_ID, [expect.any(File)])
      );
    });

    it('updates the created playlist with artist selections plus uploaded urls', async () => {
      const user = userEvent.setup();
      renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-select-artist-image' }));
      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() =>
        expect(updateActionMock).toHaveBeenCalledWith({
          playlistId: CREATED_ID,
          coverImages: [ARTIST_IMAGE_URL, UPLOADED_URL],
        })
      );
    });

    it('invalidates the detail cache after the cover update and reports the updated playlist', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(UPDATED));
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.detail(CREATED_ID),
      });
    });

    it('toasts an error but still completes the save when only some uploads succeed', async () => {
      const user = userEvent.setup();
      uploadFilesMock.mockResolvedValue([UPLOADED_URL]);
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(UPDATED));
      expect(toastErrorMock).toHaveBeenCalledWith('Some cover images failed to upload.');
      expect(toastSuccessMock).toHaveBeenCalledWith('Playlist saved');
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      expect(updateActionMock).toHaveBeenCalledWith({
        playlistId: CREATED_ID,
        coverImages: [UPLOADED_URL],
      });
    });

    it('skips the cover update and saves the created playlist when every upload fails', async () => {
      const user = userEvent.setup();
      uploadFilesMock.mockResolvedValue([]);
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(CREATED));
      expect(toastErrorMock).toHaveBeenCalledWith('Some cover images failed to upload.');
      expect(updateActionMock).not.toHaveBeenCalled();
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('saves the created playlist when the cover update itself fails', async () => {
      const user = userEvent.setup();
      updateActionMock.mockResolvedValue({
        success: false,
        error: 'Failed to update playlist',
      });
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'stub-add-pending-file' }));
      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(CREATED));
      expect(toastErrorMock).toHaveBeenCalledWith('Failed to update playlist');
      expect(toastSuccessMock).toHaveBeenCalledWith('Playlist saved');
    });
  });

  describe('failure paths', () => {
    it('maps a duplicate-title field error onto the title field', async () => {
      const user = userEvent.setup();
      createActionMock.mockResolvedValue({
        success: false,
        error: 'Invalid input',
        fieldErrors: { title: ['You already have a playlist with this title'] },
      });
      renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      expect(
        await screen.findByText('You already have a playlist with this title')
      ).toBeInTheDocument();
    });

    it('keeps the dialog open on a field error', async () => {
      const user = userEvent.setup();
      createActionMock.mockResolvedValue({
        success: false,
        error: 'Invalid input',
        fieldErrors: { title: ['You already have a playlist with this title'] },
      });
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await screen.findByText('You already have a playlist with this title');
      expect(props.onOpenChange).not.toHaveBeenCalled();
      expect(props.onSaved).not.toHaveBeenCalled();
      expect(toastSuccessMock).not.toHaveBeenCalled();
    });

    it('toasts the action error and re-enables Save on a non-field failure', async () => {
      const user = userEvent.setup();
      createActionMock.mockResolvedValue({
        success: false,
        error: 'Failed to create playlist',
      });
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Failed to create playlist'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      expect(props.onOpenChange).not.toHaveBeenCalled();
    });

    it('toasts the action error when field errors lack a title entry', async () => {
      const user = userEvent.setup();
      createActionMock.mockResolvedValue({
        success: false,
        error: 'Invalid input',
        fieldErrors: {},
      });
      renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Invalid input'));
    });

    it('toasts a generic error and stays open when the action rejects', async () => {
      const user = userEvent.setup();
      createActionMock.mockRejectedValue(new Error('network down'));
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Failed to save playlist'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      expect(props.onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('edit submit', () => {
    const editProps: Partial<DialogProps> = {
      mode: 'edit',
      playlistId: PLAYLIST_ID,
      initialValues: { title: 'Mixtape', isPublic: false, coverImages: ['existing.jpg'] },
    };

    it('calls updatePlaylistAction with the playlist id and form values', async () => {
      const user = userEvent.setup();
      renderDialog(editProps);

      await user.type(screen.getByLabelText('Title'), ' 2');
      await clickSave(user);

      await waitFor(() =>
        expect(updateActionMock).toHaveBeenCalledWith({
          playlistId: PLAYLIST_ID,
          title: 'Mixtape 2',
          isPublic: false,
          coverImages: ['existing.jpg'],
        })
      );
      expect(createActionMock).not.toHaveBeenCalled();
    });

    it('invalidates the listing and detail caches without seeding', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog(editProps);

      await clickSave(user);

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(UPDATED));
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.mine(),
      });
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.detail(PLAYLIST_ID),
      });
      expect(setQueryDataMock).not.toHaveBeenCalled();
    });

    it('toasts success and closes after an edit', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog(editProps);

      await clickSave(user);

      await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Playlist saved'));
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('maps a duplicate-title field error in edit mode', async () => {
      const user = userEvent.setup();
      updateActionMock.mockResolvedValue({
        success: false,
        error: 'Invalid input',
        fieldErrors: { title: ['You already have a playlist with this title'] },
      });
      renderDialog(editProps);

      await clickSave(user);

      expect(
        await screen.findByText('You already have a playlist with this title')
      ).toBeInTheDocument();
    });

    it('does nothing when edit mode lacks a playlist id', async () => {
      const user = userEvent.setup();
      renderDialog({ ...editProps, playlistId: null });

      await clickSave(user);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      expect(updateActionMock).not.toHaveBeenCalled();
      expect(createActionMock).not.toHaveBeenCalled();
    });
  });

  describe('Add songs', () => {
    it('closes the dialog before firing onAddSongs', async () => {
      const user = userEvent.setup();
      const events: string[] = [];
      renderDialog({
        mode: 'edit',
        playlistId: PLAYLIST_ID,
        onOpenChange: (next: boolean) => {
          events.push(`openChange:${String(next)}`);
        },
        onAddSongs: () => {
          events.push('addSongs');
        },
      });

      await user.click(screen.getByRole('button', { name: 'Add songs' }));

      expect(events).toEqual(['openChange:false', 'addSongs']);
    });

    it('omits the button in create mode', () => {
      renderDialog({ onAddSongs: vi.fn() });

      expect(screen.queryByRole('button', { name: 'Add songs' })).not.toBeInTheDocument();
    });

    it('omits the button when edit mode has no handler', () => {
      renderDialog({ mode: 'edit', playlistId: PLAYLIST_ID });

      expect(screen.queryByRole('button', { name: 'Add songs' })).not.toBeInTheDocument();
    });
  });

  describe('while a save is in flight', () => {
    it('disables Save with a "Saving…" label and disables Cancel', async () => {
      const user = userEvent.setup();
      const deferred = createDeferred<Awaited<ReturnType<typeof createPlaylistAction>>>();
      createActionMock.mockReturnValue(deferred.promise);
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);

      const savingButton = await screen.findByRole('button', { name: 'Saving…' });
      expect(savingButton).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

      deferred.resolve({ success: true, data: CREATED });
      await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    });

    it('disables Add songs while an edit save is in flight', async () => {
      const user = userEvent.setup();
      const deferred = createDeferred<Awaited<ReturnType<typeof updatePlaylistAction>>>();
      updateActionMock.mockReturnValue(deferred.promise);
      const { props } = renderDialog({
        mode: 'edit',
        playlistId: PLAYLIST_ID,
        initialValues: { title: 'Mixtape', isPublic: false, coverImages: [] },
        onAddSongs: vi.fn(),
      });

      await clickSave(user);

      await screen.findByRole('button', { name: 'Saving…' });
      expect(screen.getByRole('button', { name: 'Add songs' })).toBeDisabled();

      deferred.resolve({ success: true, data: UPDATED });
      await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    });

    it('ignores dialog close requests (Escape) while the save is in flight', async () => {
      const user = userEvent.setup();
      const deferred = createDeferred<Awaited<ReturnType<typeof createPlaylistAction>>>();
      createActionMock.mockReturnValue(deferred.promise);
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);
      await screen.findByRole('button', { name: 'Saving…' });

      await user.keyboard('{Escape}');

      expect(props.onOpenChange).not.toHaveBeenCalled();

      deferred.resolve({ success: true, data: CREATED });
      await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('allows closing the dialog again once the save settles', async () => {
      const user = userEvent.setup();
      const deferred = createDeferred<Awaited<ReturnType<typeof createPlaylistAction>>>();
      createActionMock.mockReturnValue(deferred.promise);
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await clickSave(user);
      await screen.findByRole('button', { name: 'Saving…' });

      deferred.resolve({ success: false, error: 'Failed to create playlist' });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

      await user.keyboard('{Escape}');

      expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Cancel', () => {
    it('closes the dialog without calling any action', async () => {
      const user = userEvent.setup();
      const { props } = renderDialog({ initialValues: VALID_INITIAL_VALUES });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      expect(createActionMock).not.toHaveBeenCalled();
      expect(updateActionMock).not.toHaveBeenCalled();
    });
  });
});
