/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';

/**
 * Shared scaffolding for the async jobs dispatched to the bio-generator Lambda
 * as fire-and-forget `Event` invokes (bio generation, video enrichment,
 * images-from-links): one client, one token compare, one fake-path delay.
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
