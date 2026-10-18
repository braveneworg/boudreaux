/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand } from '@aws-sdk/client-lambda';
import { JOB_SIGNATURE_HEADER, signJobBody } from '@fakefour/job-contract/signing';

import { getLambdaClient, resolveFakeDelayMs, sleep } from '@/lib/services/lambda-dispatch';
import { loggers } from '@/lib/utils/logger';

import type { JobInvoker } from './types';

/** The one copy only the local adapter can produce, whatever the job kind. */
const LOCAL_DISPATCH_FAILED = 'Local job dispatch failed';

/**
 * The production adapter: a fire-and-forget `Event` invoke of the
 * bio-generator Lambda. The Lambda answers 202 at once and POSTs its result
 * to the callback URL, so there is no response body to read. Never throws.
 */
export const lambdaJobInvoker: JobInvoker = {
  invoke: async (job, payload) => {
    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      loggers.media.error('job_invoke_unconfigured', undefined, { kind: job.kind });
      return { ok: false, error: job.copy.notConfigured };
    }

    try {
      await getLambdaClient().send(
        new InvokeCommand({
          FunctionName: functionName,
          // Fire-and-forget: 202 + empty payload; the result arrives via callback.
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(payload)),
        })
      );
      return { ok: true };
    } catch (error) {
      loggers.media.error('job_invoke_failed', error, { kind: job.kind });
      return { ok: false, error: job.copy.unreachable };
    }
  },
};

/** POSTs `body` signed exactly as the Lambda signs it (ADR-0014). */
const postSigned = async (
  kind: string,
  { url, body, signingKey }: { url: string; body: object; signingKey: string }
): Promise<void> => {
  const rawBody = JSON.stringify(body);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [JOB_SIGNATURE_HEADER]: signJobBody(signingKey, rawBody, Date.now() / 1000),
    },
    body: rawBody,
    cache: 'no-store',
  });

  if (!response.ok) {
    loggers.media.error('local_job_dispatch_rejected', undefined, {
      kind,
      url,
      status: response.status,
    });
  }
};

/**
 * The local adapter, shared by every job kind (`BIO_GENERATOR_FAKE=true`).
 *
 * Stands in for the AWS `Event` invoke when no Lambda is available (local dev,
 * E2E). Crucially it behaves like the Lambda rather than replacing it: it POSTs
 * a real progress checkpoint and a real completion callback to the same routes
 * the Lambda calls, carrying the same `jobToken`.
 *
 * That is the point of this module. The fake used to sit one level above the
 * seam, persisting the result and flipping the job to `succeeded` directly — so
 * under E2E the jobToken round-trip, the callback route, the single-use token
 * claim, the completion, and the progress channel never executed at all.
 * Routing the fake through the wire exercises every one of them.
 *
 * Awaits its own work rather than floating a promise: the caller runs inside
 * Next.js `after()`, so the response has already been sent and the delay costs
 * the user nothing, while a detached promise could be cut short.
 */
export const localJobInvoker: JobInvoker = {
  invoke: async (job, payload) => {
    const { callbackUrl, progressUrl, jobToken, signingKey } = payload;
    try {
      const checkpoint = job.fake.checkpoint?.(payload);
      if (checkpoint && progressUrl) {
        await postSigned(job.kind, {
          url: progressUrl,
          body: { jobToken, ...checkpoint },
          signingKey,
        });
      }

      // An observable in-flight window: the polled admin timeline (2.5s)
      // renders the checkpoint before the run completes.
      await sleep(resolveFakeDelayMs(job.fake.delayMs));

      await postSigned(job.kind, {
        url: callbackUrl,
        body: { jobToken, result: job.fake.result(payload) },
        signingKey,
      });
      return { ok: true };
    } catch (error) {
      loggers.media.error('local_job_dispatch_failed', error, { kind: job.kind });
      return { ok: false, error: LOCAL_DISPATCH_FAILED };
    }
  },
};

/**
 * The invoke port as the production runner sees it: the one place the adapter
 * is chosen, per invoke, by `BIO_GENERATOR_FAKE`. Everything downstream of
 * this choice is identical on both paths.
 */
export const jobInvoker: JobInvoker = {
  invoke: (job, payload) =>
    (process.env.BIO_GENERATOR_FAKE === 'true' ? localJobInvoker : lambdaJobInvoker).invoke(
      job,
      payload
    ),
};
