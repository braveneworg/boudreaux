/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { VideoRepository } from '@/lib/repositories/video-repository';
import { videoProbeFixture } from '@/lib/services/video-enrichment-fixture';
import type { SaveProbeResultData } from '@/lib/types/domain/video';
import { loggers } from '@/lib/utils/logger';
import { generatePresignedProbeUrl } from '@/lib/utils/s3-client';
import { probeUrl } from '@/lib/video-probe/ffprobe';
import { normalizeProbe, redactProbeJson, type NormalizedProbe } from '@/lib/video-probe/normalize';

const logger = loggers.media;

/** Safe, always-string rendering of an unknown error (URLs never pass through here). */
const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Assemble the success payload: stamped time + normalized scalars + raw JSON. */
const buildSuccessData = (
  normalized: NormalizedProbe,
  probeData: unknown
): SaveProbeResultData => ({
  probedAt: new Date(),
  probeError: null,
  probeData,
  ...normalized,
});

/** Best-effort failure persist — a probe must never take the save flow down. */
const persistFailure = async (videoId: string, s3Key: string, message: string): Promise<void> => {
  try {
    await VideoRepository.saveProbeResult(videoId, s3Key, {
      probedAt: new Date(),
      probeError: message,
    });
  } catch (error) {
    logger.warn('Failed to persist video probe error', { videoId, error: toMessage(error) });
  }
};

/**
 * Presign → probe → normalize/redact → persist for one video. In fake mode
 * (`BIO_GENERATOR_FAKE=true` — E2E and local dev without real media/ffprobe)
 * the deterministic fixture is persisted instead of spawning ffprobe.
 */
const runProbe = async (videoId: string, s3Key: string): Promise<void> => {
  if (process.env.BIO_GENERATOR_FAKE === 'true') {
    await VideoRepository.saveProbeResult(
      videoId,
      s3Key,
      buildSuccessData(videoProbeFixture.normalized, videoProbeFixture.probeData)
    );
    return;
  }

  const url = await generatePresignedProbeUrl(s3Key);
  const result = await probeUrl(url);

  if (!result.ok) {
    await persistFailure(videoId, s3Key, result.error);
    return;
  }

  const persisted = await VideoRepository.saveProbeResult(
    videoId,
    s3Key,
    buildSuccessData(normalizeProbe(result.raw), redactProbeJson(result.raw, s3Key))
  );
  if (!persisted) {
    logger.warn('Video probe result discarded: file replaced during probe', { videoId });
  }
};

/**
 * ffprobe pipeline for uploaded videos. Kicked after create / file replacement
 * (never awaited by the admin's save) and by the manual admin Re-run.
 *
 * Guarantees: never throws — failures persist `probedAt` + `probeError` so the
 * admin technical-metadata card can surface them; the s3Key-conditional write
 * in the repository discards stale results for replaced files; the presigned
 * URL is never logged and never leaves the server.
 */
export class VideoProbeService {
  static async probeAndPersist(videoId: string): Promise<void> {
    let s3Key: string | null = null;
    try {
      const video = await VideoRepository.findById(videoId);
      if (!video) {
        logger.warn('Video probe skipped: video not found', { videoId });
        return;
      }
      s3Key = video.s3Key;
      await runProbe(videoId, video.s3Key);
    } catch (error) {
      logger.warn('Video probe failed', { videoId, error: toMessage(error) });
      if (s3Key !== null) {
        await persistFailure(videoId, s3Key, toMessage(error));
      }
    }
  }
}
