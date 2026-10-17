/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { VideoService } from '@/lib/services/video-service';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { appendVideoPosterCandidatesAction } from './append-video-poster-candidates-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const videoId = '507f1f77bcf86cd799439011';

/** A frame inside this video's own S3 namespace on the pinned CDN domain. */
const ownFrame = (index: number): VideoPosterCandidate => ({
  url: `https://cdn.example.com/media/videos/${videoId}/poster-candidate-${index}.jpg`,
  atSeconds: 10 + index,
  score: 5,
});

const candidates = [ownFrame(6), ownFrame(7)];

beforeEach(() => {
  vi.resetAllMocks();
  // The namespace guard derives the S3 key from the CDN URL, and a worktree's
  // env files would otherwise decide which host counts as ours.
  vi.stubEnv('CDN_DOMAIN', 'cdn.example.com');
  vi.stubEnv('AWS_S3_BUCKET_NAME', 'my-bucket');
  vi.stubEnv('S3_BUCKET', '');
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(VideoService.appendVideoPosterCandidates).mockResolvedValue({
    success: true,
    data: { id: videoId } as never,
  });
});

describe('appendVideoPosterCandidatesAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid video id without calling the service', async () => {
    const result = await appendVideoPosterCandidatesAction('not-an-id', candidates);

    expect(result).toEqual({ success: false, error: 'Invalid video ID' });
    expect(VideoService.appendVideoPosterCandidates).not.toHaveBeenCalled();
  });

  it('rejects a malformed candidate list without calling the service', async () => {
    const result = await appendVideoPosterCandidatesAction(videoId, [
      { url: 'javascript:alert(1)', atSeconds: 1, score: 1 },
    ]);

    expect(result).toEqual({ success: false, error: 'Invalid poster frames' });
    expect(VideoService.appendVideoPosterCandidates).not.toHaveBeenCalled();
  });

  it('rejects an empty candidate list without calling the service', async () => {
    const result = await appendVideoPosterCandidatesAction(videoId, []);

    expect(result).toEqual({ success: false, error: 'Invalid poster frames' });
    expect(VideoService.appendVideoPosterCandidates).not.toHaveBeenCalled();
  });

  it('rejects a frame outside the video’s own namespace without calling the service', async () => {
    const foreign: VideoPosterCandidate = {
      url: 'https://cdn.example.com/media/videos/other-video/poster-candidate-1.jpg',
      atSeconds: 12,
      score: 5,
    };

    const result = await appendVideoPosterCandidatesAction(videoId, [ownFrame(6), foreign]);

    expect(result).toEqual({ success: false, error: 'Invalid poster frames' });
    expect(VideoService.appendVideoPosterCandidates).not.toHaveBeenCalled();
  });

  it('appends the frames via the service', async () => {
    await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(VideoService.appendVideoPosterCandidates).toHaveBeenCalledWith(videoId, candidates);
  });

  it('returns success when the append succeeds', async () => {
    const result = await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on a successful append', async () => {
    await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.video.poster_candidates_appended',
      userId: 'user-123',
      metadata: { videoId },
    });
  });

  it('revalidates the admin and public video paths after an append', async () => {
    await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
    expect(revalidatePath).toHaveBeenCalledWith('/videos');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(VideoService.appendVideoPosterCandidates).mockResolvedValue({
      success: false,
      error: 'Poster frame limit reached',
      code: 'LIMIT_EXCEEDED',
    });

    const result = await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(result).toEqual({ success: false, error: 'Poster frame limit reached' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(VideoService.appendVideoPosterCandidates).mockRejectedValue(
      new Error('Database error')
    );

    const result = await appendVideoPosterCandidatesAction(videoId, candidates);

    expect(result).toEqual({ success: false, error: 'Failed to add poster frames' });
  });
});
