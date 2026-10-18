/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { VideoService } from '@/lib/services/video-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { deleteVideoAction } from './delete-video-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const videoId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(VideoService.deleteVideo).mockResolvedValue({
    success: true,
    data: { id: videoId } as never,
  });
});

describe('deleteVideoAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await deleteVideoAction(videoId);

    expect(result).toEqual(REFUSAL);
    expect(VideoService.deleteVideo).not.toHaveBeenCalled();
  });

  it('rejects an invalid video id', async () => {
    const result = await deleteVideoAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid video ID', code: 'INVALID_INPUT' });
  });

  it('hard-deletes the video via the service', async () => {
    await deleteVideoAction(videoId);

    expect(VideoService.deleteVideo).toHaveBeenCalledWith(videoId);
  });

  it('returns success when the deletion succeeds', async () => {
    const result = await deleteVideoAction(videoId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful deletion', async () => {
    await deleteVideoAction(videoId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.video.deleted',
      userId: 'user-123',
      metadata: { videoId },
    });
  });

  it('revalidates the admin and public video paths after deletion', async () => {
    await deleteVideoAction(videoId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
    expect(revalidatePath).toHaveBeenCalledWith('/videos');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(VideoService.deleteVideo).mockResolvedValue({
      success: false,
      error: 'Video not found',
      code: 'NOT_FOUND',
    });

    const result = await deleteVideoAction(videoId);

    expect(result).toEqual({ success: false, error: 'Video not found', code: 'NOT_FOUND' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(VideoService.deleteVideo).mockRejectedValue(new Error('Database error'));

    const result = await deleteVideoAction(videoId);

    expect(result).toEqual({ success: false, error: 'Failed to delete video', code: 'UNKNOWN' });
  });
});
