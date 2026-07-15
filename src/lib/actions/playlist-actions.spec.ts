/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import {
  PLAYLIST_COVER_UPLOAD_LIMIT,
  playlistCoverUploadLimiter,
} from '@/lib/config/rate-limit-tiers';
import { PlaylistService } from '@/lib/services/playlist-service';
import { DataError } from '@/lib/types/domain/errors';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import {
  createPlaylistAction,
  deletePlaylistAction,
  generatePlaylistCoverUploadUrlsAction,
  updatePlaylistAction,
} from './playlist-actions';

vi.mock('server-only', () => ({}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    createWithItems: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    requireOwned: vi.fn(),
    getOwnedOrPublicDetail: vi.fn(),
  },
}));

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  playlistCoverUploadLimiter: { check: vi.fn() },
  PLAYLIST_COVER_UPLOAD_LIMIT: 10,
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  },
}));

vi.mock('@/lib/utils/cdn-url', () => ({
  buildCdnUrl: vi.fn((s3Key: string) => `https://cdn.test/${s3Key}`),
}));

const { mockGetSignedUrl } = vi.hoisted(() => ({ mockGetSignedUrl: vi.fn() }));

vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: vi.fn(() => ({})),
  getS3BucketName: vi.fn(() => 'test-bucket'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class MockPutObjectCommand {
    constructor(public params: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const USER_ID = 'user-1';
const PLAYLIST_ID = '507f1f77bcf86cd799439011';
const TRACK_FILE_ID = '507f1f77bcf86cd799439012';
const DUPLICATE_TITLE_MESSAGE = 'A playlist with this title already exists';

const detail: PlaylistDetailResponse = {
  id: PLAYLIST_ID,
  title: 'Road Trip',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 0,
  totalDuration: 0,
  items: [],
};

const signIn = (user: { id?: string; banned?: boolean | null } = { id: USER_ID }): void => {
  vi.mocked(auth).mockResolvedValue({ user } as never);
};

const validCreateInput = { title: 'Road Trip', isPublic: false };

const validUploadInput = {
  playlistId: PLAYLIST_ID,
  files: [
    { fileName: 'My Cover.PNG', contentType: 'image/png', fileSize: 1234 },
    { fileName: 'b.jpg', contentType: 'image/jpeg', fileSize: 42 },
  ],
};

beforeEach(() => {
  signIn();
  vi.mocked(playlistCoverUploadLimiter.check).mockResolvedValue(undefined);
  mockGetSignedUrl.mockResolvedValue('https://s3.test/presigned');
});

describe('playlist actions authorization', () => {
  it('rejects createPlaylistAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await createPlaylistAction(validCreateInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.createWithItems).not.toHaveBeenCalled();
  });

  it('rejects createPlaylistAction when the session user has no id', async () => {
    signIn({ id: '' });

    const result = await createPlaylistAction(validCreateInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects createPlaylistAction when the user is banned', async () => {
    signIn({ id: USER_ID, banned: true });

    const result = await createPlaylistAction(validCreateInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.createWithItems).not.toHaveBeenCalled();
  });

  it('rejects updatePlaylistAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await updatePlaylistAction({ playlistId: PLAYLIST_ID, title: 'X' });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.update).not.toHaveBeenCalled();
  });

  it('rejects deletePlaylistAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await deletePlaylistAction({ playlistId: PLAYLIST_ID });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.delete).not.toHaveBeenCalled();
  });

  it('rejects generatePlaylistCoverUploadUrlsAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects generatePlaylistCoverUploadUrlsAction for a banned user before rate limiting', async () => {
    signIn({ id: USER_ID, banned: true });

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(playlistCoverUploadLimiter.check).not.toHaveBeenCalled();
  });
});

describe('createPlaylistAction', () => {
  it('returns field errors when validation fails', async () => {
    const result = await createPlaylistAction({ title: '', isPublic: false });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('Invalid input');
    expect(result.fieldErrors).toHaveProperty('title');
    expect(PlaylistService.createWithItems).not.toHaveBeenCalled();
  });

  it('creates the playlist with defaulted covers/items and revalidates /playlists', async () => {
    vi.mocked(PlaylistService.createWithItems).mockResolvedValue(detail);

    const result = await createPlaylistAction(validCreateInput);

    expect(result).toEqual({ success: true, data: detail });
    expect(PlaylistService.createWithItems).toHaveBeenCalledWith(USER_ID, {
      title: 'Road Trip',
      isPublic: false,
      coverImages: [],
      items: [],
    });
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('passes seed items through to the service', async () => {
    vi.mocked(PlaylistService.createWithItems).mockResolvedValue(detail);

    await createPlaylistAction({
      title: 'Road Trip',
      isPublic: true,
      items: [{ itemType: 'track', trackFileId: TRACK_FILE_ID }],
    });

    expect(PlaylistService.createWithItems).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        items: [{ itemType: 'track', trackFileId: TRACK_FILE_ID }],
      })
    );
  });

  it('maps a duplicate-title DataError to a friendly title field error', async () => {
    vi.mocked(PlaylistService.createWithItems).mockRejectedValue(
      new DataError('DUPLICATE', 'Unique constraint failed on ownerId_title')
    );

    const result = await createPlaylistAction(validCreateInput);

    expect(result).toEqual({
      success: false,
      error: DUPLICATE_TITLE_MESSAGE,
      fieldErrors: { title: [DUPLICATE_TITLE_MESSAGE] },
    });
  });

  it('does not revalidate when creation fails', async () => {
    vi.mocked(PlaylistService.createWithItems).mockRejectedValue(new Error('boom'));

    await createPlaylistAction(validCreateInput);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('collapses unexpected errors to a generic message', async () => {
    vi.mocked(PlaylistService.createWithItems).mockRejectedValue(new Error('internal detail'));

    const result = await createPlaylistAction(validCreateInput);

    expect(result).toEqual({ success: false, error: 'Failed to create playlist' });
  });
});

describe('updatePlaylistAction', () => {
  const input = { playlistId: PLAYLIST_ID, title: 'Renamed' };

  it('returns a form-level error when no mutable field is provided', async () => {
    const result = await updatePlaylistAction({ playlistId: PLAYLIST_ID });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('_form');
    expect(PlaylistService.update).not.toHaveBeenCalled();
  });

  it('maps a NOT_FOUND DataError to its message', async () => {
    vi.mocked(PlaylistService.update).mockRejectedValue(
      new DataError('NOT_FOUND', 'Playlist not found')
    );

    const result = await updatePlaylistAction(input);

    expect(result).toEqual({ success: false, error: 'Playlist not found' });
  });

  it('maps a duplicate-title DataError to a friendly title field error', async () => {
    vi.mocked(PlaylistService.update).mockRejectedValue(new DataError('DUPLICATE', 'dup'));

    const result = await updatePlaylistAction(input);

    expect(result).toEqual({
      success: false,
      error: DUPLICATE_TITLE_MESSAGE,
      fieldErrors: { title: [DUPLICATE_TITLE_MESSAGE] },
    });
  });

  it('updates, revalidates, and returns the refreshed detail', async () => {
    vi.mocked(PlaylistService.update).mockResolvedValue({} as never);
    vi.mocked(PlaylistService.getOwnedOrPublicDetail).mockResolvedValue(detail);

    const result = await updatePlaylistAction(input);

    expect(result).toEqual({ success: true, data: detail });
    expect(PlaylistService.update).toHaveBeenCalledWith(USER_ID, input);
    expect(PlaylistService.getOwnedOrPublicDetail).toHaveBeenCalledWith(PLAYLIST_ID, USER_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('fails when the refreshed detail cannot be loaded', async () => {
    vi.mocked(PlaylistService.update).mockResolvedValue({} as never);
    vi.mocked(PlaylistService.getOwnedOrPublicDetail).mockResolvedValue(null);

    const result = await updatePlaylistAction(input);

    expect(result).toEqual({ success: false, error: 'Playlist not found' });
  });
});

describe('deletePlaylistAction', () => {
  it('rejects a malformed playlist id', async () => {
    const result = await deletePlaylistAction({ playlistId: 'nope' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('playlistId');
    expect(PlaylistService.delete).not.toHaveBeenCalled();
  });

  it('deletes the playlist and revalidates /playlists', async () => {
    vi.mocked(PlaylistService.delete).mockResolvedValue(undefined);

    const result = await deletePlaylistAction({ playlistId: PLAYLIST_ID });

    expect(result).toEqual({ success: true, data: { deleted: true } });
    expect(PlaylistService.delete).toHaveBeenCalledWith(USER_ID, PLAYLIST_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('maps a NOT_FOUND DataError to its message', async () => {
    vi.mocked(PlaylistService.delete).mockRejectedValue(
      new DataError('NOT_FOUND', 'Playlist not found')
    );

    const result = await deletePlaylistAction({ playlistId: PLAYLIST_ID });

    expect(result).toEqual({ success: false, error: 'Playlist not found' });
  });

  it('masks a repo-mapped NOT_FOUND (cause set) behind the generic message', async () => {
    vi.mocked(PlaylistService.delete).mockRejectedValue(
      new DataError('NOT_FOUND', 'Record to delete does not exist.', new Error('P2025'))
    );

    const result = await deletePlaylistAction({ playlistId: PLAYLIST_ID });

    expect(result).toEqual({ success: false, error: 'Failed to delete playlist' });
  });

  it('collapses non-user-facing DataError codes to the generic message', async () => {
    vi.mocked(PlaylistService.delete).mockRejectedValue(
      new DataError('UNAVAILABLE', 'connection string leaked')
    );

    const result = await deletePlaylistAction({ playlistId: PLAYLIST_ID });

    expect(result).toEqual({ success: false, error: 'Failed to delete playlist' });
  });
});

describe('generatePlaylistCoverUploadUrlsAction', () => {
  it('returns field errors for an unsupported MIME type', async () => {
    const result = await generatePlaylistCoverUploadUrlsAction({
      playlistId: PLAYLIST_ID,
      files: [{ fileName: 'x.svg', contentType: 'image/svg+xml', fileSize: 10 }],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('files.0.contentType');
    expect(playlistCoverUploadLimiter.check).not.toHaveBeenCalled();
  });

  it('returns RATE_LIMITED when the limiter rejects', async () => {
    vi.mocked(playlistCoverUploadLimiter.check).mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result).toEqual({ success: false, error: 'RATE_LIMITED' });
    expect(PlaylistService.requireOwned).not.toHaveBeenCalled();
  });

  it('checks the user-keyed limiter with the playlist cover limit', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);

    await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(playlistCoverUploadLimiter.check).toHaveBeenCalledWith(
      PLAYLIST_COVER_UPLOAD_LIMIT,
      USER_ID
    );
  });

  it('maps NOT_FOUND from ownership enforcement to its message', async () => {
    vi.mocked(PlaylistService.requireOwned).mockRejectedValue(
      new DataError('NOT_FOUND', 'Playlist not found')
    );

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result).toEqual({ success: false, error: 'Playlist not found' });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('mints one presigned target per file with CDN public URLs', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);
    mockGetSignedUrl
      .mockResolvedValueOnce('https://s3.test/put-1')
      .mockResolvedValueOnce('https://s3.test/put-2');

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(2);
    const [first, second] = result.data;
    expect(first?.uploadUrl).toBe('https://s3.test/put-1');
    expect(first?.publicUrl).toBe(`https://cdn.test/${first?.key}`);
    expect(second?.uploadUrl).toBe('https://s3.test/put-2');
    expect(second?.publicUrl).toBe(`https://cdn.test/${second?.key}`);
    expect(PlaylistService.requireOwned).toHaveBeenCalledWith(PLAYLIST_ID, USER_ID);
  });

  it('keys uploads under the playlist cover prefix with sanitized names', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const [first, second] = result.data;
    expect(first?.key).toMatch(
      new RegExp(`^media/playlists/${PLAYLIST_ID}/my-cover-\\d+-[a-z0-9]+\\.png$`)
    );
    expect(second?.key).toMatch(
      new RegExp(`^media/playlists/${PLAYLIST_ID}/b-\\d+-[a-z0-9]+\\.jpg$`)
    );
  });

  it('falls back to a .bin extension for a junk (non-alphanumeric) tail', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);

    const result = await generatePlaylistCoverUploadUrlsAction({
      playlistId: PLAYLIST_ID,
      files: [{ fileName: 'shot.J%2FPG..exe.....', contentType: 'image/png', fileSize: 10 }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]?.key).toMatch(
      new RegExp(`^media/playlists/${PLAYLIST_ID}/[a-z0-9-]+-\\d+-[a-z0-9]+\\.bin$`)
    );
  });

  it('falls back to a .bin extension for an over-long tail', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);

    const result = await generatePlaylistCoverUploadUrlsAction({
      playlistId: PLAYLIST_ID,
      files: [{ fileName: 'photo.abcdefghijklmnopqrst', contentType: 'image/png', fileSize: 10 }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]?.key).toMatch(
      new RegExp(`^media/playlists/${PLAYLIST_ID}/[a-z0-9-]+-\\d+-[a-z0-9]+\\.bin$`)
    );
  });

  it('lowercases a valid extension into the key', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);

    const result = await generatePlaylistCoverUploadUrlsAction({
      playlistId: PLAYLIST_ID,
      files: [{ fileName: 'photo.WebP', contentType: 'image/webp', fileSize: 10 }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]?.key).toMatch(
      new RegExp(`^media/playlists/${PLAYLIST_ID}/photo-\\d+-[a-z0-9]+\\.webp$`)
    );
  });

  it('reflects each file MIME type and size into the presigned PUT', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);

    await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(2);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: expect.objectContaining({
          Bucket: 'test-bucket',
          ContentType: 'image/png',
          ContentLength: 1234,
          Key: expect.stringContaining(`media/playlists/${PLAYLIST_ID}/`),
        }),
      }),
      { expiresIn: 900 }
    );
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: expect.objectContaining({ ContentType: 'image/jpeg', ContentLength: 42 }),
      }),
      { expiresIn: 900 }
    );
  });

  it('collapses presigner failures to a generic message', async () => {
    vi.mocked(PlaylistService.requireOwned).mockResolvedValue({} as never);
    mockGetSignedUrl.mockRejectedValue(new Error('aws internals'));

    const result = await generatePlaylistCoverUploadUrlsAction(validUploadInput);

    expect(result).toEqual({ success: false, error: 'Failed to generate upload URLs' });
  });
});
