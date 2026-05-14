/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { ChatMentionService } from '@/lib/services/chat-mention-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/mention-search?q=<prefix>
 *
 * Returns up to 8 usernames starting with the supplied prefix for the
 * chat composer autocomplete. Excludes the caller from the results.
 */
export const GET = withAuth(async (request: NextRequest, _context, session) => {
  const query = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 32);
  const matches = await ChatMentionService.searchByPrefix(query, session.user.id);
  return NextResponse.json({ matches });
});
