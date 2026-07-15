/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

interface LogBreachData {
  fingerprint: string;
  ipAddress: string;
}

/**
 * Rows for a fingerprint older than this are pruned on that fingerprint's next
 * breach, bounding an abusive fingerprint's log so the collection cannot grow
 * without limit on the shared-tier database. Chosen comfortably larger than any
 * rate-limit counting window so pruning never removes a row still being counted.
 */
export const RATE_LIMIT_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Append-only audit log of rate-limit breaches. Inspected by the admin
 * panel and by ad-hoc abuse investigations.
 */
export class ChatRateLimitLogRepository {
  /** Record a single 429 event, then prune this fingerprint's stale rows. */
  static async logBreach({ fingerprint, ipAddress }: LogBreachData) {
    const created = await prisma.chatRateLimitLog.create({
      data: { fingerprint, ipAddress },
    });
    // Scoped + index-served ([fingerprint, attemptedAt]) so retention stays
    // cheap: only this fingerprint's out-of-window rows are removed.
    await prisma.chatRateLimitLog.deleteMany({
      where: {
        fingerprint,
        attemptedAt: { lt: new Date(Date.now() - RATE_LIMIT_LOG_RETENTION_MS) },
      },
    });
    return created;
  }

  /** Count breaches by a single fingerprint within a rolling window. */
  static async countByFingerprintSince(fingerprint: string, since: Date) {
    return prisma.chatRateLimitLog.count({
      where: {
        fingerprint,
        attemptedAt: { gte: since },
      },
    });
  }
}
