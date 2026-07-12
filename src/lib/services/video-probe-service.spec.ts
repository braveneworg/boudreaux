/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VideoRepository } from '@/lib/repositories/video-repository';
import { loggers } from '@/lib/utils/logger';
import { generatePresignedProbeUrl } from '@/lib/utils/s3-client';
import { probeUrl } from '@/lib/video-probe/ffprobe';
import { normalizeProbe, redactProbeJson } from '@/lib/video-probe/normalize';

import { VideoProbeService } from './video-probe-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: { findById: vi.fn(), saveProbeResult: vi.fn() },
}));

const fixtureNormalized = {
  container: 'mov,mp4',
  width: 1280,
  height: 720,
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrateKbps: 2500,
  frameRate: 30,
  audioChannels: 2,
  audioSampleRateHz: 44100,
  colorSpace: 'bt709',
  colorPrimaries: 'bt709',
  colorTransfer: 'bt709',
  sourceCreatedAt: null,
  encoder: 'fixture',
};

vi.mock('@/lib/services/video-enrichment-fixture', () => ({
  videoProbeFixture: {
    normalized: {
      container: 'mov,mp4',
      width: 1280,
      height: 720,
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrateKbps: 2500,
      frameRate: 30,
      audioChannels: 2,
      audioSampleRateHz: 44100,
      colorSpace: 'bt709',
      colorPrimaries: 'bt709',
      colorTransfer: 'bt709',
      sourceCreatedAt: null,
      encoder: 'fixture',
    },
    probeData: { format: { filename: 'fixture.mp4' } },
  },
}));

vi.mock('@/lib/utils/s3-client', () => ({ generatePresignedProbeUrl: vi.fn() }));

vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

vi.mock('@/lib/video-probe/ffprobe', () => ({ probeUrl: vi.fn() }));

vi.mock('@/lib/video-probe/normalize', () => ({
  normalizeProbe: vi.fn(),
  redactProbeJson: vi.fn(),
}));

const videoId = '507f1f77bcf86cd799439011';
const s3Key = `media/videos/${videoId}/clip.mp4`;
const presignedUrl = `https://bucket.s3.amazonaws.com/${s3Key}?X-Amz-Signature=deadbeef`;
const rawProbe = { format: { filename: presignedUrl } };
const normalized = { ...fixtureNormalized, encoder: 'Lavf60.3.100' };
const redacted = { format: { filename: s3Key } };

beforeEach(() => {
  vi.mocked(VideoRepository.findById).mockResolvedValue({ id: videoId, s3Key } as never);
  vi.mocked(VideoRepository.saveProbeResult).mockResolvedValue(true);
  vi.mocked(generatePresignedProbeUrl).mockResolvedValue(presignedUrl);
  vi.mocked(probeUrl).mockResolvedValue({ ok: true, raw: rawProbe });
  vi.mocked(normalizeProbe).mockReturnValue(normalized);
  vi.mocked(redactProbeJson).mockReturnValue(redacted);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('VideoProbeService.probeAndPersist', () => {
  it('skips (and persists nothing) when the video does not exist', async () => {
    vi.mocked(VideoRepository.findById).mockResolvedValue(null);

    await VideoProbeService.probeAndPersist(videoId);

    expect(VideoRepository.saveProbeResult).not.toHaveBeenCalled();
  });

  it('presigns the stored s3Key', async () => {
    await VideoProbeService.probeAndPersist(videoId);

    expect(generatePresignedProbeUrl).toHaveBeenCalledWith(s3Key);
  });

  it('probes the presigned URL', async () => {
    await VideoProbeService.probeAndPersist(videoId);

    expect(probeUrl).toHaveBeenCalledWith(presignedUrl);
  });

  it('redacts the raw JSON against the probed s3Key', async () => {
    await VideoProbeService.probeAndPersist(videoId);

    expect(redactProbeJson).toHaveBeenCalledWith(rawProbe, s3Key);
  });

  it('persists the normalized fields plus the redacted JSON on success', async () => {
    await VideoProbeService.probeAndPersist(videoId);

    expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(
      videoId,
      s3Key,
      expect.objectContaining({
        probedAt: expect.any(Date),
        probeError: null,
        probeData: redacted,
        ...normalized,
      })
    );
  });

  it('persists probedAt + probeError only when the probe fails', async () => {
    vi.mocked(probeUrl).mockResolvedValue({ ok: false, error: 'ffprobe exited with code 1' });

    await VideoProbeService.probeAndPersist(videoId);

    expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(videoId, s3Key, {
      probedAt: expect.any(Date),
      probeError: 'ffprobe exited with code 1',
    });
  });

  it('does not normalize when the probe fails', async () => {
    vi.mocked(probeUrl).mockResolvedValue({ ok: false, error: 'boom' });

    await VideoProbeService.probeAndPersist(videoId);

    expect(normalizeProbe).not.toHaveBeenCalled();
  });

  it('warns instead of throwing when the write loses the replaced-file race', async () => {
    vi.mocked(VideoRepository.saveProbeResult).mockResolvedValue(false);

    await VideoProbeService.probeAndPersist(videoId);

    expect(loggers.media.warn).toHaveBeenCalledWith(
      'Video probe result discarded: file replaced during probe',
      { videoId }
    );
  });

  it('never throws when presigning fails, and persists the failure', async () => {
    vi.mocked(generatePresignedProbeUrl).mockRejectedValue(
      new Error('AWS credentials not configured')
    );

    await VideoProbeService.probeAndPersist(videoId);

    expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(videoId, s3Key, {
      probedAt: expect.any(Date),
      probeError: 'AWS credentials not configured',
    });
  });

  it('stringifies a non-Error rejection into the persisted probe error', async () => {
    vi.mocked(generatePresignedProbeUrl).mockRejectedValue('raw-string-failure');

    await VideoProbeService.probeAndPersist(videoId);

    expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(videoId, s3Key, {
      probedAt: expect.any(Date),
      probeError: 'raw-string-failure',
    });
  });

  it('never throws when the lookup itself fails', async () => {
    vi.mocked(VideoRepository.findById).mockRejectedValue(new Error('db down'));

    await expect(VideoProbeService.probeAndPersist(videoId)).resolves.toBeUndefined();
  });

  it('never throws when even the failure persist fails', async () => {
    vi.mocked(generatePresignedProbeUrl).mockRejectedValue(new Error('presign down'));
    vi.mocked(VideoRepository.saveProbeResult).mockRejectedValue(new Error('db down'));

    await expect(VideoProbeService.probeAndPersist(videoId)).resolves.toBeUndefined();
  });

  it('never logs the presigned URL', async () => {
    vi.mocked(VideoRepository.saveProbeResult).mockResolvedValue(false);

    await VideoProbeService.probeAndPersist(videoId);

    expect(JSON.stringify(vi.mocked(loggers.media.warn).mock.calls)).not.toContain('X-Amz-');
  });

  it('persists the fixture without spawning ffprobe in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(probeUrl).not.toHaveBeenCalled();
  });

  it('does not presign in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(generatePresignedProbeUrl).not.toHaveBeenCalled();
  });

  it('persists the fixture data in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(
      videoId,
      s3Key,
      expect.objectContaining({
        probedAt: expect.any(Date),
        probeError: null,
        probeData: { format: { filename: 'fixture.mp4' } },
        ...fixtureNormalized,
      })
    );
  });
});
