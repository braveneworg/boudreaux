/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ChatAdminService } from '@/lib/services/chat-admin-service';

export const dynamic = 'force-dynamic';

const DEFAULT_TAKE = 25;
const MAX_TAKE = 100;

export interface AdminUserMessageDto {
  id: string;
  body: string;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
}

export interface AdminUserMessagesResponse {
  rows: AdminUserMessageDto[];
  /** Number of rows returned, used by the client to decide if more pages exist. */
  nextSkip: number | null;
}

/**
 * GET /api/admin/chat/users/[userId]/messages
 *
 * Admin-only paginated message history for a single user. Includes
 * hidden messages so admins can audit the full record. Newest first.
 *
 * Query params:
 *   skip – offset for cursor-style pagination (default 0)
 *   take – page size (1–100, default 25)
 */
export const GET = withAdmin(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
  ): Promise<NextResponse> => {
    const { userId } = await params;
    const search = request.nextUrl.searchParams;
    const skip = Math.max(0, Number.parseInt(search.get('skip') ?? '0', 10) || 0);
    const takeRaw = Number.parseInt(search.get('take') ?? '', 10);
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), MAX_TAKE) : DEFAULT_TAKE;

    const rows = await ChatAdminService.listUserMessages({ userId, skip, take });

    const body: AdminUserMessagesResponse = {
      rows: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        hiddenReason: row.hiddenReason,
      })),
      nextSkip: rows.length === take ? skip + take : null,
    };
    return NextResponse.json(body);
  }
);
