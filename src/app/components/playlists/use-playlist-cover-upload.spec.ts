// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from '@testing-library/react';

import { generatePlaylistCoverUploadUrlsAction } from '@/lib/actions/playlist-actions';
import {
  MAX_PLAYLIST_COVER_IMAGE_BYTES,
  MAX_PLAYLIST_COVER_IMAGES,
} from '@/lib/constants/playlists';
import type { PlaylistCoverUploadTarget } from '@/lib/types/domain/playlist';

import {
  PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES,
  usePlaylistCoverUpload,
  validatePlaylistCoverFiles,
} from './use-playlist-cover-upload';

vi.mock('@/lib/actions/playlist-actions', () => ({
  generatePlaylistCoverUploadUrlsAction: vi.fn(),
}));

const actionMock = vi.mocked(generatePlaylistCoverUploadUrlsAction);
const fetchMock = vi.fn();

const PLAYLIST_ID = '507f191e810c19729de860ea';

/** Builds a File whose reported size can exceed its actual byte length. */
const makeFile = (name: string, type: string, size = 128): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/** One presigned target per index, mirroring the action's ordered output. */
const targetsFor = (count: number): PlaylistCoverUploadTarget[] =>
  Array.from({ length: count }, (_, index) => ({
    uploadUrl: `https://s3.example.com/put-${index}`,
    key: `media/playlists/${PLAYLIST_ID}/cover-${index}.jpg`,
    publicUrl: `https://cdn.example.com/cover-${index}.jpg`,
  }));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES', () => {
  it('lists the four MIME types from the server upload schema', () => {
    expect([...PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
  });
});

describe('validatePlaylistCoverFiles', () => {
  it('returns null for a valid batch', () => {
    const files = [makeFile('a.jpg', 'image/jpeg'), makeFile('b.png', 'image/png')];

    expect(validatePlaylistCoverFiles(files)).toBeNull();
  });

  it('rejects a file with an unsupported MIME type', () => {
    const files = [makeFile('doc.pdf', 'application/pdf')];

    expect(validatePlaylistCoverFiles(files)).toContain('doc.pdf');
  });

  it('rejects a file over the byte limit', () => {
    const files = [makeFile('big.jpg', 'image/jpeg', MAX_PLAYLIST_COVER_IMAGE_BYTES + 1)];

    expect(validatePlaylistCoverFiles(files)).toContain('big.jpg');
  });

  it('accepts a file exactly at the byte limit', () => {
    const files = [makeFile('edge.jpg', 'image/jpeg', MAX_PLAYLIST_COVER_IMAGE_BYTES)];

    expect(validatePlaylistCoverFiles(files)).toBeNull();
  });

  it('rejects more files than the image cap', () => {
    const files = Array.from({ length: MAX_PLAYLIST_COVER_IMAGES + 1 }, (_, index) =>
      makeFile(`f${index}.jpg`, 'image/jpeg')
    );

    expect(validatePlaylistCoverFiles(files)).toContain(String(MAX_PLAYLIST_COVER_IMAGES));
  });
});

describe('usePlaylistCoverUpload', () => {
  /** Renders the hook and returns a helper that awaits uploadFiles inside act. */
  const setup = () => {
    const rendered = renderHook(() => usePlaylistCoverUpload());
    const upload = async (files: File[]): Promise<string[]> => {
      let urls: string[] = [];
      await act(async () => {
        urls = await rendered.result.current.uploadFiles(PLAYLIST_ID, files);
      });
      return urls;
    };
    return { ...rendered, upload };
  };

  it('starts idle with no error', () => {
    const { result } = setup();

    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('resolves empty without calling the action for an empty file list', async () => {
    const { result, upload } = setup();

    const urls = await upload([]);

    expect(urls).toEqual([]);
    expect(actionMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('rejects an unsupported MIME type without calling the action', async () => {
    const { result, upload } = setup();

    const urls = await upload([makeFile('track.mp3', 'audio/mpeg')]);

    expect(urls).toEqual([]);
    expect(actionMock).not.toHaveBeenCalled();
    expect(result.current.error).toContain('track.mp3');
  });

  it('rejects an oversize file without calling the action', async () => {
    const { result, upload } = setup();

    const urls = await upload([
      makeFile('huge.png', 'image/png', MAX_PLAYLIST_COVER_IMAGE_BYTES + 1),
    ]);

    expect(urls).toEqual([]);
    expect(actionMock).not.toHaveBeenCalled();
    expect(result.current.error).toContain('huge.png');
  });

  it('rejects a batch over the image cap without calling the action', async () => {
    const { result, upload } = setup();
    const files = Array.from({ length: MAX_PLAYLIST_COVER_IMAGES + 1 }, (_, index) =>
      makeFile(`f${index}.jpg`, 'image/jpeg')
    );

    const urls = await upload(files);

    expect(urls).toEqual([]);
    expect(actionMock).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it('skips the PUT step when validation fails', async () => {
    const { upload } = setup();

    await upload([makeFile('track.mp3', 'audio/mpeg')]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the action with the playlist id and per-file metadata', async () => {
    actionMock.mockResolvedValue({ success: true, data: targetsFor(2) });
    const { upload } = setup();
    const files = [makeFile('a.jpg', 'image/jpeg', 1024), makeFile('b.webp', 'image/webp', 2048)];

    await upload(files);

    expect(actionMock).toHaveBeenCalledWith({
      playlistId: PLAYLIST_ID,
      files: [
        { fileName: 'a.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        { fileName: 'b.webp', contentType: 'image/webp', fileSize: 2048 },
      ],
    });
  });

  it('PUTs each file to its presigned URL with its content type', async () => {
    actionMock.mockResolvedValue({ success: true, data: targetsFor(2) });
    const { upload } = setup();
    const files = [makeFile('a.jpg', 'image/jpeg'), makeFile('b.webp', 'image/webp')];

    await upload(files);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/put-0', {
      method: 'PUT',
      body: files[0],
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/put-1', {
      method: 'PUT',
      body: files[1],
      headers: { 'Content-Type': 'image/webp' },
    });
  });

  it('returns the public URLs in file order', async () => {
    actionMock.mockResolvedValue({ success: true, data: targetsFor(3) });
    const { upload } = setup();
    const files = [
      makeFile('a.jpg', 'image/jpeg'),
      makeFile('b.png', 'image/png'),
      makeFile('c.gif', 'image/gif'),
    ];

    const urls = await upload(files);

    expect(urls).toEqual([
      'https://cdn.example.com/cover-0.jpg',
      'https://cdn.example.com/cover-1.jpg',
      'https://cdn.example.com/cover-2.jpg',
    ]);
  });

  it('reports isUploading while the upload is in flight', async () => {
    let resolveAction: (value: { success: true; data: PlaylistCoverUploadTarget[] }) => void = () =>
      undefined;
    actionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );
    const { result } = setup();

    let uploadPromise: Promise<string[]> = Promise.resolve([]);
    act(() => {
      uploadPromise = result.current.uploadFiles(PLAYLIST_ID, [makeFile('a.jpg', 'image/jpeg')]);
    });

    await waitFor(() => expect(result.current.isUploading).toBe(true));

    resolveAction({ success: true, data: targetsFor(1) });
    await act(async () => {
      await uploadPromise;
    });

    expect(result.current.isUploading).toBe(false);
  });

  it('surfaces an action failure as the error state and resolves empty', async () => {
    actionMock.mockResolvedValue({ success: false, error: 'Playlist not found' });
    const { result, upload } = setup();

    const urls = await upload([makeFile('a.jpg', 'image/jpeg')]);

    expect(urls).toEqual([]);
    expect(result.current.error).toBe('Playlist not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a RATE_LIMITED failure to a friendly message', async () => {
    actionMock.mockResolvedValue({ success: false, error: 'RATE_LIMITED' });
    const { result, upload } = setup();

    await upload([makeFile('a.jpg', 'image/jpeg')]);

    expect(result.current.error).toBe('Too many upload requests — try again in a minute.');
  });

  it('surfaces a failed PUT as the error state and resolves empty', async () => {
    actionMock.mockResolvedValue({ success: true, data: targetsFor(1) });
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    const { result, upload } = setup();

    const urls = await upload([makeFile('a.jpg', 'image/jpeg')]);

    expect(urls).toEqual([]);
    expect(result.current.error).toContain('a.jpg');
  });

  it('surfaces a network error thrown by fetch', async () => {
    actionMock.mockResolvedValue({ success: true, data: targetsFor(1) });
    fetchMock.mockRejectedValue(new Error('Network down'));
    const { result, upload } = setup();

    const urls = await upload([makeFile('a.jpg', 'image/jpeg')]);

    expect(urls).toEqual([]);
    expect(result.current.error).toBe('Network down');
  });

  it('resets isUploading after a failure', async () => {
    actionMock.mockResolvedValue({ success: false, error: 'Playlist not found' });
    const { result, upload } = setup();

    await upload([makeFile('a.jpg', 'image/jpeg')]);

    expect(result.current.isUploading).toBe(false);
  });

  it('clears a previous error on the next successful upload', async () => {
    const { result, upload } = setup();
    await upload([makeFile('track.mp3', 'audio/mpeg')]);

    actionMock.mockResolvedValue({ success: true, data: targetsFor(1) });
    await upload([makeFile('a.jpg', 'image/jpeg')]);

    expect(result.current.error).toBeNull();
  });
});
