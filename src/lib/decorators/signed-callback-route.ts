/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { JOB_SIGNATURE_HEADER } from '@fakefour/job-contract/signing';

import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type { JobAdapter, JobResult, JobTypes } from '@/lib/services/job-runner/types';
import type { CallbackProof } from '@/lib/services/lambda-dispatch';
import { loggers } from '@/lib/utils/logger';

import { withRateLimit } from './with-rate-limit';

import type { z } from 'zod';

type RateLimiter = Parameters<typeof withRateLimit>[0];

interface SignedRoute<T extends JobTypes> {
  job: JobAdapter<T>;
  /** Bodies longer than this are refused with 413 before anything is parsed. */
  maxBodyBytes: number;
  limiter: RateLimiter;
  limit: number;
}

interface CallbackRoute<T extends JobTypes> extends SignedRoute<T> {
  channel: 'callback';
  schema: z.ZodType<{ jobToken: string; result: JobResult<T['data']> }>;
  /** Runs after the completion, post-response (both artist kinds revalidate the artist's pages). */
  onComplete?: (claim: T['claim']) => void;
}

interface ProgressRoute<T extends JobTypes> extends SignedRoute<T> {
  channel: 'progress';
  schema: z.ZodType<{ jobToken: string } & T['checkpoint']>;
}

type ParsedBody = { ok: true; json: unknown } | { ok: false };

const parseBody = (rawBody: string): ParsedBody => {
  try {
    return { ok: true, json: JSON.parse(rawBody) };
  } catch {
    return { ok: false };
  }
};

/** Always 202 with no body: never reveal whether the token matched (anti-enumeration). */
const accepted = (): NextResponse => new NextResponse(null, { status: 202 });

const answerCallback = async <T extends JobTypes>(
  { job, schema, onComplete }: CallbackRoute<T>,
  { id, body, proof }: { id: string; body: ParsedBody; proof: CallbackProof }
): Promise<NextResponse> => {
  if (!body.ok) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  }

  const { jobToken, result } = parsed.data;
  const claim = await jobRunner.claim(job, id, jobToken, proof);
  if (claim !== null) {
    // The heavy persistence runs post-response; the admin's poll surfaces completion.
    after(async () => {
      await jobRunner.complete(job, id, result, claim);
      onComplete?.(claim);
    });
  }
  return accepted();
};

const answerProgress = async <T extends JobTypes>(
  { job, schema }: ProgressRoute<T>,
  { id, body, proof }: { id: string; body: ParsedBody; proof: CallbackProof }
): Promise<NextResponse> => {
  // Every rejection but 413 answers 202 with no write: a parse failure, a
  // schema failure, a bad token, or a job that is not processing.
  if (!body.ok) return accepted();

  const parsed = schema.safeParse(body.json);
  if (parsed.success) {
    const { jobToken, ...checkpoint } = parsed.data;
    await jobRunner.recordProgress(job, id, { jobToken, checkpoint, proof });
  } else {
    // The issue summary only — never the raw body — so a drifted Lambda
    // payload surfaces without leaking its input.
    loggers.media.warn('job_progress_schema_rejected', {
      kind: job.kind,
      issues: parsed.error.issues.map(({ code, path, message }) => ({ code, path, message })),
    });
  }
  return accepted();
};

/**
 * The signed callback route (CONTEXT.md "signed callback"): one protocol for
 * every job's Lambda → app callback and progress POSTs. Rate-limits, refuses
 * an oversized body with 413, hands the job runner the proof — the
 * `x-job-signature` header plus the raw body exactly as received, the bytes
 * the Lambda signed (ADR-0014) — and answers 202 without saying whether the
 * POST was accepted.
 *
 * - `callback`: 400 on bad JSON or a schema failure; a won claim completes
 *   inside `after()`, then runs the completion hook.
 * - `progress`: 202 for everything but 413; the checkpoint is recorded, never
 *   claimed.
 */
export const signedCallbackRoute = <T extends JobTypes>(
  route: CallbackRoute<T> | ProgressRoute<T>
) =>
  withRateLimit<{ id: string }>(
    route.limiter,
    route.limit
  )(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const rawBody = await request.text();
    if (rawBody.length > route.maxBodyBytes) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const proof = { signature: request.headers.get(JOB_SIGNATURE_HEADER), rawBody };
    const body = parseBody(rawBody);
    return route.channel === 'callback'
      ? answerCallback(route, { id, body, proof })
      : answerProgress(route, { id, body, proof });
  });
