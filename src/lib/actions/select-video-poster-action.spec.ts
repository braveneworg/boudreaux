/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { VideoService } from '@/lib/services/video-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { selectVideoPosterAction } from './select-video-poster-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const videoId = '507f1f77bcf86cd799439011';
const candidateUrl = 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(VideoService.selectVideoPoster).mockResolvedValue({
    success: true,
    data: { id: videoId } as never,
  });
});

describe('selectVideoPosterAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await selectVideoPosterAction(videoId, candidateUrl);

    expect(result).toEqual(REFUSAL);
    expect(VideoService.selectVideoPoster).not.toHaveBeenCalled();
  });

  it('rejects an invalid video id without calling the service', async () => {
    const result = await selectVideoPosterAction('not-an-id', candidateUrl);

    expect(result).toEqual({ success: false, error: 'Invalid video ID', code: 'INVALID_INPUT' });
    expect(VideoService.selectVideoPoster).not.toHaveBeenCalled();
  });

  it('rejects a candidate URL that is not http(s) without calling the service', async () => {
    const result = await selectVideoPosterAction(videoId, 'javascript:alert(1)');

    expect(result).toEqual({ success: false, error: 'Invalid poster URL', code: 'INVALID_INPUT' });
    expect(VideoService.selectVideoPoster).not.toHaveBeenCalled();
  });

  it('rejects a candidate URL over 2048 characters without calling the service', async () => {
    const longUrl = `https://cdn.example.com/${'a'.repeat(2048)}`;

    const result = await selectVideoPosterAction(videoId, longUrl);

    expect(result).toEqual({ success: false, error: 'Invalid poster URL', code: 'INVALID_INPUT' });
    expect(VideoService.selectVideoPoster).not.toHaveBeenCalled();
  });

  it('selects the poster via the service', async () => {
    await selectVideoPosterAction(videoId, candidateUrl);

    expect(VideoService.selectVideoPoster).toHaveBeenCalledWith(videoId, candidateUrl);
  });

  it('returns success when the selection succeeds', async () => {
    const result = await selectVideoPosterAction(videoId, candidateUrl);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful selection', async () => {
    await selectVideoPosterAction(videoId, candidateUrl);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.video.poster_selected',
      userId: 'user-123',
      metadata: { videoId },
    });
  });

  it('revalidates the admin and public video paths after selection', async () => {
    await selectVideoPosterAction(videoId, candidateUrl);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
    expect(revalidatePath).toHaveBeenCalledWith('/videos');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(VideoService.selectVideoPoster).mockResolvedValue({
      success: false,
      error: "Poster is not one of this video's candidates",
      code: 'INVALID_INPUT',
    });

    const result = await selectVideoPosterAction(videoId, candidateUrl);

    expect(result).toEqual({
      success: false,
      error: "Poster is not one of this video's candidates",
      code: 'INVALID_INPUT',
    });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(VideoService.selectVideoPoster).mockRejectedValue(new Error('Database error'));

    const result = await selectVideoPosterAction(videoId, candidateUrl);

    expect(result).toEqual({ success: false, error: 'Failed to set the poster', code: 'UNKNOWN' });
  });
});
