/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postCallback } from './callback.js';
import { createWorkspace, removeWorkspace } from './lib/files.js';
import { sleep } from './lib/http.js';
import { logEvent } from './lib/log.js';
import { createProcessRunner } from './process.js';
import { reencodeAttachment } from './reencode.js';
import { createS3Store } from './s3.js';
import { callbackTargetSchema, submissionReencodeInputSchema } from './types.js';

import type { ReencoderDeps, SubmissionReencodeResult } from './types.js';
import type { ZodError } from 'zod';

/** The real collaborators: S3 through the Lambda's role, the two binaries, the network. */
export const defaultDeps: ReencoderDeps = {
  store: createS3Store(),
  runProcess: createProcessRunner(),
  fetchFn: fetch,
  now: Date.now,
  sleep,
  workspace: { create: createWorkspace, remove: removeWorkspace },
};

/**
 * Refuse an event that is not a re-encode. The web app invokes with
 * `InvocationType: 'Event'`, so the return value is discarded and the
 * attachment is already processing: reporting over the callback turns a wait
 * for the stale window into an immediate failure. The callback details are
 * read from the raw event because the parse that would have given them is the
 * one that just failed.
 *
 * Only the names of the offending fields are logged, never a value: the event
 * carries the signing key, the job token and the callback URLs.
 */
const refuseInvalid = async (
  event: unknown,
  error: ZodError,
  deps: ReencoderDeps
): Promise<SubmissionReencodeResult> => {
  logEvent('warn', 'reencode_invalid_input', {
    fields: error.issues.map(({ path }) => path.join('.')),
  });
  const result: SubmissionReencodeResult = { ok: false, error: 'failed' };
  const callback = callbackTargetSchema.safeParse(event);
  if (callback.success) {
    await postCallback(
      {
        url: callback.data.callbackUrl,
        jobToken: callback.data.jobToken,
        signingKey: callback.data.signingKey,
        result,
      },
      deps
    );
  }
  return result;
};

/**
 * The testable core of the Lambda: validate the event, re-encode the
 * attachment, and — when the event carries a `callbackUrl` + `jobToken` — POST
 * the signed result to the web app's completion callback. `deps` is the
 * dependency-injection seam used by unit tests; it must NEVER be wired to a
 * positional handler argument, since AWS fills the handler's second argument
 * with the Lambda context, not deps (see {@link lambdaHandler}).
 */
export const runLambda = async (
  event: unknown,
  deps: ReencoderDeps = defaultDeps
): Promise<SubmissionReencodeResult> => {
  const parsed = submissionReencodeInputSchema.safeParse(event);
  if (!parsed.success) {
    return refuseInvalid(event, parsed.error, deps);
  }
  const result = await reencodeAttachment(parsed.data, deps);

  const { callbackUrl, jobToken, signingKey } = parsed.data;
  if (callbackUrl && jobToken) {
    await postCallback({ url: callbackUrl, jobToken, signingKey, result }, deps);
  }
  return result;
};

/**
 * AWS Lambda entry point (registered as `handler.lambdaHandler`). AWS invokes
 * an async handler as `(event, context)`, so the second argument is the Lambda
 * context — NOT a dependency bag. It is accepted and deliberately ignored here
 * so it can never be mistaken for `deps`: binding context to `deps` is what
 * broke every invocation of the bio generator in v4.183.0. All work — and the
 * injectable seam — lives in {@link runLambda}, always run against the real
 * {@link defaultDeps}.
 */
export const lambdaHandler = async (
  event: unknown,
  _context?: unknown
): Promise<SubmissionReencodeResult> => runLambda(event);
