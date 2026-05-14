/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { gravatarHash } from '@/lib/utils/gravatar-hash';
import { CHAT_CHANNEL, getPusherServer } from '@/lib/utils/pusher-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/pusher-auth
 *
 * Pusher's client SDK posts `socket_id` + `channel_name` (form-encoded)
 * during presence-channel subscription. We verify the user is signed in
 * and not gated, then return a signed presence payload.
 */
export const POST = withAuth(async (request: NextRequest, _ctx, session): Promise<NextResponse> => {
  const chatUser = await ChatUserRepository.findByUserId(session.user.id);
  if (chatUser?.disabled) {
    return NextResponse.json({ error: 'Chat access disabled' }, { status: 403 });
  }

  const form = await request.formData();
  const socketId = form.get('socket_id');
  const channelName = form.get('channel_name');

  if (typeof socketId !== 'string' || typeof channelName !== 'string') {
    return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
  }

  if (channelName !== CHAT_CHANNEL) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 403 });
  }

  const authResponse = getPusherServer().authorizeChannel(socketId, channelName, {
    user_id: session.user.id,
    user_info: {
      username: session.user.name,
      gravatarHash: gravatarHash(session.user.email),
    },
  });

  return NextResponse.json(authResponse);
});
