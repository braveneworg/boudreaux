/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';
import { ProducerService } from '@/lib/services/producer-service';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import type { Video } from '@/lib/types/domain/video';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import {
  artistDetailsDiffer,
  buildVideoCreateInput,
  buildVideoUpdateInput,
  confirmVideoUpload,
  deleteReplacedVideoAssets,
  isPosterReplaced,
  kickPostSaveEnrichment,
  syncVideoProducersAfterSave,
  VIDEO_PERMITTED_FIELD_NAMES,
} from './video-action-helpers';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils/s3-client');
vi.mock('@/lib/utils/s3-key-utils');
vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
}));
vi.mock('@/lib/services/video-probe-service', () => ({
  VideoProbeService: { probeAndPersist: vi.fn() },
}));
vi.mock('@/lib/services/producer-service', () => ({
  ProducerService: { syncVideoProducers: vi.fn() },
}));

const videoId = '507f1f77bcf86cd799439011';
const validKey = `media/videos/${videoId}/clip.mp4`;
const ownPosterKey = `media/videos/${videoId}/old-poster.jpg`;
const foreignPosterKey = 'media/releases/other-release/cover.jpg';

const formData: VideoFormData = {
  title: 'Clip',
  artist: 'Band',
  category: 'MUSIC',
  description: 'Desc',
  releasedOn: '2024-01-15',
  durationSeconds: '212',
  s3Key: validKey,
  fileName: 'clip.mp4',
  fileSize: '2048',
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn/p.jpg',
  publishedAt: '2024-01-20T00:00:00.000Z',
};

const currentPosterUrl = 'https://cdn/old.jpg';

const currentVideo = {
  id: videoId,
  s3Key: validKey,
  posterUrl: currentPosterUrl,
} as Video;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyS3ObjectExists).mockResolvedValue(true);
  vi.mocked(deleteS3Object).mockResolvedValue(true);
  vi.mocked(extractS3KeyFromUrl).mockReturnValue(ownPosterKey);
});

describe('confirmVideoUpload', () => {
  it('rejects an undefined video id', async () => {
    const result = await confirmVideoUpload(validKey, undefined);

    expect(result).toContain('Invalid S3 key');
  });

  it('rejects a key outside the video prefix', async () => {
    const result = await confirmVideoUpload('releases/other/file.mp4', videoId);

    expect(result).toContain('Invalid S3 key');
  });

  it('rejects a key that attempts traversal', async () => {
    const result = await confirmVideoUpload(`media/videos/${videoId}/../evil.mp4`, videoId);

    expect(result).toContain('Invalid S3 key');
  });

  it('rejects when the S3 object does not exist', async () => {
    vi.mocked(verifyS3ObjectExists).mockResolvedValue(false);

    const result = await confirmVideoUpload(validKey, videoId);

    expect(result).toContain('File not found');
  });

  it('returns null when the object is confirmed', async () => {
    const result = await confirmVideoUpload(validKey, videoId);

    expect(result).toBeNull();
  });
});

describe('buildVideoCreateInput', () => {
  it('threads the pre-generated id and stamps createdBy', () => {
    const input = buildVideoCreateInput(formData, videoId, 'user-1');

    expect(input.id).toBe(videoId);
    expect(input.createdBy).toBe('user-1');
  });

  it('omits the id when no pre-generated id is provided', () => {
    const input = buildVideoCreateInput(formData, undefined, 'user-1');

    expect(input.id).toBeUndefined();
  });

  it('coerces numeric-ish string fields', () => {
    const input = buildVideoCreateInput(formData, videoId, 'user-1');

    expect(input.durationSeconds).toBe(212);
    expect(input.fileSize).toBe(BigInt(2048));
  });

  it('coerces number-typed fields delivered by getActionState', () => {
    const input = buildVideoCreateInput(
      { ...formData, durationSeconds: 212, fileSize: 2048 },
      videoId,
      'user-1'
    );

    expect(input.durationSeconds).toBe(212);
    expect(input.fileSize).toBe(BigInt(2048));
  });

  it('maps empty optionals to undefined', () => {
    const input = buildVideoCreateInput(
      {
        ...formData,
        description: '',
        durationSeconds: '',
        fileSize: '',
        posterUrl: '',
        publishedAt: '',
      },
      videoId,
      'user-1'
    );

    expect(input.description).toBeUndefined();
    expect(input.durationSeconds).toBeUndefined();
    expect(input.fileSize).toBeUndefined();
    expect(input.posterUrl).toBeUndefined();
    expect(input.publishedAt).toBeUndefined();
  });
});

describe('buildVideoUpdateInput', () => {
  it('stamps updatedBy and omits the id', () => {
    const input = buildVideoUpdateInput(formData, 'user-2');

    expect(input.updatedBy).toBe('user-2');
    expect('id' in input).toBe(false);
  });

  it('maps empty optionals to undefined', () => {
    const input = buildVideoUpdateInput(
      {
        ...formData,
        description: '',
        durationSeconds: '',
        fileSize: '',
        posterUrl: '',
        publishedAt: '',
      },
      'user-2'
    );

    expect(input.description).toBeUndefined();
    expect(input.durationSeconds).toBeUndefined();
    expect(input.fileSize).toBeUndefined();
    expect(input.posterUrl).toBeUndefined();
    expect(input.publishedAt).toBeUndefined();
  });
});

describe('isPosterReplaced', () => {
  it('is false when the update omits the poster', () => {
    expect(isPosterReplaced(currentVideo, { ...formData, posterUrl: undefined })).toBe(false);
  });

  it('is false when the update clears the poster to an empty string', () => {
    expect(isPosterReplaced(currentVideo, { ...formData, posterUrl: '' })).toBe(false);
  });

  it('is false when the poster is unchanged', () => {
    expect(isPosterReplaced(currentVideo, { ...formData, posterUrl: currentPosterUrl })).toBe(
      false
    );
  });

  it('is true when a new differing poster is supplied', () => {
    expect(isPosterReplaced(currentVideo, { ...formData, posterUrl: 'https://cdn/new.jpg' })).toBe(
      true
    );
  });
});

describe('deleteReplacedVideoAssets', () => {
  it('deletes the old video key when the file was replaced', () => {
    deleteReplacedVideoAssets(currentVideo, { ...formData, posterUrl: currentPosterUrl }, true);

    expect(deleteS3Object).toHaveBeenCalledWith(currentVideo.s3Key);
  });

  it('deletes the extracted old poster key when the poster changed', () => {
    deleteReplacedVideoAssets(
      currentVideo,
      { ...formData, posterUrl: 'https://cdn/new.jpg' },
      false
    );

    expect(deleteS3Object).toHaveBeenCalledWith(ownPosterKey);
  });

  it('does not delete a poster key outside the video namespace', () => {
    vi.mocked(extractS3KeyFromUrl).mockReturnValue(foreignPosterKey);

    deleteReplacedVideoAssets(
      currentVideo,
      { ...formData, posterUrl: 'https://cdn/new.jpg' },
      false
    );

    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  it('does not delete a poster key when the URL is not extractable', () => {
    vi.mocked(extractS3KeyFromUrl).mockReturnValue(null);

    deleteReplacedVideoAssets(
      currentVideo,
      { ...formData, posterUrl: 'https://cdn/new.jpg' },
      false
    );

    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  it('deletes nothing when neither the file nor the poster changed', () => {
    deleteReplacedVideoAssets(currentVideo, { ...formData, posterUrl: currentPosterUrl }, false);

    expect(deleteS3Object).not.toHaveBeenCalled();
  });
});

describe('VIDEO_PERMITTED_FIELD_NAMES', () => {
  it("includes 'artistDetails'", () => {
    expect(VIDEO_PERMITTED_FIELD_NAMES).toContain('artistDetails');
  });

  it("includes 'producers'", () => {
    expect(VIDEO_PERMITTED_FIELD_NAMES).toContain('producers');
  });
});

describe('artistDetailsDiffer', () => {
  const row = (over: Partial<VideoArtistWithArtist['artist']> = {}): VideoArtistWithArtist =>
    ({
      artistId: 'a1',
      role: 'PRIMARY',
      artist: {
        firstName: 'Alpha',
        middleName: null,
        surname: 'Beta',
        displayName: 'Alpha Beta',
        akaNames: null,
        bornOn: null,
        ...over,
      },
    }) as VideoArtistWithArtist;

  it('is false when every detail matches the linked artist', () => {
    const details = [{ sourceName: 'Alpha Beta', firstName: 'Alpha', surname: 'Beta' }];
    expect(artistDetailsDiffer(details, [row()])).toBe(false);
  });

  it('is true when a provided part differs', () => {
    const details = [{ sourceName: 'Alpha Beta', firstName: 'Changed' }];
    expect(artistDetailsDiffer(details, [row()])).toBe(true);
  });

  it('is true when the source name matches no linked artist', () => {
    expect(artistDetailsDiffer([{ sourceName: 'Nobody' }], [row()])).toBe(true);
  });
});

describe('kickPostSaveEnrichment', () => {
  const kickInput = {
    videoId,
    artist: 'Ceschi feat. Sage Francis',
    category: 'MUSIC' as const,
    reProbe: true,
  };

  beforeEach(() => {
    vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
    vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
    vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
    vi.mocked(ProducerService.syncVideoProducers).mockResolvedValue(undefined);
  });

  it('syncs video artists from the artist string', async () => {
    await kickPostSaveEnrichment(kickInput);

    expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
      videoId,
      'Ceschi feat. Sage Francis',
      undefined
    );
  });

  it('forwards artistDetails as the third arg to syncVideoArtists', async () => {
    const artistDetails = [{ sourceName: 'Ceschi', displayName: 'Ceschi Ramos' }];

    await kickPostSaveEnrichment({ ...kickInput, artistDetails });

    expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
      videoId,
      'Ceschi feat. Sage Francis',
      artistDetails
    );
  });

  it('passes undefined for artistDetails when absent', async () => {
    await kickPostSaveEnrichment(kickInput);

    expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
      videoId,
      'Ceschi feat. Sage Francis',
      undefined
    );
  });

  it('probes when reProbe is true', async () => {
    await kickPostSaveEnrichment(kickInput);

    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
  });

  it('skips the probe when reProbe is false', async () => {
    await kickPostSaveEnrichment({ ...kickInput, reProbe: false });

    expect(VideoProbeService.probeAndPersist).not.toHaveBeenCalled();
  });

  it('dispatches the enrichment job for a MUSIC video', async () => {
    await kickPostSaveEnrichment(kickInput);

    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
  });

  it('does not dispatch the enrichment job for an INFORMATIONAL video', async () => {
    await kickPostSaveEnrichment({ ...kickInput, category: 'INFORMATIONAL' });

    expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
  });

  it('runs the sync before the probe and the probe before the job', async () => {
    await kickPostSaveEnrichment(kickInput);

    const syncOrder = vi.mocked(VideoEnrichmentService.syncVideoArtists).mock
      .invocationCallOrder[0];
    const probeOrder = vi.mocked(VideoProbeService.probeAndPersist).mock.invocationCallOrder[0];
    const jobOrder = vi.mocked(VideoEnrichmentService.runEnrichmentJob).mock.invocationCallOrder[0];
    expect([syncOrder < probeOrder, probeOrder < jobOrder]).toEqual([true, true]);
  });

  it('still probes when the artist sync fails', async () => {
    vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('sync down'));

    await kickPostSaveEnrichment(kickInput);

    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
  });

  it('still dispatches the job when the probe fails', async () => {
    vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(Error('probe down'));

    await kickPostSaveEnrichment(kickInput);

    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
  });

  it('never throws even when every stage fails', async () => {
    vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('a'));
    vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(Error('b'));
    vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockRejectedValue(Error('c'));

    await expect(kickPostSaveEnrichment(kickInput)).resolves.toBeUndefined();
  });

  it('does not call syncVideoProducers (producers decoupled from kick)', async () => {
    await kickPostSaveEnrichment(kickInput);

    expect(ProducerService.syncVideoProducers).not.toHaveBeenCalled();
  });

  it('skips artist sync and enrichment when the artist is blank', async () => {
    await kickPostSaveEnrichment({
      videoId: 'v1',
      artist: '   ',
      category: 'MUSIC',
      reProbe: true,
    });
    expect(VideoEnrichmentService.syncVideoArtists).not.toHaveBeenCalled();
    expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith('v1');
  });

  it('still syncs and dispatches when the artist is non-blank', async () => {
    await kickPostSaveEnrichment({
      videoId: 'v1',
      artist: 'Ceschi',
      category: 'MUSIC',
      reProbe: false,
    });
    expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith('v1', 'Ceschi', undefined);
    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith('v1');
    expect(VideoProbeService.probeAndPersist).not.toHaveBeenCalled();
  });
});

describe('syncVideoProducersAfterSave', () => {
  beforeEach(() => {
    vi.mocked(ProducerService.syncVideoProducers).mockResolvedValue(undefined);
  });

  it('syncs producers when provided', async () => {
    await syncVideoProducersAfterSave({
      videoId,
      producers: [{ name: 'New Producer' }],
    });

    expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(
      videoId,
      [{ name: 'New Producer' }],
      undefined
    );
  });

  it('syncs an empty producers array (clear-to-zero)', async () => {
    await syncVideoProducersAfterSave({ videoId, producers: [] });

    expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(videoId, [], undefined);
  });

  it('forwards createdBy to syncVideoProducers', async () => {
    await syncVideoProducersAfterSave({
      videoId,
      producers: [{ id: 'p1', name: 'Rick' }],
      createdBy: 'user-abc',
    });

    expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(
      videoId,
      [{ id: 'p1', name: 'Rick' }],
      'user-abc'
    );
  });

  it('swallows a sync failure (best-effort)', async () => {
    vi.mocked(ProducerService.syncVideoProducers).mockRejectedValue(Error('producer sync down'));

    await expect(
      syncVideoProducersAfterSave({ videoId, producers: [{ name: 'Bad' }] })
    ).resolves.toBeUndefined();
  });
});
