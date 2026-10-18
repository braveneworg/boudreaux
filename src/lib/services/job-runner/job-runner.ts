/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  signingKeyForJob,
  tokensMatch,
  verifyJobCallback,
  type CallbackProof,
} from '@/lib/services/lambda-dispatch';
import type { ServiceResponse } from '@/lib/services/service.types';
import { resolveEnrichmentBaseUrl } from '@/lib/utils/enrichment-base-url';
import { loggers } from '@/lib/utils/logger';
import {
  blocksNewTrigger,
  isInFlightJobStatus,
  resolveStaleJobView,
  toAsyncJobStatus,
  type AsyncJobStatus,
} from '@/utils/async-job-lifecycle';

import { jobInvoker } from './job-invoker';

import type { JobAdapter, JobInvoker, JobResult, JobTypes } from './types';

export interface JobRunnerDeps {
  /** The Lambda invoke port. */
  invoker: JobInvoker;
}

/**
 * How a run ended on this side of the seam: dispatched to the Lambda (or the
 * local adapter) for the callback to finish, skipped because another runner
 * holds the job or the adapter refused, or failed before dispatch.
 */
export type JobRunResult =
  { status: 'dispatched' } | { status: 'skipped' } | { status: 'failed'; error: string };

/** An accepted trigger: the in-flight status, and whether this trigger started the run. */
export interface JobTrigger {
  status: 'pending' | 'processing';
  started: boolean;
}

/** A progress POST as the route hands it over: its token, its checkpoint, and its proof. */
export interface JobProgressPost<T extends JobTypes> {
  jobToken: string;
  checkpoint: T['checkpoint'];
  proof: CallbackProof;
}

/** A status read after the stale coercion, with progress only while in flight. */
export interface JobStatusView<TProgress> {
  status: AsyncJobStatus | null;
  error: string | null;
  progress: TProgress | null;
}

/**
 * The job runner (CONTEXT.md "job runner"): the server half of the async job
 * lifecycle, written once for every background job. A job kind plugs in
 * through a {@link JobAdapter}; the Lambda invoke is a port.
 *
 * - `trigger`: not found → refused → in-flight echo → write `pending`.
 * - `run`: refused → begin → prepare → base URL → key → token → invoke.
 * - `view`: the stale coercion, with progress only while in flight.
 * - `claim`: signature → token compare → atomic single-use claim.
 * - `recordProgress`: signature → token compare → `processing` → write.
 * - `complete`: persist the result and record the terminal status.
 *
 * `run`, `recordProgress` and `complete` never throw: they run after the
 * response, inside Next.js `after()`, where an unhandled rejection is lost.
 */
export class JobRunner {
  constructor(private readonly deps: JobRunnerDeps) {}

  async trigger<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string
  ): Promise<ServiceResponse<JobTrigger>> {
    const record = await job.read(id);
    if (record === null) {
      return { success: false, error: job.copy.notFound, code: 'NOT_FOUND' };
    }
    // Refused BEFORE any status write, so a job the run would refuse is never
    // stranded at `pending`.
    const refusal = job.refusal?.(record) ?? null;
    if (refusal !== null) {
      return { success: false, error: refusal, code: 'VALIDATION' };
    }

    const { status: stored, startedAt } = job.state(record);
    const status = toAsyncJobStatus(stored);
    if (blocksNewTrigger(status, startedAt)) {
      return {
        success: true,
        data: { status: status === 'processing' ? 'processing' : 'pending', started: false },
      };
    }

    await job.markPending(id, new Date());
    return { success: true, data: { status: 'pending', started: true } };
  }

  async run<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    input: T['input']
  ): Promise<JobRunResult> {
    try {
      if (await this.refusesRun(job, id)) {
        return { status: 'skipped' };
      }
      // One conditional write begins the run (the runner gate); a second
      // runner for the same job loses here instead of invoking twice.
      if (!(await job.begin(id, new Date()))) {
        return { status: 'skipped' };
      }
      return await this.dispatch(job, id, input);
    } catch (error) {
      return this.fail(job, id, error instanceof Error ? error.message : job.copy.runFailed);
    }
  }

  view<T extends JobTypes>(job: JobAdapter<T>, record: T['record']): JobStatusView<T['progress']> {
    const state = job.state(record);
    // Non-persistent: the stored row is untouched, so a late callback can still claim it.
    const { status, error } = resolveStaleJobView({
      status: toAsyncJobStatus(state.status),
      startedAt: state.startedAt,
      error: state.error,
    });
    const parsed = isInFlightJobStatus(status)
      ? job.progress?.schema.safeParse(state.progress)
      : undefined;
    return { status, error, progress: parsed?.success ? parsed.data : null };
  }

  /**
   * Verifies a completion callback and claims the job atomically, so it
   * completes once even when the at-least-once `Event` invoke or the Lambda's
   * retried POST delivers it twice. Returns the adapter's claim context on a
   * win; `null`, without touching the token, otherwise.
   */
  async claim<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    jobToken: string,
    proof: CallbackProof
  ): Promise<T['claim'] | null> {
    const record = await job.read(id);
    if (record === null) return null;
    const { status, jobToken: stored } = job.state(record);
    if (status !== 'processing' || !stored) return null;
    // A mismatched or forged callback never attempts the claim.
    if (!this.verifies(job, id, { stored, presented: jobToken, proof })) return null;
    if (!(await job.claimToken(id, jobToken))) return null;
    return job.claimContext(record);
  }

  /**
   * Records a progress checkpoint. Verifies like {@link claim} but never
   * claims, so a stream of checkpoints can never consume the single-use token.
   * The server stamps `at`, overwriting any `at` the checkpoint carries.
   *
   * @returns `true` iff the checkpoint was written.
   */
  async recordProgress<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    { jobToken, checkpoint, proof }: JobProgressPost<T>
  ): Promise<boolean> {
    const channel = job.progress;
    if (!channel) return false;
    try {
      const record = await job.read(id);
      if (record === null) return false;
      const { status, jobToken: stored } = job.state(record);
      if (!stored || !this.verifies(job, id, { stored, presented: jobToken, proof })) return false;
      if (status !== 'processing') return false;

      await channel.write(id, { ...checkpoint, at: new Date().toISOString() });
      return true;
    } catch (error) {
      // A lost checkpoint is cosmetic; it must not break the run.
      loggers.media.error('job_progress_record_failed', error, { kind: job.kind, entityId: id });
      return false;
    }
  }

  /** Completes a claimed job: persists an ok result, then records the terminal status. */
  async complete<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    result: JobResult<T['data']>,
    claim: T['claim']
  ): Promise<void> {
    if (!result.ok) {
      await this.recordFailed(job, id, result.error);
      return;
    }
    let persisted: T['persisted'];
    try {
      persisted = await job.persist(id, result.data, claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : job.copy.persistFailed;
      await this.recordFailed(job, id, message);
      return;
    }
    await this.writeTerminal(job, id, 'succeeded', () => job.recordSucceeded(id, persisted));
  }

  /** Mints the token, stores it, and hands the payload to the invoke port. */
  private async dispatch<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    input: T['input']
  ): Promise<JobRunResult> {
    const prepared = await job.prepare(id, input);
    if (!prepared.ok) return this.fail(job, id, prepared.error);

    const base = resolveEnrichmentBaseUrl();
    if (!base) return this.fail(job, id, job.copy.noCallbackUrl);

    const jobToken = randomUUID();
    // Derived before the token is stored, so a missing secret fails the run
    // (via the catch in `run`) without leaving a claimable token behind.
    const signingKey = signingKeyForJob({ kind: job.kind, entityId: id, jobToken });
    await job.setToken(id, jobToken);

    const ack = await this.deps.invoker.invoke(job, {
      ...prepared.request,
      callbackUrl: `${base}${job.callbackPath(id)}`,
      ...(job.progress && { progressUrl: `${base}${job.progress.path(id)}` }),
      jobToken,
      signingKey,
    });
    if (!ack.ok) {
      await job.setToken(id, null);
      return this.fail(job, id, ack.error);
    }
    return { status: 'dispatched' };
  }

  /** The adapter's pre-begin refusal (video eligibility); a missing entity never runs. */
  private async refusesRun<T extends JobTypes>(job: JobAdapter<T>, id: string): Promise<boolean> {
    if (!job.refusal) return false;
    const record = await job.read(id);
    return record === null || job.refusal(record) !== null;
  }

  /**
   * The signature first, under the key re-derived from the STORED token
   * (ADR-0014), so a leaked token alone can't forge a callback; then the
   * constant-time token compare.
   */
  private verifies<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    { stored, presented, proof }: { stored: string; presented: string; proof: CallbackProof }
  ): boolean {
    return (
      verifyJobCallback({ kind: job.kind, entityId: id, jobToken: stored }, proof) &&
      tokensMatch(stored, presented)
    );
  }

  private async fail<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    error: string
  ): Promise<JobRunResult> {
    await this.recordFailed(job, id, error);
    return { status: 'failed', error };
  }

  private recordFailed<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    error: string
  ): Promise<void> {
    return this.writeTerminal(job, id, 'failed', () => job.recordFailed(id, error));
  }

  /**
   * A terminal status write is logged, never thrown, so the `after()` paths
   * keep their never-throws contract; the stale coercion then resolves the
   * stuck row on the next read.
   */
  private async writeTerminal<T extends JobTypes>(
    job: JobAdapter<T>,
    id: string,
    status: 'failed' | 'succeeded',
    write: () => Promise<void>
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      loggers.media.error('job_status_write_failed', error, {
        kind: job.kind,
        entityId: id,
        status,
      });
    }
  }
}

/** The production runner: the invoke port chooses the Lambda or the local adapter. */
export const jobRunner = new JobRunner({ invoker: jobInvoker });
