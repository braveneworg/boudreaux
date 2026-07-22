/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';

import { auth as getServerAuthSession } from '@/auth';
import { auth } from '@/lib/auth';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
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
  /**
   * True when the caller was an unauthenticated guest: no session was minted —
   * a magic link was sent and they must complete it to sign in and download.
   */
  verificationRequired?: boolean;
}

/**
 * After a completed guest purchase, require email-ownership proof before the
 * buyer can download — do NOT mint a session directly from the checkout id.
 *
 * The Stripe checkout session ID proves only that the caller *initiated that
 * checkout*, not that they own the account the purchase resolved to. An
 * attacker can initiate a guest checkout with a victim's email; binding the
 * purchase to (or creating) that account and then minting a session from the
 * sessionId would be an account takeover (#665). So instead of minting, we send
 * a better-auth magic link to the purchase owner's email — only the true inbox
 * owner can complete it, sign in, and download. Already-authenticated callers
 * are untouched (they can download immediately).
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

    const owner = await UserRepository.findEmailById(purchase.userId);
    if (!owner?.email) {
      return { success: false, error: 'user_not_found' };
    }

    // Require verification: send a magic link to the purchase owner's email.
    // Only the inbox owner can complete it — this proves ownership before any
    // session exists. Forward the request headers so better-auth captures
    // ip/user-agent for the sign-in.
    await auth.api.signInMagicLink({
      body: { email: owner.email, callbackURL: '/', errorCallbackURL: '/signin' },
      headers: await headers(),
    });

    return { success: true, verificationRequired: true };
  } catch (error) {
    loggers.payments.error('createPurchaseSessionAction: failed to send verification', error);
    return { success: false, error: 'server_error' };
  }
};
