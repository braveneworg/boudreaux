/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { JOB_SIGNATURE_HEADER, signJobBody } from '@fakefour/job-contract/signing';

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';

import type { BioGenerationResult, ImageLinksResult, VideoEnrichmentResult } from './types.js';

/** The async completion callback the Lambda POSTs its generation result to. */
export interface BioCallbackPayload {
  /** Absolute callback URL supplied by the web app on the invoke event. */
  url: string;
  /** Opaque per-job token echoed back so the web app can match the in-flight job. */
  jobToken: string;
  /** The discriminated result envelope produced by the run (success or error). */
  result: BioGenerationResult | VideoEnrichmentResult | ImageLinksResult;
  /**
   * Per-job HMAC key the web app derived at dispatch (ADR-0014). When present
   * every attempt is signed in `x-job-signature`; absent on events from a web
   * app that predates signing, which then posts unsigned as before.
   */
  signingKey?: string;
}

/**
 * Wrap `fetchFn` so every attempt — including each retry — signs the body it
 * is about to send with a fresh timestamp, keeping a retried delivery inside
 * the verifier's replay window.
 */
export const withJobSignature = (fetchFn: typeof fetch, signingKey: string): typeof fetch => {
  const signed: typeof fetch = (url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    const signature = signJobBody(signingKey, body, Date.now() / 1000);
    return fetchFn(url, {
      ...init,
      headers: { ...init?.headers, [JOB_SIGNATURE_HEADER]: signature },
    });
  };
  return signed;
};

/**
 * Best-effort POST of the generation result back to the web app's callback,
 * signed per attempt when the event carried a `signingKey` (ADR-0014).
 * Never throws — the result was already produced; a failed callback just leaves
 * the web app to time the job out and let a retrigger supersede it. Uses
 * {@link fetchWithRetry} so a transient 429/503 on the callback endpoint backs
 * off and retries rather than dropping the result on the first blip. A
 * persistent non-ok response is logged (`bio_callback_non_ok`, status only) so
 * a mis-derived callback URL is visible instead of failing silently.
 *
 * @param payload - The callback URL, job token, and result to deliver.
 * @param fetchFn - Injectable fetch (defaults to the nodejs24 global `fetch`).
 */
export const postBioCallback = async (
  { url, jobToken, result, signingKey }: BioCallbackPayload,
  fetchFn: typeof fetch = fetch
): Promise<void> => {
  try {
    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobToken, result }),
      },
      { fetchFn: signingKey ? withJobSignature(fetchFn, signingKey) : fetchFn }
    );
    // fetchWithRetry only retries 429/503 and otherwise returns the last
    // response without throwing, so a persistent 4xx from a mis-derived
    // callback URL would be silently dropped. Surface it (status only — the
    // URL may embed identifiers and the token must never be logged).
    if (!res.ok) {
      logEvent('warn', 'bio_callback_non_ok', { status: res.status });
    }
  } catch (err) {
    logEvent('warn', 'bio_callback_failed', { error: toErrorMessage(err) });
  }
};
