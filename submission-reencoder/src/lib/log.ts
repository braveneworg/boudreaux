/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Adapted from bio-generator/src/lib/log.ts: the two Lambda projects are
// standalone and cannot import each other.

/** Severity for a structured log event. */
export type LogLevel = 'info' | 'warn';

/**
 * Emits a single structured JSON log line to stdout/stderr so CloudWatch Logs
 * Insights can filter on `event` and the extra fields. The Lambda has no logger
 * dependency, so this is the project's logging seam.
 *
 * Never pass it the signing key, the job token, or a callback or progress URL:
 * the invoke event is the only place those travel.
 *
 * @param level - `info` for normal milestones, `warn` for degraded steps.
 * @param event - Stable machine-readable event name (e.g. `reencode_refused`).
 * @param fields - Optional structured context merged into the log payload.
 */
export const logEvent = (
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
): void => {
  const payload = JSON.stringify({ level, event, ...fields });
  if (level === 'warn') {
    console.warn(payload);
  } else {
    console.info(payload);
  }
};

/** Normalizes a caught `unknown` into a string suitable for a log field. */
export const toErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
