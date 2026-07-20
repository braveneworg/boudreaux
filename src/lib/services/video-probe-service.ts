/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { VideoRepository } from '@/lib/repositories/video-repository';
import { buildLocalProbeUrl, probeLocally } from '@/lib/services/video-probe-local-adapters';
import type { SaveProbeResultData } from '@/lib/types/domain/video';
import { loggers } from '@/lib/utils/logger';
import { generatePresignedProbeUrl } from '@/lib/utils/s3-client';
import { probeUrl, type ProbeUrlResult } from '@/lib/video-probe/ffprobe';
import { normalizeProbe, redactProbeJson, type NormalizedProbe } from '@/lib/video-probe/normalize';
import { extractProbePrefillTags, type ProbePrefillTags } from '@/lib/video-probe/probe-tags';

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

/** True when no AWS or ffprobe is available — E2E, and local dev without media. */
const isLocalProbe = (): boolean => process.env.BIO_GENERATOR_FAKE === 'true';

/**
 * Sign a probe URL, or build a signed-looking local one when there is no AWS.
 */
const resolveProbeUrl = async (s3Key: string): Promise<string> =>
  isLocalProbe() ? buildLocalProbeUrl(s3Key) : generatePresignedProbeUrl(s3Key);

/** Spawn ffprobe, or return the fixture's raw output when there is no binary. */
const runFfprobe = async (url: string): Promise<ProbeUrlResult> =>
  isLocalProbe() ? probeLocally(url) : probeUrl(url);

/**
 * Presign → probe → normalize/redact → persist for one video.
 *
 * In fake mode only the two genuinely-impossible steps are substituted — URL
 * signing and the ffprobe spawn. `normalizeProbe`, `redactProbeJson`, the
 * failure branch and the stale-file-race check all run for real, so an E2E
 * assertion on the persisted scalars now exercises the code that produces them
 * rather than restating a hand-written fixture.
 */
const runProbe = async (videoId: string, s3Key: string): Promise<void> => {
  const url = await resolveProbeUrl(s3Key);
  const result = await runFfprobe(url);

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

export type ProbePrefillResult =
  | { ok: true; tags: ProbePrefillTags }
  | { ok: false; error: string };

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

  /**
   * Probe an S3 key without persisting — used to prefill the admin video form
   * before the Video row exists. Never throws; returns `{ ok: false, error }`
   * on any failure. No VideoRepository calls.
   */
  static async probeForPrefill(s3Key: string): Promise<ProbePrefillResult> {
    try {
      const url = await resolveProbeUrl(s3Key);
      const result = await runFfprobe(url);

      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      return { ok: true, tags: extractProbePrefillTags(result.raw) };
    } catch (error) {
      return { ok: false, error: toMessage(error) };
    }
  }
}
