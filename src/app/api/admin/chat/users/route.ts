/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import {
  ChatAdminService,
  DEFAULT_PER_PAGE,
  type ChatUsersSortBy,
} from '@/lib/services/chat-admin-service';

export const dynamic = 'force-dynamic';

const VALID_SORT_BY = new Set<ChatUsersSortBy>(['messageCount', 'lastSeenAt']);

/**
 * GET /api/admin/chat/users
 *
 * Query params:
 *   page          – 1-indexed page number (default 1)
 *   perPage       – Rows per page (1–100, default 50)
 *   sortBy        – messageCount | lastSeenAt (default messageCount)
 *   sortDirection – asc | desc (default desc)
 */
export const GET = withAdmin(async (request: NextRequest): Promise<NextResponse> => {
  const params = request.nextUrl.searchParams;

  const page = Number.parseInt(params.get('page') ?? '', 10) || 1;
  const perPage = Number.parseInt(params.get('perPage') ?? '', 10) || DEFAULT_PER_PAGE;

  const rawSortBy = params.get('sortBy') ?? 'messageCount';
  const sortBy: ChatUsersSortBy = VALID_SORT_BY.has(rawSortBy as ChatUsersSortBy)
    ? (rawSortBy as ChatUsersSortBy)
    : 'messageCount';

  const sortDirection = params.get('sortDirection') === 'asc' ? 'asc' : 'desc';

  const result = await ChatAdminService.listChatUsers({
    page,
    perPage,
    sortBy,
    sortDirection,
  });

  return NextResponse.json(result);
});
