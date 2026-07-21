/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Video } from '@/lib/types/domain/video';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import {
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
} as Video;

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

describe('confirmVideoUpload — E2E mode', () => {
  it('confirms without an S3 HEAD in E2E mode', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    await expect(confirmVideoUpload('media/videos/v1/x.mp4', 'v1')).resolves.toBeNull();
    expect(verifyS3ObjectExists).not.toHaveBeenCalled();
  });

  it('still rejects a wrong-namespace key in E2E mode', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    await expect(confirmVideoUpload('media/other/x.mp4', 'v1')).resolves.toMatch(/Invalid S3 key/);
  });
});
