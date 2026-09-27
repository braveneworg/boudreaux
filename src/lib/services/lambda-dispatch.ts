/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { LambdaClient } from '@aws-sdk/client-lambda';
import {
  deriveJobSigningKey,
  signJobBody,
  verifyJobSignature,
  type JobSigningIdentity,
} from '@fakefour/job-contract/signing';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { loggers } from '@/lib/utils/logger';

/**
 * Shared scaffolding for the async jobs dispatched to the bio-generator Lambda
 * as fire-and-forget `Event` invokes (bio generation, video enrichment,
 * images-from-links): one client, one token compare, one callback-signature
 * scheme (ADR-0014), one fake-path delay.
 */

/**
 * The `Event` invoke returns 202 immediately (the Lambda then POSTs its result
 * to a callback route), so the HTTP client only needs a short timeout covering
 * the dispatch round-trip.
 */
export const INVOKE_REQUEST_TIMEOUT_MS = 30 * 1000;

let lambdaClient: LambdaClient | null = null;

/** The process-wide Lambda client for `Event` dispatches, created on first use. */
export const getLambdaClient = (): LambdaClient => {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttpHandler({ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }),
    });
  }
  return lambdaClient;
};

/**
 * Constant-time comparison of two job-token strings. Compares equal-length
 * `Buffer`s via {@link timingSafeEqual}; the length pre-check leaks nothing
 * meaningful because job tokens are fixed-length random UUIDs.
 */
export const tokensMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/** Minimum length of `JOB_CALLBACK_SECRET`, matching `AUTH_SECRET`'s floor. */
export const JOB_CALLBACK_SECRET_MIN_LENGTH = 32;

/**
 * The app-only secret every per-job signing key derives from (ADR-0014).
 * Throws when unset or too short: env validation requires it in production,
 * so reaching this at dispatch is a configuration bug, not a runtime state.
 */
const resolveJobCallbackSecret = (): string => {
  const secret = process.env.JOB_CALLBACK_SECRET;
  if (!secret || secret.length < JOB_CALLBACK_SECRET_MIN_LENGTH) {
    throw new Error(
      `JOB_CALLBACK_SECRET must be set to at least ${JOB_CALLBACK_SECRET_MIN_LENGTH} characters`
    );
  }
  return secret;
};

/**
 * The per-job signing key handed to the Lambda inside the invoke payload —
 * never stored. Deterministic in the job identity, so the verifier re-derives
 * it from the stored token instead of persisting it.
 */
export const signingKeyForJob = (identity: JobSigningIdentity): string =>
  deriveJobSigningKey(resolveJobCallbackSecret(), identity);

/** Sign a callback body the way the Lambda does — for the fake (local) dispatch paths. */
export const signCallbackBody = (identity: JobSigningIdentity, rawBody: string): string =>
  signJobBody(signingKeyForJob(identity), rawBody, Date.now() / 1000);

/** What a callback or progress route hands the service to prove the POST came from the Lambda. */
export interface CallbackProof {
  /** The `x-job-signature` header value, or `null` when the request carried none. */
  signature: string | null;
  /** The request body exactly as received — the bytes the Lambda signed. */
  rawBody: string;
}

/**
 * Verify a callback's signature against the key re-derived from the STORED
 * job token. Fails closed — an unset secret, a missing header, a stale
 * timestamp, or a digest mismatch all return `false` — and logs the reason
 * (never the signature or the key) so a rejected delivery is visible.
 */
export const verifyJobCallback = (
  identity: JobSigningIdentity,
  { signature, rawBody }: CallbackProof
): boolean => {
  const { kind, entityId } = identity;
  let signingKey: string;
  try {
    signingKey = signingKeyForJob(identity);
  } catch {
    loggers.media.warn('job_callback_signature_rejected', {
      kind,
      entityId,
      reason: 'unconfigured',
    });
    return false;
  }
  const verdict = verifyJobSignature({
    header: signature,
    rawBody,
    signingKey,
    nowSeconds: Date.now() / 1000,
  });
  if (!verdict.ok) {
    loggers.media.warn('job_callback_signature_rejected', {
      kind,
      entityId,
      reason: verdict.reason,
    });
  }
  return verdict.ok;
};

/**
 * The fake-path (`BIO_GENERATOR_FAKE=true`) in-flight delay from
 * `BIO_GENERATOR_FAKE_DELAY_MS`, or `fallbackMs` when it is unset, not a
 * number, or negative. Unit tests set `0`; never used on the real path.
 */
export const resolveFakeDelayMs = (fallbackMs: number): number => {
  const raw = Number(process.env.BIO_GENERATOR_FAKE_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallbackMs;
};

/** Resolve after `ms`; short-circuits to an already-resolved promise for `ms <= 0`. */
export const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
