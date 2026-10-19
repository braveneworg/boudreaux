/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { VideoService } from '@/lib/services/video-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { loggers } from '@/lib/utils/logger';

import { createVideoDraftAction } from './create-video-draft-action';
import { confirmVideoUpload, parseDurationSeconds, parseFileSize } from './video-action-helpers';

import type * as VideoActionHelpers from './video-action-helpers';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');
// Mock only the integration helper; keep the coercers real via importActual.
vi.mock('./video-action-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof VideoActionHelpers>();
  return { ...actual, confirmVideoUpload: vi.fn() };
});

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

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
  // areCandidatesForVideo (kept real above) resolves candidate URLs against
  // this CDN host to derive the S3 key it namespace-checks.
  vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(confirmVideoUpload).mockResolvedValue(null);
  vi.mocked(VideoService.schedulePostSave).mockResolvedValue(undefined);
  vi.mocked(VideoService.getVideoById).mockResolvedValue({ success: false } as never);
  vi.mocked(VideoService.createVideo).mockResolvedValue({
    success: true,
    data: { id: ID },
  } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createVideoDraftAction', () => {
  it('returns the gate refusal without creating the draft', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await createVideoDraftAction(validInput);

    expect(result).toEqual(REFUSAL);
    expect(VideoService.createVideo).not.toHaveBeenCalled();
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

  it('leaves the release date unset when the form has none', async () => {
    await createVideoDraftAction(validInput);

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input).not.toHaveProperty('releasedOn');
  });

  it('leaves the release date unset when the form value is unparseable', async () => {
    await createVideoDraftAction({ ...validInput, releasedOn: 'not-a-day' });

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input).not.toHaveProperty('releasedOn');
  });

  // Domain rule: a release date is never inferred — today only ever appears
  // because a human typed it. Freeze the clock so the assertion is exact.
  it('never stamps today as the release date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'));
    try {
      await createVideoDraftAction(validInput);
    } finally {
      vi.useRealTimers();
    }

    const input = vi.mocked(VideoService.createVideo).mock.calls[0][0];
    expect(input.releasedOn).not.toEqual(new Date('2026-09-14T00:00:00.000Z'));
  });

  it('schedules the draft post-save work for the created row', async () => {
    await createVideoDraftAction(validInput);

    expect(vi.mocked(VideoService.schedulePostSave).mock.calls).toEqual([
      [{ intent: 'draft', videoId: ID, next: { artist: 'Alpha', s3Key: validInput.s3Key } }],
    ]);
  });

  it('hands the reviewed artist details to the post-save work', async () => {
    const artistDetails = [{ sourceName: 'Alpha', displayName: 'Alpha (official)' }];

    await createVideoDraftAction({ ...validInput, artistDetails });

    expect(vi.mocked(VideoService.schedulePostSave).mock.calls[0]?.[0].next).toEqual({
      artist: 'Alpha',
      s3Key: validInput.s3Key,
      artistDetails,
    });
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

  it('schedules the post-save work with a blank artist snapshot', async () => {
    const { artist: _artist, ...noArtist } = validInput;
    await createVideoDraftAction(noArtist);

    expect(vi.mocked(VideoService.schedulePostSave).mock.calls[0]?.[0].next).toEqual({
      artist: '',
      s3Key: validInput.s3Key,
    });
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

  it('does not schedule post-save work when creation fails', async () => {
    vi.mocked(VideoService.createVideo).mockResolvedValue({
      success: false,
      error: 'Duplicate title',
    } as never);

    await createVideoDraftAction(validInput);

    expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
  });

  it('does not schedule post-save work when the row already exists', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: { id: ID },
    } as never);

    await createVideoDraftAction(validInput);

    expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
  });

  it('does not schedule post-save work when S3 confirmation fails', async () => {
    vi.mocked(confirmVideoUpload).mockResolvedValue('File not found in S3 storage.');

    await createVideoDraftAction(validInput);

    expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
  });

  it('does not schedule post-save work on invalid input', async () => {
    await createVideoDraftAction({ nope: true });

    expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
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

  const candidate = (n: number) => ({
    url: `https://cdn.example.com/media/videos/${ID}/poster-candidate-${n}.jpg`,
    atSeconds: n + 2.7,
    score: 10 + n,
  });

  it('persists posterUrl and posterCandidates on the draft', async () => {
    const result = await createVideoDraftAction({
      ...validInput,
      posterUrl: candidate(1).url,
      posterCandidates: [candidate(1), candidate(2)],
    });

    expect(result.success).toBe(true);
    expect(VideoService.createVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        posterUrl: candidate(1).url,
        posterCandidates: [candidate(1), candidate(2)],
      })
    );
  });

  it('drops poster fields when a candidate is outside the video namespace', async () => {
    const warnSpy = vi.spyOn(loggers.media, 'warn').mockImplementation(() => {});
    const foreign = {
      url: 'https://cdn.example.com/media/videos/other/poster-candidate-1.jpg',
      atSeconds: 3,
      score: 1,
    };
    const result = await createVideoDraftAction({
      ...validInput,
      posterUrl: foreign.url,
      posterCandidates: [foreign],
    });

    expect(result.success).toBe(true);
    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input).not.toHaveProperty('posterCandidates');
    expect(input?.posterUrl).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('video_draft_poster_candidates_rejected', {
      videoId: ID,
    });
  });

  /**
   * A poster need not be one of the frames: the admin can upload their own
   * image while the video multipart is still running, and an abandoned draft
   * must keep THAT rather than a captured frame. Own-namespace is the guard.
   */
  const MANUAL_POSTER = `https://cdn.example.com/media/videos/${ID}/poster-175-ab12cd.jpg`;

  it('persists a manual poster that is not one of the candidates', async () => {
    const result = await createVideoDraftAction({
      ...validInput,
      posterUrl: MANUAL_POSTER,
      posterCandidates: [candidate(1)],
    });

    expect(result.success).toBe(true);
    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input?.posterUrl).toBe(MANUAL_POSTER);
  });

  it('still persists the candidates alongside a manual poster', async () => {
    await createVideoDraftAction({
      ...validInput,
      posterUrl: MANUAL_POSTER,
      posterCandidates: [candidate(1)],
    });

    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input?.posterCandidates).toEqual([candidate(1)]);
  });

  it('persists a manual poster captured before any frames existed', async () => {
    await createVideoDraftAction({ ...validInput, posterUrl: MANUAL_POSTER });

    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input?.posterUrl).toBe(MANUAL_POSTER);
  });

  it('drops a posterUrl outside the video namespace', async () => {
    const result = await createVideoDraftAction({
      ...validInput,
      posterUrl: 'https://cdn.example.com/media/videos/other/poster.jpg',
      posterCandidates: [candidate(1)],
    });

    expect(result.success).toBe(true);
    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input?.posterUrl).toBeUndefined();
  });

  it('keeps the namespaced candidates when only the posterUrl is foreign', async () => {
    await createVideoDraftAction({
      ...validInput,
      posterUrl: 'https://cdn.example.com/media/videos/other/poster.jpg',
      posterCandidates: [candidate(1)],
    });

    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input?.posterCandidates).toEqual([candidate(1)]);
  });

  it('creates the draft with no poster fields when candidates are absent', async () => {
    await createVideoDraftAction(validInput);

    const input = vi.mocked(VideoService.createVideo).mock.calls.at(-1)?.[0];
    expect(input).not.toHaveProperty('posterCandidates');
    expect(input?.posterUrl).toBeUndefined();
  });
});
