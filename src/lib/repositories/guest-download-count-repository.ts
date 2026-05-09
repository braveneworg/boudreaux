/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import { DOWNLOAD_RESET_HOURS } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

import type { GuestDownloadCount } from '@prisma/client';

const RESET_MS = DOWNLOAD_RESET_HOURS * 60 * 60 * 1000;

/**
 * Repository for `GuestDownloadCount` rows.
 *
 * Tracks how many times an anonymous visitor (identified by the
 * `boudreaux_visitor_id` cookie) has downloaded a particular release within
 * the rolling `DOWNLOAD_RESET_HOURS` (6 hour) window. Rows are upserted on
 * each successful free download so the cap is enforced symmetrically with
 * the paid `PurchaseAccess` flow.
 *
 * Feature: 007-free-digital-downloads
 */
export class GuestDownloadCountRepository {
  /**
   * Find the row for a (visitorId, releaseId) pair, or null when none
   * exists.
   */
  async find(visitorId: string, releaseId: string): Promise<GuestDownloadCount | null> {
    return prisma.guestDownloadCount.findUnique({
      where: { visitorId_releaseId: { visitorId, releaseId } },
    });
  }

  /**
   * Atomically increment the download count for a (visitorId, releaseId)
   * pair, resetting the counter to 1 if the prior `lastDownloadAt` is older
   * than the reset window.
   *
   * @param now - injectable clock for tests; defaults to `new Date()`
   */
  async incrementOrReset(
    visitorId: string,
    releaseId: string,
    now: Date = new Date()
  ): Promise<GuestDownloadCount> {
    const existing = await this.find(visitorId, releaseId);
    const expired =
      existing !== null && now.getTime() - existing.lastDownloadAt.getTime() > RESET_MS;

    if (existing === null) {
      return prisma.guestDownloadCount.create({
        data: {
          visitorId,
          releaseId,
          downloadCount: 1,
          lastDownloadAt: now,
        },
      });
    }

    if (expired) {
      return prisma.guestDownloadCount.update({
        where: { visitorId_releaseId: { visitorId, releaseId } },
        data: { downloadCount: 1, lastDownloadAt: now },
      });
    }

    return prisma.guestDownloadCount.update({
      where: { visitorId_releaseId: { visitorId, releaseId } },
      data: {
        downloadCount: { increment: 1 },
        lastDownloadAt: now,
      },
    });
  }
}
