/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { STALE_JOB_MS } from '@/utils/async-job-lifecycle';

import { isUnset } from './where-kit';

/**
 * The runner gate (`runnerShouldSkip`) as a Prisma `where`, so a runner can
 * claim a job with ONE conditional write instead of read-then-write: a job
 * may begin unless it is `processing` with a start fresher than the stale
 * window. `pending` is the trigger's handoff and never blocks; an in-flight
 * job with no recorded start reads as abandoned (see the lifecycle module).
 * Two runners racing for one job both pass a read; only one passes this
 * write. Proved by `async-job-where.contract.spec.ts`.
 */
export const mayBeginRunWhere = <S extends string, T extends string>(
  statusField: S,
  startedAtField: T,
  now: Date
): MayBeginRunWhere<S, T> =>
  ({
    OR: [
      { [statusField]: { not: 'processing' } },
      // `not` excludes an absent field and a bare null misses it (see the
      // where-kit): both storages of "never ran" must begin.
      ...isUnset(statusField).OR,
      ...isUnset(startedAtField).OR,
      { [startedAtField]: { lt: new Date(now.getTime() - STALE_JOB_MS) } },
    ],
  }) as MayBeginRunWhere<S, T>;

type MayBeginRunWhere<S extends string, T extends string> = {
  OR: Array<
    | Record<S, { not: 'processing' } | null | { isSet: false }>
    | Record<T, { lt: Date } | null | { isSet: false }>
  >;
};
