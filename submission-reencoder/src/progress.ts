/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Adapted from bio-generator/src/progress.ts: the two Lambda projects are
// standalone and cannot import each other.

import { describeFetchError, withJobSignature } from './callback.js';
import { logEvent } from './lib/log.js';

import type { ReencodeProgressStage, ReencoderDeps } from './types.js';

/**
 * Hard cap on a single progress POST. Progress is a pure side channel, so a
 * hung endpoint must never stall a re-encode — the request is aborted after this.
 */
const PROGRESS_TIMEOUT_MS = 2_000;

/** The least time between two POSTs that carry only a percent. */
const PERCENT_INTERVAL_MS = 3_000;

const PERCENT_MAX = 100;

/** Where progress goes, read from the invoke event. */
export interface ProgressTarget {
  /** Absolute progress-endpoint URL supplied by the web app on the invoke event. */
  progressUrl: string;
  /** Opaque per-job token the web app verifies before recording the checkpoint. */
  jobToken: string;
  /** Per-job HMAC key from the invoke event; when present the POST is signed (ADR-0014). */
  signingKey?: string;
}

/** One checkpoint. */
export interface ProgressPost extends ProgressTarget {
  stage: ReencodeProgressStage;
  /** How far through the stage, 0 to 100, where the stage can tell. */
  percent?: number;
}

/** The seams a progress POST goes through. */
export type ProgressTransport = Pick<ReencoderDeps, 'fetchFn' | 'now'>;

/**
 * Best-effort POST of one checkpoint to the web app's progress endpoint. This
 * NEVER throws and — unlike the completion callback — NEVER retries (a retry
 * could replay checkpoints out of order). A non-ok response and a thrown or
 * aborted request are each logged with the stage only, then swallowed.
 *
 * Nothing here logs the URL, the token or the key.
 */
export const postProgress = async (
  { progressUrl, jobToken, stage, percent, signingKey }: ProgressPost,
  { fetchFn, now }: ProgressTransport
): Promise<void> => {
  try {
    const post = signingKey ? withJobSignature(fetchFn, signingKey, now) : fetchFn;
    const res = await post(progressUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobToken, stage, percent }),
      signal: AbortSignal.timeout(PROGRESS_TIMEOUT_MS),
    });
    if (!res.ok) {
      logEvent('warn', 'reencode_progress_non_ok', { stage, status: res.status });
    }
  } catch (err) {
    logEvent('warn', 'reencode_progress_failed', { stage, error: describeFetchError(err) });
  }
};

/** Reports a run's progress, one POST at a time and in order. */
export interface ProgressReporter {
  /** Post a stage checkpoint. Always sent; resolves once it has landed. */
  stage: (stage: ReencodeProgressStage) => Promise<void>;
  /**
   * Note how far through the current stage the run is. Sent at most once every
   * {@link PERCENT_INTERVAL_MS}, and only when it has moved forward. Returns at
   * once: an encode must not wait on the web app.
   */
  percent: (percent: number) => void;
  /** Resolves once every POST started so far has landed. */
  settle: () => Promise<void>;
}

/** A percent as the wire takes it: a whole number from 0 to 100. */
const wholePercent = (percent: number): number =>
  Math.min(PERCENT_MAX, Math.max(0, Math.floor(percent)));

const silentReporter: ProgressReporter = {
  stage: async () => {},
  percent: () => {},
  settle: async () => {},
};

/**
 * Build the reporter for one run. With no target (the event named no progress
 * URL or no token) it posts nothing.
 */
export const createProgressReporter = (
  target: ProgressTarget | null,
  transport: ProgressTransport
): ProgressReporter => {
  if (!target) {
    return silentReporter;
  }
  let current: ReencodeProgressStage | null = null;
  let lastPercent = -1;
  let lastPostAt = Number.NEGATIVE_INFINITY;
  let landed: Promise<void> = Promise.resolve();

  // Chained, so two POSTs never overlap and a stage never overtakes the
  // percent sent before it. `postProgress` never rejects, so neither does this.
  const send = (stage: ReencodeProgressStage, percent?: number): Promise<void> => {
    lastPostAt = transport.now();
    landed = landed.then(() => postProgress({ ...target, stage, percent }, transport));
    return landed;
  };

  return {
    stage: (stage) => {
      current = stage;
      lastPercent = -1;
      return send(stage);
    },
    percent: (percent) => {
      const whole = wholePercent(percent);
      const tooSoon = transport.now() - lastPostAt < PERCENT_INTERVAL_MS;
      if (current === null || whole <= lastPercent || tooSoon) {
        return;
      }
      lastPercent = whole;
      void send(current, whole);
    },
    settle: () => landed,
  };
};
