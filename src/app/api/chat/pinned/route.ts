/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { ChatService } from '@/lib/services/chat-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/pinned
 *
 * Returns the currently pinned admin announcements (newest pin first).
 * Authenticated route so the client can hydrate the pinned strip even
 * when the pinned messages are older than the loaded chat history page.
 */
export const GET = withAuth(async (): Promise<NextResponse> => {
  const messages = await ChatService.listPinned();
  return NextResponse.json({ messages });
});
