/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether an asynchronous job that recorded `startedAt` should be treated as
 * abandoned.
 *
 * A job is stale once it has been running longer than `staleMs` — the server
 * restarted mid-run, the Lambda was killed at its timeout, or the completion
 * callback was lost.
 *
 * **A job with no recorded start is stale.** It cannot be shown to be running,
 * so the safe reading is "abandoned": that lets a new run supersede it and lets
 * a polling UI resolve. The opposite reading — treating an unknown start as
 * live — leaves the caller waiting on a job that may not exist.
 *
 * This predicate is shared by every trigger path and status read across bio
 * generation and video enrichment. Those five sites previously spelled it two
 * different ways and disagreed on exactly the missing-`startedAt` case.
 *
 * **Writers must uphold the matching invariant: anything that marks a job
 * in-flight has to record `startedAt` in the same write.** A job is in flight
 * from `pending`, not from `processing` — the trigger writes `pending` and the
 * service flips to `processing` later. Stamping only on `processing` leaves a
 * window where a live job looks abandoned and its status chip reads "Failed".
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
