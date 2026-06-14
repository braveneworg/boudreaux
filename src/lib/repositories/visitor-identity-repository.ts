/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';

import type { VisitorIdentity } from '@prisma/client';

/**
 * Repository for `VisitorIdentity` rows.
 *
 * Composite-identity store for anonymous free-download visitors. Maps a
 * long-lived first-party `visitorId` cookie to a server-derived
 * fingerprint hash so the per-release rolling-window cap survives cookie
 * clears.
 */
export class VisitorIdentityRepository {
  /**
   * Look up an identity row by canonical `visitorId` (the cookie value).
   */
  async findByVisitorId(visitorId: string): Promise<VisitorIdentity | null> {
    return prisma.visitorIdentity.findUnique({ where: { visitorId } });
  }

  /**
   * Look up an identity row by `fingerprintHash`. Used when the cookie is
   * missing or invalid, to recover the visitor's prior identity.
   *
   * Returns the most recently seen row when multiple rows share a hash
   * (e.g., shared CGNAT prefixes).
   */
  async findByFingerprintHash(fingerprintHash: string): Promise<VisitorIdentity | null> {
    return prisma.visitorIdentity.findFirst({
      where: { fingerprintHash },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Idempotent upsert that creates a new row for `visitorId` or updates the
   * `fingerprintHash` and `lastSeenAt` of an existing row. `firstSeenAt` is
   * preserved on update (append-only semantics).
   *
   * @param now - injectable clock for tests; defaults to `new Date()`
   */
  async upsert(
    params: { visitorId: string; fingerprintHash: string },
    now: Date = new Date()
  ): Promise<VisitorIdentity> {
    return prisma.visitorIdentity.upsert({
      where: { visitorId: params.visitorId },
      create: {
        visitorId: params.visitorId,
        fingerprintHash: params.fingerprintHash,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        fingerprintHash: params.fingerprintHash,
        lastSeenAt: now,
      },
    });
  }
}

export const visitorIdentityRepository = new VisitorIdentityRepository();
