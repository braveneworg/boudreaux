/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';

import { fakeBioGeneration, type BioGenerationLambdaInput } from './bio-generation-fixture';

/**
 * Observable in-flight window for the local adapter. The real Lambda takes
 * minutes and streams stage checkpoints; the fixture resolves instantly, so the
 * adapter pauses here to give the polled admin timeline (2.5s) a window to
 * render a checkpoint before the run completes. Overridable via
 * `BIO_GENERATOR_FAKE_DELAY_MS`; unit tests set `0`.
 */
export const DEFAULT_LOCAL_DISPATCH_DELAY_MS = 4000;

const resolveDelayMs = (): number => {
  const raw = Number(process.env.BIO_GENERATOR_FAKE_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_LOCAL_DISPATCH_DELAY_MS;
};

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const postJson = async (url: string, body: unknown): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    loggers.media.error('Local bio dispatch callback rejected', undefined, {
      url,
      status: response.status,
    });
  }
};

/**
 * The in-process adapter behind `BioGenerationService.generate`.
 *
 * Stands in for the AWS `Event` invoke when no Lambda is available (local dev,
 * E2E). Crucially it behaves like the Lambda rather than replacing it: it POSTs
 * a real progress checkpoint and a real completion callback to the same routes
 * the Lambda calls, carrying the same `jobToken`.
 *
 * That is the point of this module. The fake used to sit one level above the
 * seam, persisting the bio and flipping the artist to `succeeded` directly — so
 * under E2E the jobToken round-trip, the callback route, the single-use token
 * claim, `completeCallback`, and the progress channel never executed at all.
 * Routing the fake through the wire exercises every one of them.
 *
 * Awaits its own work rather than floating a promise: the caller runs inside
 * Next.js `after()`, so the response has already been sent and the delay costs
 * the user nothing, while a detached promise could be cut short.
 */
export const dispatchBioGenerationLocally = async (
  input: BioGenerationLambdaInput
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { callbackUrl, progressUrl, jobToken } = input;

  if (!callbackUrl || !jobToken) {
    return { ok: false, error: 'Local bio dispatch requires a callback URL and job token' };
  }

  try {
    if (progressUrl) {
      await postJson(progressUrl, {
        jobToken,
        stage: 'vision-gating',
        counts: { candidates: 3 },
      });
    }

    await sleep(resolveDelayMs());

    await postJson(callbackUrl, { jobToken, result: fakeBioGeneration(input) });
    return { ok: true };
  } catch (error) {
    loggers.media.error('Local bio dispatch failed', error);
    return { ok: false, error: 'Failed to reach the bio generator' };
  }
};
