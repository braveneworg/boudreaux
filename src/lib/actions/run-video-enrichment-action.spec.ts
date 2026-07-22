// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VideoRepository } from '@/lib/repositories/video-repository';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import type { VideoEnrichmentState } from '@/lib/types/domain/video-enrichment';
import { requireRole } from '@/lib/utils/auth/require-role';
import { logSecurityEvent } from '@/utils/audit-log';

import { runVideoEnrichmentAction } from './run-video-enrichment-action';

const afterMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => afterMock(cb) }));
vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: { getEnrichmentState: vi.fn(), setEnrichmentStatus: vi.fn() },
}));
vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: { runEnrichmentJob: vi.fn() },
}));
vi.mock('@/lib/services/video-probe-service', () => ({
  VideoProbeService: { probeAndPersist: vi.fn() },
}));
vi.mock('@/lib/utils/logger', () => ({
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

const VIDEO_ID = 'f'.repeat(24);

const baseState = (overrides: Partial<VideoEnrichmentState> = {}): VideoEnrichmentState => ({
  id: VIDEO_ID,
  enrichmentStatus: null,
  enrichmentError: null,
  enrichmentStartedAt: null,
  enrichmentJobToken: null,
  enrichmentProgress: null,
  enrichedAt: null,
  category: 'MUSIC',
  artist: 'Ceschi',
  title: 'Bite Through Stone',
  releasedOn: new Date('2021-04-09T00:00:00.000Z'),
  description: null,
  s3Key: 'media/videos/abc.mp4',
  ...overrides,
});

beforeEach(() => {
  afterMock.mockReset();
  vi.mocked(requireRole).mockResolvedValue({
    user: { id: 'admin-1', role: 'admin' },
  } as never);
  vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
  vi.mocked(VideoRepository.setEnrichmentStatus).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
  vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
});

describe('runVideoEnrichmentAction', () => {
  it('rejects when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(runVideoEnrichmentAction(VIDEO_ID)).rejects.toThrow('Unauthorized');
  });

  it('rejects a malformed video id', async () => {
    const result = await runVideoEnrichmentAction('not-an-object-id');

    expect(result).toEqual({ success: false, error: 'Invalid video id.' });
  });

  it('returns an error when the video does not exist', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: false, error: 'Video not found.' });
  });

  it('refuses to run when the persisted artist is blank', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState({ artist: '   ' }));

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({
      success: false,
      error: 'Add an artist or creator and save before running enrichment.',
    });
    expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('refuses a non-MUSIC video even when it has an artist (no pending write)', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ category: 'INFORMATIONAL', artist: 'Ceschi' })
    );

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({
      success: false,
      error: 'Enrichment runs only on videos in the MUSIC category.',
    });
    expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('echoes a fresh in-flight status instead of double-triggering', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentStartedAt: new Date() })
    );

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
  });

  it('echoes a fresh pending status instead of double-triggering', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'pending', enrichmentStartedAt: new Date() })
    );

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
  });

  it('supersedes a stale in-flight job', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({
        enrichmentStatus: 'processing',
        enrichmentStartedAt: new Date(Date.now() - 18 * 60 * 1000),
      })
    );

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: true, status: 'pending' });
  });

  it('marks the job pending and schedules the probe + enrichment after the response', async () => {
    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(VideoRepository.setEnrichmentStatus).toHaveBeenCalledWith(VIDEO_ID, 'pending');
    await afterMock.mock.calls[0][0]();
    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(VIDEO_ID);
    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(VIDEO_ID);
  });

  it('still runs enrichment when the probe fails (probe never blocks)', async () => {
    vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(new Error('ffprobe missing'));

    await runVideoEnrichmentAction(VIDEO_ID);
    await afterMock.mock.calls[0][0]();

    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(VIDEO_ID);
  });

  it('audits the accepted trigger', async () => {
    await runVideoEnrichmentAction(VIDEO_ID);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.video.updated',
      userId: 'admin-1',
      metadata: { videoId: VIDEO_ID, action: 'enrichment-triggered' },
    });
  });

  it('returns a typed error when the state read throws', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockRejectedValue(new Error('db down'));

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({
      success: false,
      error: 'Video enrichment failed to start. Please try again.',
    });
  });
});
