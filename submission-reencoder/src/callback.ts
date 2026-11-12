/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Adapted from bio-generator/src/callback.ts: the two Lambda projects are
// standalone and cannot import each other.

import { JOB_SIGNATURE_HEADER, signJobBody } from '@fakefour/job-contract/signing';

import { fetchWithRetry } from './lib/http.js';
import { logEvent } from './lib/log.js';

import type { ReencoderDeps, SubmissionReencodeResult } from './types.js';

/** The completion callback the Lambda POSTs its result to. */
export interface CallbackPayload {
  /** Absolute callback URL supplied by the web app on the invoke event. */
  url: string;
  /** Opaque per-job token echoed back so the web app can match the in-flight job. */
  jobToken: string;
  /** The result envelope: what was written, or the refusal's code. */
  result: SubmissionReencodeResult;
  /**
   * Per-job HMAC key the web app derived at dispatch (ADR-0014). When present
   * every attempt is signed in `x-job-signature`.
   */
  signingKey?: string;
}

/** The seams a callback POST goes through. */
export type CallbackTransport = Pick<ReencoderDeps, 'fetchFn' | 'sleep' | 'now'>;

/**
 * Hard cap on one callback attempt. The callback runs in what the run budget
 * leaves of the Lambda's 900s, so a hung endpoint must not take all of it.
 */
const CALLBACK_ATTEMPT_TIMEOUT_MS = 15_000;

const MILLISECONDS_PER_SECOND = 1000;

/**
 * What went wrong with a request, without its message: a fetch error's message
 * can carry the URL, and the URL must never reach a log. The error's name and
 * the socket's code (`ECONNREFUSED`, `ENOTFOUND`, …) say enough.
 */
export const describeFetchError = (err: unknown): string => {
  if (!(err instanceof Error)) {
    return 'unknown';
  }
  const cause: unknown = err.cause;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';

  return code ? `${err.name}:${code}` : err.name;
};

/**
 * Wrap `fetchFn` so every attempt — including each retry — signs the body it
 * is about to send with a fresh timestamp, keeping a retried delivery inside
 * the verifier's replay window.
 */
export const withJobSignature = (
  fetchFn: typeof fetch,
  signingKey: string,
  now: () => number
): typeof fetch => {
  const signed: typeof fetch = (url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    const signature = signJobBody(signingKey, body, now() / MILLISECONDS_PER_SECOND);
    return fetchFn(url, {
      ...init,
      headers: { ...init?.headers, [JOB_SIGNATURE_HEADER]: signature },
    });
  };
  return signed;
};

/** Wrap `fetchFn` so every attempt is aborted after its own `timeoutMs`. */
export const withAttemptTimeout = (fetchFn: typeof fetch, timeoutMs: number): typeof fetch => {
  const capped: typeof fetch = (url, init) =>
    fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  return capped;
};

/**
 * Best-effort POST of the result back to the web app's callback, signed per
 * attempt when the event carried a `signingKey` (ADR-0014). Never throws — the
 * result was already produced; a failed callback leaves the web app to time
 * the job out. A transient 429/503 backs off and retries; a persistent non-ok
 * response is logged with its status only.
 *
 * Nothing here logs the URL, the token or the key.
 */
export const postCallback = async (
  { url, jobToken, result, signingKey }: CallbackPayload,
  { fetchFn, sleep, now }: CallbackTransport
): Promise<void> => {
  const capped = withAttemptTimeout(fetchFn, CALLBACK_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobToken, result }),
      },
      { fetchFn: signingKey ? withJobSignature(capped, signingKey, now) : capped, sleep }
    );
    if (!res.ok) {
      logEvent('warn', 'reencode_callback_non_ok', { status: res.status });
    }
  } catch (err) {
    logEvent('warn', 'reencode_callback_failed', { error: describeFetchError(err) });
  }
};
