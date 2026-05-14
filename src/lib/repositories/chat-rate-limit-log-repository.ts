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
 * Append-only audit log of rate-limit breaches. Inspected by the admin
 * panel and by ad-hoc abuse investigations.
 */
export class ChatRateLimitLogRepository {
  /** Record a single 429 event. */
  static async logBreach({ fingerprint, ipAddress }: LogBreachData) {
    return prisma.chatRateLimitLog.create({
      data: { fingerprint, ipAddress },
    });
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
