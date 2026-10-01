/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FREE_DOWNLOAD_WINDOW_MS, type DigitalFormatType } from '@/lib/constants/digital-formats';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { UserDownloadQuotaRepository } from '@/lib/repositories/user-download-quota-repository';
import { guestVisitorIds, isUserSubject, type DownloadSubject } from '@/types/download-subject';

import { purchaseThrottleResetInHours } from './decide';

import type { DownloadFacts, DownloadMode, Grant } from './types';

/** Request metadata every audit row carries. */
export interface AuditContext {
  ipAddress: string;
  userAgent: string;
}

/** The counter facts `decide` needs — everything in DownloadFacts the stores own. */
export type CounterFacts = Pick<
  DownloadFacts,
  'entitled' | 'lifetime' | 'freeThrottle' | 'purchaseThrottle'
>;

export interface CommitArgs {
  subject: DownloadSubject;
  releaseId: string;
  grant: Grant;
  /** The facts the grant was decided on — the purchase throttle restart reads them. */
  facts: CounterFacts;
  now: Date;
  audit: AuditContext;
}

export interface FailureArgs {
  subject: DownloadSubject;
  releaseId: string;
  formats: DigitalFormatType[];
  errorCode: string;
  /** The mode the gate had decided, or null when it failed before deciding. */
  mode: DownloadMode | null;
  audit: AuditContext;
}

/**
 * The gate's seam onto the four counter stores (ADR-0018): entitlement
 * (`ReleasePurchase`), the lifetime cap (`UserDownloadQuota`), the free
 * throttle (`DownloadEvent` rows in `free` mode) and the purchase throttle
 * (`ReleaseDownload`). `read` never writes; `commit` charges exactly what the
 * Grant asks for; `recordFailure` writes an uncounted audit row.
 */
export interface DownloadCounters {
  read(subject: DownloadSubject, releaseId: string, now: Date): Promise<CounterFacts>;
  commit(args: CommitArgs): Promise<void>;
  recordFailure(args: FailureArgs): Promise<void>;
}

const events = new DownloadEventRepository();
const quotas = new UserDownloadQuotaRepository();

const identityOf = (subject: DownloadSubject) =>
  isUserSubject(subject) ? { userId: subject.userId } : { visitorIds: guestVisitorIds(subject) };

const auditOwner = (subject: DownloadSubject) =>
  isUserSubject(subject)
    ? { userId: subject.userId, visitorId: null }
    : { userId: null, visitorId: subject.visitorId };

export const prismaCounters: DownloadCounters = {
  async read(subject, releaseId, now) {
    const windowStart = new Date(now.getTime() - FREE_DOWNLOAD_WINDOW_MS);
    const freeThrottle = events.countFreeDownloadsInWindow({
      releaseId,
      windowStart,
      ...identityOf(subject),
    });

    if (!isUserSubject(subject)) {
      // A guest is always on the free tier: no entitlement, no lifetime cap.
      return {
        entitled: false,
        lifetime: null,
        freeThrottle: await freeThrottle,
        purchaseThrottle: null,
      };
    }

    const [purchase, releaseIds] = await Promise.all([
      PurchaseRepository.findByUserAndRelease(subject.userId, releaseId),
      quotas.findReleaseIds(subject),
    ]);
    const entitled = purchase !== null;
    const record = entitled
      ? await PurchaseRepository.getDownloadRecord(subject.userId, releaseId)
      : null;

    return {
      entitled,
      lifetime: {
        distinctReleases: releaseIds.length,
        includesThisRelease: releaseIds.includes(releaseId),
      },
      freeThrottle: await freeThrottle,
      purchaseThrottle: entitled
        ? { count: record?.downloadCount ?? 0, lastDownloadedAt: record?.lastDownloadedAt ?? null }
        : null,
    };
  },

  async commit({ subject, releaseId, grant, facts, now, audit }) {
    const owner = auditOwner(subject);

    if (grant.charge.lifetime && isUserSubject(subject)) {
      await quotas.addUniqueRelease(subject, releaseId);
    }

    if (grant.charge.freeThrottle) {
      // One counted row per download, not per format: the free throttle
      // counts downloads of a release, and the audit names the bundle by its
      // first format as it always has.
      await events.logDownloadEvent({
        ...owner,
        releaseId,
        formatType: grant.formats[0].formatType,
        success: true,
        mode: 'free',
        ...audit,
      });
    }

    if (grant.charge.purchaseThrottle && isUserSubject(subject)) {
      const throttle = facts.purchaseThrottle;
      const restart =
        throttle !== null &&
        throttle.count >= MAX_RELEASE_DOWNLOAD_COUNT &&
        purchaseThrottleResetInHours(throttle, now) === null;
      await PurchaseRepository.recordPurchasedDownload(subject.userId, releaseId, { restart, now });
      // Paid downloads are audited per format and never tick the free throttle.
      for (const { formatType } of grant.formats) {
        await events.logDownloadEvent({
          ...owner,
          releaseId,
          formatType,
          success: true,
          mode: 'purchased',
          ...audit,
        });
      }
    }
  },

  async recordFailure({ subject, releaseId, formats, errorCode, mode, audit }) {
    await events.logDownloadEvent({
      ...auditOwner(subject),
      releaseId,
      formatType: formats[0],
      success: false,
      errorCode,
      mode,
      ...audit,
    });
  },
};
