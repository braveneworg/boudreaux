/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { VideoService } from '@/lib/services/video-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { createVideoDraftAction } from './create-video-draft-action';
import {
  confirmVideoUpload,
  kickPostSaveEnrichment,
  parseDurationSeconds,
  parseFileSize,
} from './video-action-helpers';

import type * as VideoActionHelpers from './video-action-helpers';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
// Mock only the two integration helpers; keep the coercers real via importActual.
vi.mock('./video-action-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof VideoActionHelpers>();
  return {
    ...actual,
    confirmVideoUpload: vi.fn(),
    kickPostSaveEnrichment: vi.fn(),
  };
});

// Capture after() callbacks so tests can inspect / run them on demand.
const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const ID = '65a1b2c3d4e5f6a7b8c9d0e1';
const validInput = {
  preGeneratedId: ID,
  s3Key: `media/videos/${ID}/x.mp4`,
  fileName: 'Alpha - Song.mp4',
  mimeType: 'video/mp4',
  artist: 'Alpha',
};

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(confirmVideoUpload).mockResolvedValue(null);
  vi.mocked(kickPostSaveEnrichment).mockResolvedValue(undefined);
  vi.mocked(VideoService.getVideoById).mockResolvedValue({ success: false } as never);
  vi.mocked(VideoService.createVideo).mockResolvedValue({
    success: true,
    data: { id: ID },
  } as never);
});

describe('createVideoDraftAction', () => {
  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    await expect(createVideoDraftAction(validInput)).rejects.toThrow('Unauthorized');
  });

  it('creates an unpublished draft with fallbacks and kicks the pipeline', async () => {
    const result = await createVideoDraftAction(validInput);

    expect(result).toEqual({ success: true, videoId: ID });
  });

  it('creates the row with the pre-generated id', async () => {
    await createVideoDraftAction(validInput);

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.id).toBe(ID);
  });

  it('falls back to the filename stem for the title', async () => {
    await createVideoDraftAction(validInput);

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.title).toBe('Song');
  });

  it('keeps the draft unpublished (no publishedAt)', async () => {
    await createVideoDraftAction(validInput);

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.publishedAt).toBeUndefined();
  });

  it('falls back to today for the release date', async () => {
    await createVideoDraftAction(validInput);

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.releasedOn).toBeInstanceOf(Date);
  });

  it('kicks the post-save pipeline with reProbe', async () => {
    await createVideoDraftAction(validInput);

    await afterCallbacks[0]?.();

    expect(kickPostSaveEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: ID, artist: 'Alpha', reProbe: true })
    );
  });

  it('prefers the provided title over the filename stem', async () => {
    await createVideoDraftAction({ ...validInput, title: 'Chosen Title' });

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.title).toBe('Chosen Title');
  });

  it('uses the provided release date when parseable', async () => {
    await createVideoDraftAction({ ...validInput, releasedOn: '2024-01-15' });

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.releasedOn).toEqual(new Date('2024-01-15'));
  });

  it('persists a blank artist for a draft with no artist snapshot', async () => {
    const { artist: _artist, ...noArtist } = validInput;
    await createVideoDraftAction(noArtist);

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.artist).toBe('');
  });

  it('kicks the pipeline with a blank artist snapshot', async () => {
    const { artist: _artist, ...noArtist } = validInput;
    await createVideoDraftAction(noArtist);
    await afterCallbacks[0]?.();

    expect(kickPostSaveEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: ID, artist: '', reProbe: true })
    );
  });

  it('revalidates the admin videos path on success', async () => {
    await createVideoDraftAction(validInput);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
  });

  it('logs the draft creation audit event', async () => {
    await createVideoDraftAction(validInput);

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'media.video.created',
        userId: 'user-123',
        metadata: expect.objectContaining({ videoId: ID, draft: true }),
      })
    );
  });

  it('is idempotent when the row already exists', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: { id: ID },
    } as never);

    const result = await createVideoDraftAction(validInput);

    expect(result).toEqual({ success: true, videoId: ID });
  });

  it('does not create when the row already exists', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: { id: ID },
    } as never);

    await createVideoDraftAction(validInput);

    expect(VideoService.createVideo).not.toHaveBeenCalled();
  });

  it('fails softly on S3 confirm errors', async () => {
    vi.mocked(confirmVideoUpload).mockResolvedValue('File not found in S3 storage.');

    const result = await createVideoDraftAction(validInput);

    expect(result).toEqual({ success: false, error: 'File not found in S3 storage.' });
  });

  it('does not create when S3 confirmation fails', async () => {
    vi.mocked(confirmVideoUpload).mockResolvedValue('File not found in S3 storage.');

    await createVideoDraftAction(validInput);

    expect(VideoService.createVideo).not.toHaveBeenCalled();
  });

  it('fails softly on create failures', async () => {
    vi.mocked(VideoService.createVideo).mockResolvedValue({
      success: false,
      error: 'Duplicate title',
    } as never);

    const result = await createVideoDraftAction(validInput);

    expect(result).toEqual({ success: false, error: 'Could not create the draft.' });
  });

  it('does not kick the pipeline when creation fails', async () => {
    vi.mocked(VideoService.createVideo).mockResolvedValue({
      success: false,
      error: 'Duplicate title',
    } as never);

    await createVideoDraftAction(validInput);

    expect(afterCallbacks).toHaveLength(0);
  });

  it('fails softly on an unexpected service error', async () => {
    vi.mocked(VideoService.createVideo).mockRejectedValue(Error('boom'));

    const result = await createVideoDraftAction(validInput);

    expect(result).toEqual({ success: false, error: 'Could not create the draft.' });
  });

  it('rejects invalid input without touching services', async () => {
    await expect(createVideoDraftAction({ nope: true })).resolves.toEqual({
      success: false,
      error: 'Invalid draft request.',
    });
  });

  it('does not query the service on invalid input', async () => {
    await createVideoDraftAction({ nope: true });

    expect(VideoService.getVideoById).not.toHaveBeenCalled();
  });

  it('exposes the coercers used by the draft builder', () => {
    expect(parseDurationSeconds('212')).toBe(212);
    expect(parseFileSize('1024')).toBe(BigInt(1024));
  });
});
