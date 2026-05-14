/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { ChatService } from '@/lib/services/chat-service';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/chat/messages
 *
 * Query params:
 *   limit          – Number of messages to return (1–50, default 20)
 *   cursorCreatedAt – ISO timestamp of the oldest message in the previous page
 *   cursorId        – Tiebreaker id paired with cursorCreatedAt
 */
export const GET = withAuth(async (request: NextRequest): Promise<NextResponse> => {
  const params = request.nextUrl.searchParams;
  const limitParam = Number.parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const cursorCreatedAtRaw = params.get('cursorCreatedAt');
  const cursorId = params.get('cursorId');

  let cursor: { createdAt: Date; id: string } | undefined;
  if (cursorCreatedAtRaw && cursorId) {
    const createdAt = new Date(cursorCreatedAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      return NextResponse.json({ error: 'Invalid cursorCreatedAt' }, { status: 400 });
    }
    cursor = { createdAt, id: cursorId };
  }

  const messages = await ChatService.listRecent({ limit, cursor });

  return NextResponse.json({ messages });
});
