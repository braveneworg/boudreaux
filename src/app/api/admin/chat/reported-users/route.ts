/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ChatAdminService } from '@/lib/services/chat-admin-service';
import type { PaginatedResponse } from '@/lib/types/pagination';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 24;
const MAX_TAKE = 100;

export interface ReportedUserDto {
  userId: string;
  username: string | null;
  email: string;
  reportCount: number;
  latestReportedAt: string;
  chatDisabled: boolean;
}

export type ReportedUsersResponse = PaginatedResponse<ReportedUserDto>;

/**
 * GET /api/admin/chat/reported-users
 *
 * Returns one skip/offset page of reported users, each with the report count
 * and most recent report timestamp. Reporter identity is deliberately absent
 * from this DTO — admins moderate the target, not the source.
 *
 * Query params:
 *   windowDays – when set, only includes reports within the last N days.
 *                Omit for all-time.
 *   search     – substring match (case-insensitive) on username/email.
 *   skip, take – pagination (take defaults to 24, clamped to 100).
 */
export const GET = withAdmin(async (request: NextRequest): Promise<NextResponse> => {
  const params = request.nextUrl.searchParams;
  const windowDaysRaw = params.get('windowDays');
  const windowDays =
    windowDaysRaw !== null && Number.isFinite(Number.parseInt(windowDaysRaw, 10))
      ? Math.max(1, Number.parseInt(windowDaysRaw, 10))
      : null;
  const search = params.get('search') ?? undefined;
  const skip = Math.max(0, parseInt(params.get('skip') ?? '0', 10) || 0);
  const take = Math.min(
    Math.max(1, parseInt(params.get('take') ?? String(DEFAULT_TAKE), 10) || DEFAULT_TAKE),
    MAX_TAKE
  );

  const { rows, nextSkip } = await ChatAdminService.listReportedUsers({
    windowDays,
    search,
    skip,
    take,
  });

  const body: ReportedUsersResponse = {
    rows: rows.map((row) => ({
      userId: row.userId,
      username: row.username,
      email: row.email,
      reportCount: row.reportCount,
      latestReportedAt: row.latestReportedAt.toISOString(),
      chatDisabled: row.chatDisabled,
    })),
    nextSkip,
  };
  return NextResponse.json(body);
});
