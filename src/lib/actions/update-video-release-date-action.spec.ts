/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { VideoService } from '@/lib/services/video-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { updateVideoReleaseDateAction } from './update-video-release-date-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const videoId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(VideoService.updateVideoReleaseDate).mockResolvedValue({
    success: true,
    data: { id: videoId } as never,
  });
});

describe('updateVideoReleaseDateAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await updateVideoReleaseDateAction(videoId, '2020-06-01');

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid video id without calling the service', async () => {
    const result = await updateVideoReleaseDateAction('not-an-id', '2020-06-01');

    expect(result).toEqual({ success: false, error: 'Invalid video ID' });
    expect(VideoService.updateVideoReleaseDate).not.toHaveBeenCalled();
  });

  it('rejects a date that is not a calendar day without calling the service', async () => {
    const result = await updateVideoReleaseDateAction(videoId, '2021-02-30');

    expect(result).toEqual({ success: false, error: 'Invalid release date' });
    expect(VideoService.updateVideoReleaseDate).not.toHaveBeenCalled();
  });

  it('rejects an ISO datetime without calling the service', async () => {
    const result = await updateVideoReleaseDateAction(videoId, '2020-06-01T00:00:00.000Z');

    expect(result).toEqual({ success: false, error: 'Invalid release date' });
    expect(VideoService.updateVideoReleaseDate).not.toHaveBeenCalled();
  });

  it('persists the day as a UTC-midnight Date via the service', async () => {
    await updateVideoReleaseDateAction(videoId, '2020-06-01');

    expect(VideoService.updateVideoReleaseDate).toHaveBeenCalledWith(
      videoId,
      new Date('2020-06-01T00:00:00.000Z')
    );
  });

  it('clears the date when given an empty string', async () => {
    await updateVideoReleaseDateAction(videoId, '');

    expect(VideoService.updateVideoReleaseDate).toHaveBeenCalledWith(videoId, null);
  });

  it('returns success when the save succeeds', async () => {
    const result = await updateVideoReleaseDateAction(videoId, '2020-06-01');

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on a successful save', async () => {
    await updateVideoReleaseDateAction(videoId, '2020-06-01');

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.video.release_date_set',
      userId: 'user-123',
      metadata: { videoId },
    });
  });

  it('revalidates the admin and public video paths after a save', async () => {
    await updateVideoReleaseDateAction(videoId, '2020-06-01');

    expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
    expect(revalidatePath).toHaveBeenCalledWith('/videos');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(VideoService.updateVideoReleaseDate).mockResolvedValue({
      success: false,
      error: 'A published video must keep a release date',
      code: 'VALIDATION',
    });

    const result = await updateVideoReleaseDateAction(videoId, '');

    expect(result).toEqual({
      success: false,
      error: 'A published video must keep a release date',
    });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(VideoService.updateVideoReleaseDate).mockRejectedValue(new Error('Database error'));

    const result = await updateVideoReleaseDateAction(videoId, '2020-06-01');

    expect(result).toEqual({ success: false, error: 'Failed to save the release date' });
  });
});
