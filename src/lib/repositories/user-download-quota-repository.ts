/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { DownloadSubject } from '@/types/download-subject';

import type { Prisma, UserDownloadQuota } from '@prisma/client';

/**
 * Repository for managing freemium download quota records.
 *
 * A quota row is keyed by exactly one of `userId` (authenticated subjects) or
 * `visitorId` (anonymous guests identified by the `boudreaux_visitor_id`
 * cookie). The two keying strategies are kept disjoint by sparse `@unique`
 * constraints on each column.
 *
 * Feature: 007-free-digital-downloads (guest support)
 */
export class UserDownloadQuotaRepository {
  private whereForSubject(subject: DownloadSubject): Prisma.UserDownloadQuotaWhereUniqueInput {
    return subject.kind === 'user' ? { userId: subject.userId } : { visitorId: subject.visitorId };
  }

  private createDataForSubject(subject: DownloadSubject): Prisma.UserDownloadQuotaCreateInput {
    return subject.kind === 'user'
      ? {
          user: { connect: { id: subject.userId } },
          uniqueReleaseIds: [],
        }
      : {
          visitorId: subject.visitorId,
          uniqueReleaseIds: [],
        };
  }

  /**
   * Find existing quota record or create a new one for the subject.
   */
  async findOrCreateBySubject(subject: DownloadSubject): Promise<UserDownloadQuota> {
    const existing = await prisma.userDownloadQuota.findUnique({
      where: this.whereForSubject(subject),
    });
    if (existing) {
      return existing;
    }
    return prisma.userDownloadQuota.create({
      data: this.createDataForSubject(subject),
    });
  }

  /**
   * Atomically add a unique release ID to the subject's download quota.
   *
   * A single `upsert` handles both the create (seed the array with this
   * release) and update (push the release) cases, saving the extra
   * find-or-create round trip on the hot download path.
   */
  async addUniqueRelease(subject: DownloadSubject, releaseId: string): Promise<UserDownloadQuota> {
    return prisma.userDownloadQuota.upsert({
      where: this.whereForSubject(subject),
      update: { uniqueReleaseIds: { push: releaseId } },
      create: { ...this.createDataForSubject(subject), uniqueReleaseIds: [releaseId] },
    });
  }

  /**
   * Check if the subject has exceeded the freemium quota.
   */
  async checkQuotaExceeded(subject: DownloadSubject, maxQuota = 5): Promise<boolean> {
    const quota = await this.findOrCreateBySubject(subject);
    return quota.uniqueReleaseIds.length >= maxQuota;
  }

  /**
   * Number of remaining free downloads for the subject.
   */
  async getRemainingQuota(subject: DownloadSubject, maxQuota = 5): Promise<number> {
    const quota = await this.findOrCreateBySubject(subject);
    return Math.max(0, maxQuota - quota.uniqueReleaseIds.length);
  }

  /**
   * Whether the subject has already counted the given release toward quota.
   */
  async hasDownloadedRelease(subject: DownloadSubject, releaseId: string): Promise<boolean> {
    const quota = await this.findOrCreateBySubject(subject);
    return quota.uniqueReleaseIds.includes(releaseId);
  }

  /**
   * All release IDs the subject has consumed under the freemium quota.
   */
  async getDownloadedReleaseIds(subject: DownloadSubject): Promise<string[]> {
    const quota = await this.findOrCreateBySubject(subject);
    return quota.uniqueReleaseIds;
  }
}
