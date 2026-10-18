// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { gateAction } from '@/lib/auth/action-gate';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import {
  VideoEnrichmentService,
  videoEnrichmentJob,
} from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import { logSecurityEvent } from '@/utils/audit-log';

import { runVideoEnrichmentAction } from './run-video-enrichment-action';

const afterMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => afterMock(cb) }));
vi.mock('@/lib/auth/action-gate');
vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('@/lib/services/job-runner/job-runner', () => ({ jobRunner: { trigger: vi.fn() } }));
vi.mock('@/lib/services/video-enrichment-service', () => ({
  videoEnrichmentJob: { kind: 'video-enrichment' },
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
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

beforeEach(() => {
  afterMock.mockReset();
  vi.mocked(gateAction).mockResolvedValue({
    success: true,
    session: { user: { id: 'admin-1', role: 'admin' } } as never,
  });
  vi.mocked(jobRunner.trigger).mockResolvedValue({
    success: true,
    data: { status: 'pending', started: true },
  });
  vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
  vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
});

describe('runVideoEnrichmentAction', () => {
  it('returns the gate refusal without triggering the job', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual(REFUSAL);
    expect(jobRunner.trigger).not.toHaveBeenCalled();
  });

  it('rejects a malformed video id', async () => {
    const result = await runVideoEnrichmentAction('not-an-object-id');

    expect(result).toEqual({ success: false, error: 'Invalid video id.', code: 'INVALID_INPUT' });
    expect(jobRunner.trigger).not.toHaveBeenCalled();
  });

  it('triggers the video enrichment job for the video', async () => {
    await runVideoEnrichmentAction(VIDEO_ID);

    expect(vi.mocked(jobRunner.trigger).mock.calls).toEqual([[videoEnrichmentJob, VIDEO_ID]]);
  });

  it.each([
    { code: 'NOT_FOUND' as const, error: 'Video not found.' },
    {
      code: 'VALIDATION' as const,
      error: 'Add an artist or creator and save before running enrichment.',
    },
  ])('returns the $code refusal with its code without scheduling anything', async (refusal) => {
    vi.mocked(jobRunner.trigger).mockResolvedValueOnce({ success: false, ...refusal });

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: false, ...refusal });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('echoes an in-flight run without scheduling or auditing another', async () => {
    vi.mocked(jobRunner.trigger).mockResolvedValueOnce({
      success: true,
      data: { status: 'processing', started: false },
    });

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(afterMock).not.toHaveBeenCalled();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('returns pending and schedules the probe, then the enrichment, after the response', async () => {
    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({ success: true, status: 'pending' });
    await afterMock.mock.calls[0][0]();
    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(VIDEO_ID);
    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(VIDEO_ID);
    expect(vi.mocked(VideoProbeService.probeAndPersist).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(VideoEnrichmentService.runEnrichmentJob).mock.invocationCallOrder[0]
    );
  });

  it('still runs enrichment when the probe fails (probe never blocks)', async () => {
    vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValueOnce(
      new Error('ffprobe missing')
    );

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

  it('returns a typed error when the trigger throws', async () => {
    vi.mocked(jobRunner.trigger).mockRejectedValueOnce(new Error('db down'));

    const result = await runVideoEnrichmentAction(VIDEO_ID);

    expect(result).toEqual({
      success: false,
      error: 'Video enrichment failed to start. Please try again.',
      code: 'UNKNOWN',
    });
  });
});
