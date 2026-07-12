/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './lib/log.js';

import type { ProgressStage, VideoProgressStage } from './types.js';

/**
 * Hard cap on a single progress POST. Progress is a pure side channel, so a hung
 * endpoint must never stall generation — the request is aborted after this.
 */
const PROGRESS_TIMEOUT_MS = 2_000;

/** Arguments for a single best-effort stage-checkpoint POST. */
export interface BioProgressArgs {
  /** Absolute progress-endpoint URL supplied by the web app on the invoke event. */
  progressUrl: string;
  /** Opaque per-job token the web app verifies before recording the checkpoint. */
  jobToken: string;
  /** The stage the generation (bio) or enrichment (video) just reached. */
  stage: ProgressStage | VideoProgressStage;
  /** Optional human-readable detail for the timeline. */
  detail?: string;
  /** Optional non-negative counters for the stage (e.g. `{ candidates: 42 }`). */
  counts?: Record<string, number>;
}

/**
 * Best-effort POST of a single stage checkpoint to the web app's progress
 * endpoint. Progress is a pure side channel: this NEVER throws and — unlike the
 * completion callback — NEVER retries (a retry could replay checkpoints out of
 * order). The request is time-capped at {@link PROGRESS_TIMEOUT_MS} so a hung
 * endpoint cannot stall generation. A persistent non-ok response and a
 * thrown/aborted request are each logged (stage only — the URL may embed
 * identifiers and the token must never be logged) and then swallowed.
 *
 * @param args - The progress URL, job token, stage, and optional detail/counts.
 * @param fetchFn - Injectable fetch (defaults to the nodejs24 global `fetch`).
 */
export const postBioProgress = async (
  { progressUrl, jobToken, stage, detail, counts }: BioProgressArgs,
  fetchFn: typeof fetch = fetch
): Promise<void> => {
  try {
    const res = await fetchFn(progressUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobToken, stage, detail, counts }),
      signal: AbortSignal.timeout(PROGRESS_TIMEOUT_MS),
    });
    if (!res.ok) {
      logEvent('warn', 'bio_progress_non_ok', { stage, status: res.status });
    }
  } catch (err) {
    logEvent('warn', 'bio_progress_failed', { stage, error: toErrorMessage(err) });
  }
};
