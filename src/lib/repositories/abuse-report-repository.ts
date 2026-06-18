/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

import type { Prisma } from '@prisma/client';

interface CreateAbuseReportData {
  reportedUserId: string;
  reporterId: string;
  reporterFingerprint: string | null;
}

interface ListReportedUsersParams {
  /** Only count reports whose `createdAt` is within this many days. `null` = all-time. */
  windowDays: number | null;
  /**
   * Case-insensitive username/email filter. Pushed into the `groupBy` `where`
   * via the `reportedUser` relation so the database only groups matching
   * reports — the admin search never fetches the full reported-user set.
   */
  search?: string;
}

export interface ReportedUserSummary {
  userId: string;
  username: string | null;
  email: string;
  reportCount: number;
  latestReportedAt: Date;
  chatDisabled: boolean;
}

/**
 * Data-access layer for {@link AbuseReport}. Privacy-critical: callers
 * MUST be careful never to surface `reporterId` or `reporterFingerprint`
 * beyond the rate-limit / audit boundary. Admin-facing methods on this
 * class deliberately omit those fields from their return shapes.
 */
export class AbuseReportRepository {
  /** Insert a new report. Returns the persisted row including its id. */
  static async create(data: CreateAbuseReportData) {
    return prisma.abuseReport.create({
      data: {
        reportedUserId: data.reportedUserId,
        reporterId: data.reporterId,
        reporterFingerprint: data.reporterFingerprint,
      },
    });
  }

  /**
   * Count reports submitted by a given reporter against a specific
   * target inside a rolling time window. Used by the per-pair rate
   * limit when Redis is unavailable (defense-in-depth).
   */
  static async countByReporterAndTarget({
    reporterId,
    reportedUserId,
    sinceMs,
  }: {
    reporterId: string;
    reportedUserId: string;
    sinceMs: number;
  }) {
    return prisma.abuseReport.count({
      where: {
        reporterId,
        reportedUserId,
        createdAt: { gte: new Date(Date.now() - sinceMs) },
      },
    });
  }

  /**
   * Count all reports submitted by a given reporter inside a rolling
   * time window. Used by the global per-reporter rate limit.
   */
  static async countByReporter({ reporterId, sinceMs }: { reporterId: string; sinceMs: number }) {
    return prisma.abuseReport.count({
      where: {
        reporterId,
        createdAt: { gte: new Date(Date.now() - sinceMs) },
      },
    });
  }

  /**
   * Group reports by target user for the admin moderation table.
   * Returns one row per `reportedUserId` with the count and most recent
   * report timestamp. Excludes any reporter-identifying fields.
   */
  static async listReportedUsers({
    windowDays,
    search,
  }: ListReportedUsersParams): Promise<ReportedUserSummary[]> {
    const where: Prisma.AbuseReportWhereInput = {};
    if (windowDays !== null) {
      where.createdAt = { gte: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) };
    }
    const term = search?.trim();
    if (term) {
      where.reportedUser = {
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    const grouped = await prisma.abuseReport.groupBy({
      by: ['reportedUserId'],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    });

    if (grouped.length === 0) return [];

    const userIds = grouped.map((g) => g.reportedUserId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        email: true,
        chatUsers: { select: { disabled: true } },
      },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return grouped
      .map((g) => {
        const u = userById.get(g.reportedUserId);
        if (!u) return null;
        return {
          userId: u.id,
          username: u.username,
          email: u.email,
          reportCount: g._count._all,
          latestReportedAt: g._max.createdAt ?? new Date(0),
          chatDisabled: u.chatUsers.some((cu) => cu.disabled),
        } satisfies ReportedUserSummary;
      })
      .filter((row): row is ReportedUserSummary => row !== null)
      .sort((a, b) => b.latestReportedAt.getTime() - a.latestReportedAt.getTime());
  }
}
