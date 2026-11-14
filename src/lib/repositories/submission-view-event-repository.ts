/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import { isDataErrorWithCode } from '@/lib/types/domain/errors';
import type {
  RecordViewEventData,
  SubmissionViewCount,
} from '@/lib/types/domain/submission-view-event';

/**
 * Data-access layer for the `SubmissionViewEvent` model (ADR-0029): the
 * stored form of a view. The only layer that touches Prisma for view events.
 * Nothing here reads or writes who a viewer was: the model has nowhere to
 * keep it.
 */
export class SubmissionViewEventRepository {
  /**
   * Store a view event unless its key is already held. Says whether this call
   * wrote it: `false` when the same viewer was already counted for that
   * submission that day. The unique index on the key decides, so of several
   * calls racing for one key exactly one writes.
   */
  static async record(data: RecordViewEventData): Promise<boolean> {
    try {
      await prisma.submissionViewEvent.create({ data, select: { id: true } });

      return true;
    } catch (error) {
      // By name and code, never `instanceof`: on the dev server this error
      // can come from another copy of the class, and a repeat view would
      // then be a failure instead of nothing.
      if (isDataErrorWithCode(error, 'DUPLICATE')) {
        return false;
      }

      throw error;
    }
  }

  /** Whether a view key is already held. */
  static async exists(viewKey: string): Promise<boolean> {
    const held = await prisma.submissionViewEvent.count({ where: { viewKey } });

    return held > 0;
  }

  /**
   * How many view events each submission holds from `cutoff` on, for the
   * submissions that hold at least `minimum`: the most viewed first, and no
   * more than `limit` of them, so the caller's next read is bounded however
   * many submissions have been viewed. The id breaks a tie, so the cut is
   * the same on every read. Of any submission, listed or not: what may be
   * shown is the caller's rule.
   */
  static async countsSince(
    cutoff: Date,
    minimum: number,
    limit: number
  ): Promise<SubmissionViewCount[]> {
    const groups = await prisma.submissionViewEvent.groupBy({
      by: ['submissionId'],
      where: { viewedAt: { gte: cutoff } },
      _count: { _all: true },
      having: { submissionId: { _count: { gte: minimum } } },
      orderBy: [{ _count: { submissionId: 'desc' } }, { submissionId: 'asc' }],
      take: limit,
    });

    return groups.map(({ submissionId, _count }) => ({ submissionId, views: _count._all }));
  }

  /** Delete every view event from before `cutoff`. Returns how many there were. */
  static async deleteBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.submissionViewEvent.deleteMany({
      where: { viewedAt: { lt: cutoff } },
    });

    return count;
  }
}
