/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VideoRepository } from '@/lib/repositories/video-repository';
import { loggers } from '@/lib/utils/logger';
import { generatePresignedProbeUrl } from '@/lib/utils/s3-client';
import { probeUrl } from '@/lib/video-probe/ffprobe';
import { normalizeProbe, redactProbeJson } from '@/lib/video-probe/normalize';
import { extractProbePrefillTags } from '@/lib/video-probe/probe-tags';

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
    raw: (url: string) => ({ format: { filename: url } }),
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

vi.mock('@/lib/video-probe/probe-tags', () => ({
  extractProbePrefillTags: vi.fn(),
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

  it('does not spawn ffprobe in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(probeUrl).not.toHaveBeenCalled();
  });

  it('does not presign in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(generatePresignedProbeUrl).not.toHaveBeenCalled();
  });

  /**
   * The fake substitutes only the two impossible steps — signing and the spawn.
   * It used to substitute the whole pipeline, persisting a hand-written
   * normalized object, so a regression in `normalizeProbe` was invisible to
   * every E2E run.
   */
  it('normalizes the fixture output for real in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(normalizeProbe).toHaveBeenCalledWith({ format: { filename: expect.any(String) } });
  });

  it('redacts the fixture output for real in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    expect(redactProbeJson).toHaveBeenCalledWith(
      { format: { filename: expect.any(String) } },
      s3Key
    );
  });

  /** The local URL must look presigned, or redaction has nothing to strip. */
  it('probes a signed-looking URL in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeAndPersist(videoId);

    const [raw] = vi.mocked(normalizeProbe).mock.calls[0] as [{ format: { filename: string } }];
    expect(raw.format.filename).toContain('X-Amz-Signature=');
  });
});

describe('VideoProbeService.probeForPrefill', () => {
  const fixtureTags = {
    title: 'Fixture Title',
    artist: 'Fixture Artist',
    releasedOn: '2020-01-01',
    description: null,
    durationSeconds: 120,
  };

  beforeEach(() => {
    vi.mocked(extractProbePrefillTags).mockReturnValue(fixtureTags);
  });

  it('returns ok:true with fixture tags in fake mode without calling S3 or probeUrl', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await VideoProbeService.probeForPrefill(s3Key);

    expect(result).toEqual({ ok: true, tags: fixtureTags });
    expect(generatePresignedProbeUrl).not.toHaveBeenCalled();
    expect(probeUrl).not.toHaveBeenCalled();
  });

  /**
   * Prefill used to read the tags off the fixture's pre-baked probeData. Now it
   * extracts them from the same raw output the real path parses, so the tag
   * extractor is genuinely exercised under E2E.
   */
  it('extracts prefill tags from the raw fixture output in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await VideoProbeService.probeForPrefill(s3Key);

    expect(extractProbePrefillTags).toHaveBeenCalledWith({
      format: { filename: expect.any(String) },
    });
  });

  it('presigns the s3Key and probes the URL in real mode, returning tags on success', async () => {
    const result = await VideoProbeService.probeForPrefill(s3Key);

    expect(generatePresignedProbeUrl).toHaveBeenCalledWith(s3Key);
    expect(probeUrl).toHaveBeenCalledWith(presignedUrl);
    expect(extractProbePrefillTags).toHaveBeenCalledWith(rawProbe);
    expect(result).toEqual({ ok: true, tags: fixtureTags });
  });

  it('returns ok:false with error message when probeUrl fails, without throwing', async () => {
    vi.mocked(probeUrl).mockResolvedValue({ ok: false, error: 'ffprobe spawn error' });

    const result = await VideoProbeService.probeForPrefill(s3Key);

    expect(result).toEqual({ ok: false, error: 'ffprobe spawn error' });
  });

  it('returns ok:false with error message when the presigner throws, without throwing', async () => {
    vi.mocked(generatePresignedProbeUrl).mockRejectedValue(new Error('AWS credentials missing'));

    const result = await VideoProbeService.probeForPrefill(s3Key);

    expect(result).toEqual({ ok: false, error: 'AWS credentials missing' });
  });

  it('never touches VideoRepository in any code path', async () => {
    await VideoProbeService.probeForPrefill(s3Key);
    expect(VideoRepository.findById).not.toHaveBeenCalled();
    expect(VideoRepository.saveProbeResult).not.toHaveBeenCalled();
  });
});
