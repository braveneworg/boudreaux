/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ComponentProps } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { MAX_PLAYLIST_COVER_IMAGES } from '@/lib/constants/playlists';

import { PlaylistCoverArtField } from './playlist-cover-art-field';

import type * as UsePlaylistCoverUploadModule from './use-playlist-cover-upload';

const uploadFilesMock = vi.hoisted(() => vi.fn());
const hookState = vi.hoisted(() => ({ error: null as string | null, isUploading: false }));

vi.mock('@/lib/actions/playlist-actions', () => ({
  generatePlaylistCoverUploadUrlsAction: vi.fn(),
}));

vi.mock('./use-playlist-cover-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof UsePlaylistCoverUploadModule>()),
  usePlaylistCoverUpload: () => ({
    uploadFiles: uploadFilesMock,
    isUploading: hookState.isUploading,
    error: hookState.error,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('./playlist-cover-tiles', () => ({
  PlaylistCoverTiles: ({ images, alt, size }: { images: string[]; alt: string; size?: string }) => (
    <div data-testid="cover-tiles" data-images={images.join('|')} data-alt={alt} data-size={size} />
  ),
}));

// Mock next/image using <span> to avoid the @next/next/no-img-element lint rule.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span data-testid="next-image" data-alt={props.alt as string} data-src={props.src as string} />
  ),
}));

const PLAYLIST_ID = '507f191e810c19729de860ea';
const toastErrorMock = vi.mocked(toast.error);
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();

const makeFile = (name: string, type = 'image/jpeg'): File => new File(['x'], name, { type });

type FieldProps = ComponentProps<typeof PlaylistCoverArtField>;

const renderField = (overrides: Partial<FieldProps> = {}) => {
  const props: FieldProps = {
    value: [],
    onChange: vi.fn(),
    playlistId: null,
    availableArtistImages: [],
    pendingFiles: [],
    onPendingFilesChange: vi.fn(),
    ...overrides,
  };
  const view = render(<PlaylistCoverArtField {...props} />);
  const rerenderField = (nextOverrides: Partial<FieldProps>): void =>
    view.rerender(<PlaylistCoverArtField {...props} {...nextOverrides} />);
  return { ...view, props, rerenderField };
};

const getFileInput = (): HTMLInputElement =>
  screen.getByLabelText<HTMLInputElement>('Upload images');

beforeEach(() => {
  hookState.error = null;
  hookState.isUploading = false;
  uploadFilesMock.mockResolvedValue([]);
  let counter = 0;
  createObjectUrlMock.mockImplementation(() => `blob:preview-${counter++}`);
  globalThis.URL.createObjectURL = createObjectUrlMock;
  globalThis.URL.revokeObjectURL = revokeObjectUrlMock;
});

describe('PlaylistCoverArtField', () => {
  describe('cover preview tiles', () => {
    it('renders the tiles at lg size with the cover-preview alt', () => {
      renderField({ value: ['https://cdn.example.com/u1.jpg'] });

      const tiles = screen.getByTestId('cover-tiles');
      expect(tiles).toHaveAttribute('data-size', 'lg');
      expect(tiles).toHaveAttribute('data-alt', 'Cover preview');
    });

    it('composes uploaded URLs and pending previews into the tiles', () => {
      renderField({
        value: ['https://cdn.example.com/u1.jpg'],
        pendingFiles: [makeFile('pending.jpg')],
      });

      expect(screen.getByTestId('cover-tiles')).toHaveAttribute(
        'data-images',
        'https://cdn.example.com/u1.jpg|blob:preview-0'
      );
    });
  });

  describe('upload tab — create mode', () => {
    it('appends selected files to pendingFiles without uploading', async () => {
      const user = userEvent.setup();
      const existing = makeFile('existing.jpg');
      const added = makeFile('added.png', 'image/png');
      const { props } = renderField({ pendingFiles: [existing] });

      await user.upload(getFileInput(), added);

      expect(props.onPendingFilesChange).toHaveBeenCalledWith([existing, added]);
      expect(uploadFilesMock).not.toHaveBeenCalled();
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('rejects an unsupported file with a toast and keeps pendingFiles unchanged', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { props } = renderField();

      await user.upload(getFileInput(), makeFile('track.mp3', 'audio/mpeg'));

      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining('track.mp3'));
      expect(props.onPendingFilesChange).not.toHaveBeenCalled();
    });
  });

  describe('upload tab — edit mode', () => {
    it('uploads immediately and appends the returned URLs to value', async () => {
      const user = userEvent.setup();
      uploadFilesMock.mockResolvedValue(['https://cdn.example.com/new1.jpg']);
      const file = makeFile('new1.jpg');
      const { props } = renderField({
        playlistId: PLAYLIST_ID,
        value: ['https://cdn.example.com/u1.jpg'],
      });

      await user.upload(getFileInput(), file);

      await waitFor(() =>
        expect(props.onChange).toHaveBeenCalledWith([
          'https://cdn.example.com/u1.jpg',
          'https://cdn.example.com/new1.jpg',
        ])
      );
      expect(uploadFilesMock).toHaveBeenCalledWith(PLAYLIST_ID, [file]);
      expect(props.onPendingFilesChange).not.toHaveBeenCalled();
    });

    it('leaves value unchanged when the upload resolves empty', async () => {
      const user = userEvent.setup();
      uploadFilesMock.mockResolvedValue([]);
      const { props } = renderField({ playlistId: PLAYLIST_ID });

      await user.upload(getFileInput(), makeFile('a.jpg'));

      await waitFor(() => expect(uploadFilesMock).toHaveBeenCalled());
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('disables the file input while uploading', () => {
      hookState.isUploading = true;
      renderField({ playlistId: PLAYLIST_ID });

      expect(getFileInput()).toBeDisabled();
    });

    it('surfaces the hook error as an alert', () => {
      hookState.error = 'Upload failed for "a.jpg" (403)';
      renderField({ playlistId: PLAYLIST_ID });

      expect(screen.getByRole('alert')).toHaveTextContent('Upload failed for "a.jpg" (403)');
    });
  });

  describe('while an upload is in flight', () => {
    it('disables the remove button for an uploaded URL', () => {
      hookState.isUploading = true;
      renderField({ playlistId: PLAYLIST_ID, value: ['https://cdn.example.com/u1.jpg'] });

      expect(screen.getByRole('button', { name: 'Remove cover image 1' })).toBeDisabled();
    });

    it('disables the remove button for a pending file', () => {
      hookState.isUploading = true;
      renderField({ playlistId: PLAYLIST_ID, pendingFiles: [makeFile('pending.jpg')] });

      expect(screen.getByRole('button', { name: 'Remove pending.jpg' })).toBeDisabled();
    });

    it('disables the artist image toggles', async () => {
      const user = userEvent.setup();
      hookState.isUploading = true;
      renderField({
        playlistId: PLAYLIST_ID,
        availableArtistImages: ['https://cdn.example.com/a1.jpg'],
      });

      await user.click(screen.getByRole('tab', { name: 'From artists' }));

      expect(screen.getByRole('button', { name: 'Artist image 1' })).toBeDisabled();
    });
  });

  describe('combined cap', () => {
    it('keeps only the files that fit and toasts when exceeding the cap', async () => {
      const user = userEvent.setup();
      const fits = makeFile('fits.jpg');
      const excess = makeFile('excess.jpg');
      const { props } = renderField({
        value: ['https://cdn.example.com/u1.jpg', 'https://cdn.example.com/u2.jpg'],
        pendingFiles: [makeFile('p1.jpg')],
      });

      await user.upload(getFileInput(), [fits, excess]);

      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining(String(MAX_PLAYLIST_COVER_IMAGES))
      );
      const [nextPending] = vi.mocked(props.onPendingFilesChange).mock.calls[0];
      expect(nextPending).toHaveLength(2);
      expect(nextPending[1]).toBe(fits);
    });

    it('ignores the selection entirely when the cap is already reached', async () => {
      const user = userEvent.setup();
      const { props } = renderField({
        value: ['a', 'b', 'c', 'd'].map((n) => `https://cdn.example.com/${n}.jpg`),
      });

      await user.upload(getFileInput(), makeFile('extra.jpg'));

      expect(toastErrorMock).toHaveBeenCalled();
      expect(props.onPendingFilesChange).not.toHaveBeenCalled();
      expect(uploadFilesMock).not.toHaveBeenCalled();
    });
  });

  describe('file input', () => {
    it('accepts the four image MIME types and multiple files', () => {
      renderField();

      const input = getFileInput();
      expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
      expect(input).toHaveAttribute('multiple');
    });
  });

  describe('thumbnails and removal', () => {
    it('removes an uploaded URL from value', async () => {
      const user = userEvent.setup();
      const { props } = renderField({
        value: ['https://cdn.example.com/u1.jpg', 'https://cdn.example.com/u2.jpg'],
      });

      await user.click(screen.getByRole('button', { name: 'Remove cover image 1' }));

      expect(props.onChange).toHaveBeenCalledWith(['https://cdn.example.com/u2.jpg']);
    });

    it('removes a pending file via onPendingFilesChange', async () => {
      const user = userEvent.setup();
      const first = makeFile('first.jpg');
      const second = makeFile('second.jpg');
      const { props } = renderField({ pendingFiles: [first, second] });

      await user.click(screen.getByRole('button', { name: 'Remove first.jpg' }));

      expect(props.onPendingFilesChange).toHaveBeenCalledWith([second]);
    });

    it('revokes stale object URLs when pendingFiles changes', () => {
      const first = makeFile('first.jpg');
      const second = makeFile('second.jpg');
      const { rerenderField } = renderField({ pendingFiles: [first, second] });

      rerenderField({ pendingFiles: [second] });

      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-0');
      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-1');
    });

    it('revokes object URLs on unmount', () => {
      const { unmount } = renderField({ pendingFiles: [makeFile('first.jpg')] });

      unmount();

      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-0');
    });
  });

  describe('from artists tab', () => {
    const artistImages = ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'];

    const openArtistsTab = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(screen.getByRole('tab', { name: 'From artists' }));
    };

    it('selects an artist image into value', async () => {
      const user = userEvent.setup();
      const { props } = renderField({
        availableArtistImages: artistImages,
        value: ['https://cdn.example.com/u1.jpg'],
      });

      await openArtistsTab(user);
      await user.click(screen.getByRole('button', { name: 'Artist image 2' }));

      expect(props.onChange).toHaveBeenCalledWith([
        'https://cdn.example.com/u1.jpg',
        'https://cdn.example.com/a2.jpg',
      ]);
    });

    it('deselects an already-selected artist image', async () => {
      const user = userEvent.setup();
      const { props } = renderField({
        availableArtistImages: artistImages,
        value: [artistImages[0]],
      });

      await openArtistsTab(user);
      await user.click(screen.getByRole('button', { name: 'Artist image 1' }));

      expect(props.onChange).toHaveBeenCalledWith([]);
    });

    it('marks selected images pressed and unselected ones not pressed', async () => {
      const user = userEvent.setup();
      renderField({ availableArtistImages: artistImages, value: [artistImages[0]] });

      await openArtistsTab(user);

      expect(screen.getByRole('button', { name: 'Artist image 1' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Artist image 2' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('toasts and ignores a selection past the cap', async () => {
      const user = userEvent.setup();
      const { props } = renderField({
        availableArtistImages: artistImages,
        value: ['a', 'b', 'c', 'd'].map((n) => `https://cdn.example.com/${n}.jpg`),
      });

      await openArtistsTab(user);
      await user.click(screen.getByRole('button', { name: 'Artist image 1' }));

      expect(toastErrorMock).toHaveBeenCalled();
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('counts pending files toward the artist-selection cap', async () => {
      const user = userEvent.setup();
      const { props } = renderField({
        availableArtistImages: artistImages,
        value: ['https://cdn.example.com/u1.jpg', 'https://cdn.example.com/u2.jpg'],
        pendingFiles: [makeFile('p1.jpg'), makeFile('p2.jpg')],
      });

      await openArtistsTab(user);
      await user.click(screen.getByRole('button', { name: 'Artist image 1' }));

      expect(toastErrorMock).toHaveBeenCalled();
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('shows an empty state when no artist images are available', async () => {
      const user = userEvent.setup();
      renderField({ availableArtistImages: [] });

      await openArtistsTab(user);

      expect(screen.getByText(/no artist images/i)).toBeInTheDocument();
    });
  });
});
