/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

interface CreateBannedIdentityData {
  userId?: string | null;
  email: string;
  fingerprintHash?: string | null;
  bannedByAdminId: string;
  reason?: string | null;
}

interface MatchActiveBanParams {
  userId?: string | null;
  email?: string | null;
  fingerprintHash?: string | null;
}

/**
 * Data-access layer for {@link BannedIdentity}. Powers ban-evasion
 * enforcement at signup/login and the disabled-user chat UX gate.
 * A ban record is "active" when `unbannedAt` is null.
 */
export class BannedIdentityRepository {
  /**
   * Create a new ban record. `email` is normalized to lowercase before
   * persistence so casing differences never bypass the check.
   */
  static async create(data: CreateBannedIdentityData) {
    return prisma.bannedIdentity.create({
      data: {
        userId: data.userId ?? null,
        email: data.email.trim().toLowerCase(),
        fingerprintHash: data.fingerprintHash ?? null,
        bannedByAdminId: data.bannedByAdminId,
        reason: data.reason ?? null,
      },
    });
  }

  /**
   * Return the first active ban whose userId, email, or fingerprint
   * hash matches the request. Returns `null` when none match.
   *
   * The OR-list is built dynamically so callers only check the signals
   * they actually have (e.g., signup has no userId yet; chat send has
   * all three).
   */
  static async findActiveMatch({ userId, email, fingerprintHash }: MatchActiveBanParams) {
    const or: Array<Record<string, unknown>> = [];
    if (userId) or.push({ userId });
    if (email) or.push({ email: email.trim().toLowerCase() });
    if (fingerprintHash) or.push({ fingerprintHash });
    if (or.length === 0) return null;

    return prisma.bannedIdentity.findFirst({
      where: {
        unbannedAt: null,
        OR: or,
      },
      orderBy: { bannedAt: 'desc' },
    });
  }

  /** Lift the ban by stamping `unbannedAt`. The row is kept for audit. */
  static async unban(id: string) {
    return prisma.bannedIdentity.update({
      where: { id },
      data: { unbannedAt: new Date() },
    });
  }

  /** List active bans for the admin moderation view. */
  static async listActive() {
    return prisma.bannedIdentity.findMany({
      where: { unbannedAt: null },
      orderBy: { bannedAt: 'desc' },
    });
  }
}
