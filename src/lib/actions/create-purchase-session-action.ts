/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';

import { auth as getServerAuthSession } from '@/auth';
import { auth } from '@/lib/auth';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { loggers } from '@/lib/utils/logger';
import { rateLimit } from '@/lib/utils/rate-limit';

import {
  isPurchaseSessionRateLimited,
  isValidCheckoutSessionId,
} from './create-purchase-session-action-helpers';

// This action mints a session from a Stripe checkout session ID with no prior
// authentication — the same posture as signin, so it gets the same 5/min/IP
// throttle to shut down session-ID guessing and DB-lookup floods.
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

interface CreatePurchaseSessionInput {
  sessionId: string;
}

interface CreatePurchaseSessionResult {
  success: boolean;
  error?: string;
}

/**
 * Create a better-auth session for a user after a completed purchase, enabling
 * immediate downloads without requiring a separate magic-link sign-in.
 *
 * The Stripe checkout session ID is the trust anchor — only a client that
 * initiated the checkout possesses it. It is resolved to a userId via the PWYW
 * purchase record; the session itself is minted by the server-only better-auth
 * endpoint `auth.api.createPurchaseSession`, which creates a real session (the
 * ban-evasion `session.create.before` hook still applies) and sets the
 * better-auth session cookie (forwarded to the response by `nextCookies()`).
 * The default better-auth session lifetime applies (7 days).
 */
export const createPurchaseSessionAction = async (
  input: CreatePurchaseSessionInput
): Promise<CreatePurchaseSessionResult> => {
  const { sessionId } = input;

  // Skip if the user is already authenticated.
  const existingSession = await getServerAuthSession();
  if (existingSession?.user?.id) {
    return { success: true };
  }

  // Rate limit unauthenticated callers (E2E shards share one IP, so the
  // harness opts out the same way withRateLimit does).
  if (await isPurchaseSessionRateLimited(limiter)) {
    return { success: false, error: 'rate_limited' };
  }

  if (!isValidCheckoutSessionId(sessionId)) {
    return { success: false, error: 'invalid_session_id' };
  }

  try {
    // Resolve the user via the PWYW purchase record (DB-only, no external call).
    const purchase = await PurchaseRepository.findBySessionId(sessionId);
    if (!purchase) {
      return { success: false, error: 'user_not_found' };
    }

    // Mint a real better-auth session + cookie for the resolved userId via the
    // server-only endpoint. Forward the request headers so the session captures
    // ip/user-agent; `nextCookies()` sets the signed session cookie on the
    // Next response.
    await auth.api.createPurchaseSession({
      body: { userId: purchase.userId },
      headers: await headers(),
    });

    return { success: true };
  } catch (error) {
    loggers.payments.error('createPurchaseSession: failed to create session', error);
    return { success: false, error: 'server_error' };
  }
};
