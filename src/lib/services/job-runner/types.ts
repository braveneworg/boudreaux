/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { Json } from '@/lib/types/domain/shared';

import type { JobKind } from '@fakefour/job-contract/signing';
import type { z } from 'zod';

/**
 * The job runner's vocabulary (CONTEXT.md "job runner"). A job kind plugs in
 * through one {@link JobAdapter}: its state reads and writes, its Lambda
 * payload, its fake data and its copy. Everything else about the async job
 * lifecycle lives once, in the runner.
 */

/** The lifecycle columns every job stores on its entity row, as the runner reads them. */
export interface JobState {
  status: string | null;
  startedAt: Date | null;
  error: string | null;
  jobToken: string | null;
  /** The latest stored checkpoint; a job without a progress channel stores none. */
  progress: Json | null;
}

/** The result envelope every completion callback carries. */
export type JobResult<TData> = { ok: true; data: TData } | { ok: false; error: string };

/** What the runner adds to every invoke payload: where to answer, and how to prove it. */
export interface JobDispatch {
  callbackUrl: string;
  /** Present only for a job with a progress channel. */
  progressUrl?: string;
  jobToken: string;
  /** Per-job HMAC key the Lambda, or the local adapter, signs its POSTs with (ADR-0014). */
  signingKey: string;
}

/** A fire-and-forget invoke's acknowledgement. */
export type InvokeAck = { ok: true } | { ok: false; error: string };

/** A job kind's type parameters, grouped so its adapter names them once. */
export interface JobTypes {
  /** The entity row the adapter reads: the lifecycle columns plus what the kind needs. */
  record: unknown;
  /** What a trigger hands the run (bio: the admin's links and description). */
  input: unknown;
  /** The invoke payload without the dispatch fields. */
  request: object;
  /** The data of an ok result. */
  data: unknown;
  /** What a won claim hands the completion (both artist kinds: the artist slug). */
  claim: object;
  /** What persistence hands the succeeded write (images-from-links: the added count). */
  persisted: unknown;
  /** A progress POST without its job token. */
  checkpoint: object;
  /** A stored checkpoint, as the status view surfaces it. */
  progress: unknown;
}

/** The invoke payload: the kind's request plus the runner's dispatch fields. */
export type JobPayload<T extends JobTypes> = T['request'] & JobDispatch;

/** A job kind's copy for the failures the runner and the invoker record. */
export interface JobCopy {
  /** The trigger found no entity. */
  notFound: string;
  /** `NEXT_PUBLIC_BASE_URL` is unset, so no callback URL can be built. */
  noCallbackUrl: string;
  /** `BIO_GENERATOR_LAMBDA_NAME` is unset. */
  notConfigured: string;
  /** The Lambda invoke failed. */
  unreachable: string;
  /** A run threw something that is not an `Error`. */
  runFailed: string;
  /** Persistence threw something that is not an `Error`. */
  persistFailed: string;
}

/** A job's progress channel: images-from-links has none. */
export interface JobProgressChannel<T extends JobTypes> {
  path: (id: string) => string;
  /** Parses a stored checkpoint for the status view. */
  schema: z.ZodType<T['progress']>;
  write: (id: string, progress: T['checkpoint'] & { at: string }) => Promise<void>;
}

/** The fake data the local invoke adapter POSTs for this kind (`BIO_GENERATOR_FAKE=true`). */
export interface JobFake<T extends JobTypes> {
  /** The in-flight dwell when `BIO_GENERATOR_FAKE_DELAY_MS` is unset. */
  delayMs: number;
  /** The checkpoint POSTed before the dwell; none skips the progress POST. */
  checkpoint?: (payload: JobPayload<T>) => T['checkpoint'];
  result: (payload: JobPayload<T>) => JobResult<T['data']>;
}

/** How one job kind plugs into the runner. */
export interface JobAdapter<T extends JobTypes> {
  kind: JobKind;
  copy: JobCopy;
  callbackPath: (id: string) => string;
  progress?: JobProgressChannel<T>;
  fake: JobFake<T>;

  read: (id: string) => Promise<T['record'] | null>;
  state: (record: T['record']) => JobState;
  claimContext: (record: T['record']) => T['claim'];
  /** Why this entity may not run, or null: checked by the trigger before any write, and by the run before it begins. */
  refusal?: (record: T['record']) => string | null;

  /** Marks the job `pending` and records its start in the same write. */
  markPending: (id: string, startedAt: Date) => Promise<void>;
  /** The runner gate as one conditional write; true iff this caller began the run. */
  begin: (id: string, now: Date) => Promise<boolean>;
  setToken: (id: string, token: string | null) => Promise<void>;
  /** The atomic single-use claim; true iff this caller won it. */
  claimToken: (id: string, token: string) => Promise<boolean>;
  recordFailed: (id: string, error: string) => Promise<void>;
  recordSucceeded: (id: string, persisted: T['persisted']) => Promise<void>;

  prepare: (
    id: string,
    input: T['input']
  ) => Promise<{ ok: true; request: T['request'] } | { ok: false; error: string }>;
  persist: (id: string, data: T['data'], claim: T['claim']) => Promise<T['persisted']>;
}

/** The Lambda invoke, as a port: a production adapter and one local adapter shared by every kind. */
export interface JobInvoker {
  invoke: <T extends JobTypes>(job: JobAdapter<T>, payload: JobPayload<T>) => Promise<InvokeAck>;
}
