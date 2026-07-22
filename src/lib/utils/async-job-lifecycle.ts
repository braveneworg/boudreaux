/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The async job lifecycle, as one pure decision module.
 *
 * Bio generation and video enrichment run the same background-job shape:
 * `pending → processing → succeeded/failed`, an atomic token claim, progress
 * checkpoints, a read-time stale coercion, and client polling with a give-up
 * deadline. This module owns the lifecycle's *decisions* — both jobs consume
 * it. It never writes: status transitions and the token claim stay in the
 * repositories, and it is deliberately client-safe (no `server-only`) so
 * polling hooks and admin panels consume the same facts the server does.
 *
 * The two gate questions are named and deliberately different:
 *
 * - {@link blocksNewTrigger} — a fresh `pending` blocks a new trigger.
 *   A queued job is a job; triggering again would double-run it.
 * - {@link runnerShouldSkip} — only a fresh `processing` blocks the runner.
 *   `pending` must NOT block here: it is the handoff the runner exists to
 *   consume. Collapsing these two questions into one predicate deadlocks
 *   every run on its own trigger write.
 *
 * **Writers must uphold the matching invariant: anything that marks a job
 * in-flight has to record `startedAt` in the same write.** A job is in flight
 * from `pending`, not from `processing` — the trigger writes `pending` and the
 * service flips to `processing` later. Stamping only on `processing` leaves a
 * window where a live job looks abandoned and its status chip reads "Failed".
 */

/** Async job lifecycle states (null = never run). */
export const ASYNC_JOB_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
export type AsyncJobStatus = (typeof ASYNC_JOB_STATUSES)[number];

/**
 * A job is considered stale (abandoned — the server restarted mid-run, the
 * Lambda was killed at its 15-minute timeout, or the completion callback was
 * lost) once it has been in flight longer than this. Must exceed the Lambda's
 * 15-minute timeout so a healthy in-flight job is never treated as dead. Used
 * both to let a new trigger supersede an abandoned run and to resolve the
 * polling UI — {@link resolveStaleJobView} coerces a job older than this to
 * `failed` on read.
 */
export const STALE_JOB_MS = 17 * 60 * 1000;

/**
 * Client-side poll deadline: how long an admin panel keeps polling a triggered
 * run before giving up and surfacing {@link STALE_JOB_TIMEOUT_MESSAGE}.
 *
 * Ordering invariant: `CLIENT_POLL_DEADLINE_MS > STALE_JOB_MS`, so the
 * server's stale coercion (which flips the job to `failed`) resolves the UI
 * first in normal operation; the client deadline is the last-resort stop for
 * when the status endpoint never returns a terminal status at all (e.g. it is
 * unreachable and every poll fails). Pinned by this module's spec.
 */
export const CLIENT_POLL_DEADLINE_MS = 20 * 60 * 1000;

/**
 * The one timeout copy, shared by the server's stale coercion and the client
 * panels' give-up toasts — previously string-copied across the server/client
 * edge because the server constant lived in a `server-only` service.
 */
export const STALE_JOB_TIMEOUT_MESSAGE = 'Job timed out. Please try again.';

/** Narrow a stored status string to the lifecycle union (null when unknown). */
export const toAsyncJobStatus = (status: string | null | undefined): AsyncJobStatus | null =>
  status != null && (ASYNC_JOB_STATUSES as readonly string[]).includes(status)
    ? (status as AsyncJobStatus)
    : null;

/** In-flight states — polling continues only while the job is one of these. */
export const isInFlightJobStatus = (status: AsyncJobStatus | null | undefined): boolean =>
  status === 'pending' || status === 'processing';

/**
 * Whether an asynchronous job that recorded `startedAt` should be treated as
 * abandoned.
 *
 * **A job with no recorded start is stale.** It cannot be shown to be running,
 * so the safe reading is "abandoned": that lets a new run supersede it and lets
 * a polling UI resolve. The opposite reading — treating an unknown start as
 * live — leaves the caller waiting on a job that may not exist.
 *
 * @param startedAt - When the job recorded that it began, if it ever did.
 * @param staleMs - Age past which a running job is treated as abandoned.
 */
export const isStaleJob = (startedAt: Date | null | undefined, staleMs: number): boolean => {
  if (!startedAt) {
    return true;
  }

  return Date.now() - startedAt.getTime() > staleMs;
};

/**
 * Trigger gate: a genuinely in-flight (fresh `pending`/`processing`) job
 * blocks a new trigger — the site echoes the in-flight status back instead of
 * starting a duplicate run. A stale in-flight job does not block: the new
 * trigger supersedes the abandoned one.
 */
export const blocksNewTrigger = (
  status: AsyncJobStatus | null | undefined,
  startedAt: Date | null | undefined
): boolean => isInFlightJobStatus(status) && !isStaleJob(startedAt, STALE_JOB_MS);

/**
 * Runner gate: only a fresh `processing` job makes the runner skip. `pending`
 * must not block — it is the trigger's handoff, the very state the runner
 * consumes (see the module doc for why this is not {@link blocksNewTrigger}).
 */
export const runnerShouldSkip = (
  status: AsyncJobStatus | null | undefined,
  startedAt: Date | null | undefined
): boolean => status === 'processing' && !isStaleJob(startedAt, STALE_JOB_MS);

/** A status read after the stale coercion: what the polling client should see. */
export interface StaleJobView {
  status: AsyncJobStatus | null;
  error: string | null;
}

/**
 * Read-time stale coercion: an in-flight job older than {@link STALE_JOB_MS}
 * reads as `failed` with {@link STALE_JOB_TIMEOUT_MESSAGE} so the polling UI
 * resolves instead of hanging on `processing` forever. Non-persistent — the
 * stored row is untouched and a late completion callback can still claim it.
 */
export const resolveStaleJobView = ({
  status,
  startedAt,
  error,
}: {
  status: AsyncJobStatus | null;
  startedAt: Date | null | undefined;
  error: string | null;
}): StaleJobView => {
  const isStale = isInFlightJobStatus(status) && isStaleJob(startedAt, STALE_JOB_MS);

  return isStale ? { status: 'failed', error: STALE_JOB_TIMEOUT_MESSAGE } : { status, error };
};
