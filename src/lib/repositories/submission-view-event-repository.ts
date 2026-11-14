/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';
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
      if (error instanceof DataError && error.code === 'DUPLICATE') {
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
   * submissions that hold at least `minimum`. In no promised order, and of
   * any submission, listed or not: what may be shown is the caller's rule.
   */
  static async countsSince(cutoff: Date, minimum: number): Promise<SubmissionViewCount[]> {
    const groups = await prisma.submissionViewEvent.groupBy({
      by: ['submissionId'],
      where: { viewedAt: { gte: cutoff } },
      _count: { _all: true },
      having: { submissionId: { _count: { gte: minimum } } },
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
