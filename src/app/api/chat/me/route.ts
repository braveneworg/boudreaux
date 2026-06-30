/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { BanEvasionService } from '@/lib/services/ban-evasion-service';
import { extractClientIp } from '@/lib/utils/extract-client-ip';

export const dynamic = 'force-dynamic';

export interface ChatMeResponse {
  /** True when the user has been chat-disabled OR matches an active ban. */
  blocked: boolean;
}

/**
 * GET /api/chat/me
 *
 * Returns whether the current viewer is permitted to interact with
 * chat. Used by {@link ChatBody} to swap in the disabled-user UX. The
 * response intentionally exposes only a boolean — admins must not see
 * ban reasons leaked to the targeted user.
 */
export const GET = withAuth(async (request: NextRequest, _ctx, session): Promise<NextResponse> => {
  const userId = session.user.id;
  const email = session.user.email;

  const [chatUser, ban] = await Promise.all([
    ChatUserRepository.findByUserId(userId),
    BanEvasionService.check({
      userId,
      email,
      userAgent: request.headers.get('user-agent'),
      acceptLanguage: request.headers.get('accept-language'),
      ip: extractClientIp(request),
    }),
  ]);

  // Defense-in-depth: treat a better-auth account ban as blocked, in addition
  // to ChatUser.disabled and the fingerprint/evasion ban check. A full account
  // ban already revokes sessions, but this covers temporary-ban edge cases and
  // provides layered enforcement for coherence.
  const accountBanned = session.user.banned === true;
  const blocked = Boolean(chatUser?.disabled) || ban.banned || accountBanned;
  const body: ChatMeResponse = { blocked };
  return NextResponse.json(body);
});
