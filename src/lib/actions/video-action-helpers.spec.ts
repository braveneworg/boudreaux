/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Video } from '@/lib/types/domain/video';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { localCompleteUpload, localRecordPart, localStartUpload } from './multipart-local-adapters';
import {
  areCandidatesForVideo,
  buildVideoCreateInput,
  buildVideoUpdateInput,
  confirmVideoUpload,
  deleteReplacedVideoAssets,
  isPosterReplaced,
  VIDEO_PERMITTED_FIELD_NAMES,
} from './video-action-helpers';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils/s3-client');
vi.mock('@/lib/utils/s3-key-utils');

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
  posterCandidates: [],
} as unknown as Video;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyS3ObjectExists).mockResolvedValue(true);
  vi.mocked(deleteS3Object).mockResolvedValue(true);
  vi.mocked(extractS3KeyFromUrl).mockReturnValue(ownPosterKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    const input = buildVideoCreateInput(formData, videoId, 'user-1', undefined);

    expect(input.id).toBe(videoId);
    expect(input.createdBy).toBe('user-1');
  });

  it('omits the id when no pre-generated id is provided', () => {
    const input = buildVideoCreateInput(formData, undefined, 'user-1', undefined);

    expect(input.id).toBeUndefined();
  });

  it('coerces numeric-ish string fields', () => {
    const input = buildVideoCreateInput(formData, videoId, 'user-1', undefined);

    expect(input.durationSeconds).toBe(212);
    expect(input.fileSize).toBe(BigInt(2048));
  });

  it('coerces number-typed fields delivered by getActionState', () => {
    const input = buildVideoCreateInput(
      { ...formData, durationSeconds: 212, fileSize: 2048 },
      videoId,
      'user-1',
      undefined
    );

    expect(input.durationSeconds).toBe(212);
    expect(input.fileSize).toBe(BigInt(2048));
  });

  it('includes posterCandidates when the resolved candidate list is provided', () => {
    const candidates = [{ url: 'https://cdn/candidate.jpg', atSeconds: 1, score: 0.9 }];

    const input = buildVideoCreateInput(formData, videoId, 'user-1', candidates);

    expect(input.posterCandidates).toEqual(candidates);
  });

  it('omits posterCandidates when the resolved candidate list is undefined', () => {
    const input = buildVideoCreateInput(formData, videoId, 'user-1', undefined);

    expect('posterCandidates' in input).toBe(false);
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
      'user-1',
      undefined
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

describe('deleteReplacedVideoAssets — candidate cleanup guards', () => {
  const candidateUrl = (n: number) =>
    `https://cdn.example.com/media/videos/vid1/poster-candidate-${n}.jpg`;
  const manualUrl = (name: string) => `https://cdn.example.com/media/videos/vid1/${name}.jpg`;

  const currentWithCandidates = {
    ...currentVideo,
    posterUrl: candidateUrl(1),
    posterCandidates: [1, 2].map((n) => ({ url: candidateUrl(n), atSeconds: n, score: n })),
  } as Video;

  beforeEach(() => {
    // Derive the S3 key from the URL's path (everything from `media/` on),
    // so distinct candidate/manual URLs resolve to distinct, distinguishable
    // keys — the fixed single-value mock used elsewhere in this file can't
    // tell candidates apart.
    vi.mocked(extractS3KeyFromUrl).mockImplementation((url: string) => {
      const match = url.match(/\/(media\/videos\/.+)$/);
      return match ? match[1] : null;
    });
  });

  it('does not delete when switching between two stored candidates', () => {
    deleteReplacedVideoAssets(
      currentWithCandidates,
      { ...formData, posterUrl: candidateUrl(2) },
      false
    );

    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  it('does not delete the old candidate poster when replaced by a manual upload (still in the list)', () => {
    deleteReplacedVideoAssets(
      currentWithCandidates,
      { ...formData, posterUrl: manualUrl('manual') },
      false
    );

    expect(deleteS3Object).not.toHaveBeenCalled();
  });

  it('deletes the old manual poster key when it is not a stored candidate (existing behavior)', () => {
    const current = { ...currentWithCandidates, posterUrl: manualUrl('old-manual') } as Video;

    deleteReplacedVideoAssets(current, { ...formData, posterUrl: manualUrl('new-manual') }, false);

    expect(deleteS3Object).toHaveBeenCalledWith('media/videos/vid1/old-manual.jpg');
    expect(deleteS3Object).toHaveBeenCalledTimes(1);
  });

  it('deletes the old video key and every old candidate key on file replace with a fresh candidate set', () => {
    const newCandidates = [3, 4].map((n) => ({ url: candidateUrl(n), atSeconds: n, score: n }));

    deleteReplacedVideoAssets(
      currentWithCandidates,
      {
        ...formData,
        posterUrl: candidateUrl(1),
        posterCandidates: newCandidates,
      },
      true
    );

    expect(deleteS3Object).toHaveBeenCalledWith(currentWithCandidates.s3Key);
    expect(deleteS3Object).toHaveBeenCalledWith('media/videos/vid1/poster-candidate-1.jpg');
    expect(deleteS3Object).toHaveBeenCalledWith('media/videos/vid1/poster-candidate-2.jpg');
    expect(deleteS3Object).toHaveBeenCalledTimes(3);
  });

  it('leaves old candidates untouched on file replace without a fresh candidate set', () => {
    deleteReplacedVideoAssets(
      currentWithCandidates,
      { ...formData, posterUrl: candidateUrl(1) },
      true
    );

    expect(deleteS3Object).toHaveBeenCalledWith(currentWithCandidates.s3Key);
    expect(deleteS3Object).toHaveBeenCalledTimes(1);
  });
});

describe('areCandidatesForVideo', () => {
  const forVideo = (id: string, n: number) => ({
    url: `https://cdn.example.com/media/videos/${id}/poster-candidate-${n}.jpg`,
    atSeconds: n,
    score: 1,
  });

  beforeEach(() => {
    // Mock extractS3KeyFromUrl to extract the key from the URL
    vi.mocked(extractS3KeyFromUrl).mockImplementation((url: string) => {
      const match = url.match(/\/media\/(videos|releases)\/(.+)\/(.+)/);
      return match ? `media/${match[1]}/${match[2]}/${match[3]}` : null;
    });
  });

  it('accepts candidates namespaced to the video', () => {
    expect(areCandidatesForVideo([forVideo('vid1', 1), forVideo('vid1', 2)], 'vid1')).toBe(true);
  });

  it('rejects a candidate namespaced to another video', () => {
    expect(areCandidatesForVideo([forVideo('vid1', 1), forVideo('vid2', 2)], 'vid1')).toBe(false);
  });

  it('rejects a candidate outside the video namespace', () => {
    const foreign = {
      url: 'https://cdn.example.com/media/releases/r1/a.jpg',
      atSeconds: 1,
      score: 1,
    };
    expect(areCandidatesForVideo([foreign], 'vid1')).toBe(false);
  });

  it('accepts an empty list', () => {
    expect(areCandidatesForVideo([], 'vid1')).toBe(true);
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

/**
 * Local (E2E) mode: the existence check is answered by the local upload store
 * rather than skipped. A key whose upload really completed confirms; one that
 * was never uploaded is rejected exactly as a missing S3 object would be.
 */
describe('confirmVideoUpload — local mode', () => {
  /** Drive a real local upload to completion for `s3Key`. */
  const completeLocalUpload = (s3Key: string): void => {
    const uploadId = localStartUpload({ s3Key });
    const eTag = localRecordPart({
      uploadId,
      partNumber: 1,
      body: new TextEncoder().encode('bytes'),
    });
    localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 1, eTag: eTag ?? '' }] });
  };

  beforeEach(() => {
    vi.stubEnv('E2E_MODE', 'true');
  });

  it('confirms a key whose local upload completed', async () => {
    const s3Key = `media/videos/${videoId}/confirmed.mp4`;
    completeLocalUpload(s3Key);

    await expect(confirmVideoUpload(s3Key, videoId)).resolves.toBeNull();
  });

  it('makes no S3 HEAD call', async () => {
    const s3Key = `media/videos/${videoId}/no-head.mp4`;
    completeLocalUpload(s3Key);

    await confirmVideoUpload(s3Key, videoId);

    expect(verifyS3ObjectExists).not.toHaveBeenCalled();
  });

  it('rejects a key that was never uploaded', async () => {
    await expect(
      confirmVideoUpload(`media/videos/${videoId}/never-uploaded.mp4`, videoId)
    ).resolves.toMatch(/File not found/);
  });

  it('still rejects a wrong-namespace key', async () => {
    await expect(confirmVideoUpload('media/other/x.mp4', videoId)).resolves.toMatch(
      /Invalid S3 key/
    );
  });
});
