/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { gateAction } from '@/lib/auth/action-gate';
import { VideoService } from '@/lib/services/video-service';
import { verifyS3ObjectExists } from '@/lib/utils/s3-client';

import { createVideoAction } from './create-video-action';

// `create-video-action.spec.ts` mocks `readActionInput`; this spec runs the
// real input reader and schema against the values `useCreateVideoMutation`
// passes, mocking only the service, S3 and framework boundaries. The arrays
// of objects (`artistDetails`, `producers`) used to travel as JSON strings.

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/s3-client');
vi.mock('./multipart-local-adapters', () => ({
  isLocalMultipartUpload: () => false,
  localObjectExists: vi.fn(),
}));

const VIDEO_ID = '507f1f77bcf86cd799439055';
const ARTIST_DETAILS = [{ sourceName: '1349', displayName: '1349' }];

const createValues = {
  preGeneratedId: VIDEO_ID,
  title: '1999',
  artist: '1349',
  category: 'MUSIC' as const,
  description: '',
  releasedOn: '2024-01-15',
  durationSeconds: 212,
  s3Key: `media/videos/${VIDEO_ID}/clip.mp4`,
  fileName: 'clip.mp4',
  fileSize: 10_485_760,
  mimeType: 'video/mp4' as const,
  artistDetails: ARTIST_DETAILS,
  producers: [],
};

describe('createVideoAction with the real schema', () => {
  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'admin-1' } } as never,
    });
    vi.mocked(verifyS3ObjectExists).mockResolvedValue(true);
    vi.mocked(VideoService.createVideo).mockResolvedValue({
      success: true,
      data: { id: VIDEO_ID },
    } as never);
    vi.mocked(VideoService.schedulePostSave).mockResolvedValue(undefined);
  });

  it('creates the video under its pre-generated id with its numbers intact', async () => {
    const result = await createVideoAction(createValues);

    expect(result.success).toBe(true);
    expect(vi.mocked(VideoService.createVideo).mock.calls[0][0]).toMatchObject({
      id: VIDEO_ID,
      title: '1999',
      durationSeconds: 212,
      fileSize: BigInt(10_485_760),
    });
  });

  it('omits a blank description rather than writing an empty one', async () => {
    await createVideoAction(createValues);

    expect(vi.mocked(VideoService.createVideo).mock.calls[0][0].description).toBeUndefined();
  });

  it('hands the artist details to the post-save step as objects', async () => {
    await createVideoAction(createValues);

    expect(vi.mocked(VideoService.schedulePostSave).mock.calls[0][0].next).toMatchObject({
      artistDetails: ARTIST_DETAILS,
      producers: [],
    });
  });
});
