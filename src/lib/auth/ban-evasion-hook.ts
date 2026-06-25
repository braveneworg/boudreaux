/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { BannedIdentityRepository } from '@/lib/repositories/banned-identity-repository';
import { loggers } from '@/lib/utils/logger';

/** Identity signals available when a session is about to be created. */
export interface BanEvasionCheckParams {
  /** The signing-in user's email, or null when unavailable. */
  email: string | null;
  /** The signing-in user's id, or null when unavailable. */
  userId: string | null;
}

/**
 * Ban-evasion gate (010-chat-abuse-reporting). Returns `false` when the email
 * or userId matches an active {@link BannedIdentity}, which aborts session
 * creation in the better-auth `databaseHooks.session.create.before` hook.
 * Returning `false` is the documented clean-rejection idiom — `throw` is
 * reserved for unexpected errors only.
 *
 * Fingerprint-based blocking happens at the request layer (`/api/chat/me`, chat
 * send) where headers are available — this gate only sees email + userId.
 *
 * Fails open on transient DB errors so a temporary outage does not lock everyone
 * out; the chat-time check still gates abuse.
 */
export const assertNotBanEvading = async ({
  email,
  userId,
}: BanEvasionCheckParams): Promise<false | void> => {
  if (!email && !userId) return;

  try {
    const match = await BannedIdentityRepository.findActiveMatch({ userId, email });
    if (!match) return;

    loggers.auth.warn('Sign-in rejected for banned identity', {
      maskedEmail: email ? `${email[0]}***` : null,
      userId: userId ?? undefined,
    });
    return false;
  } catch (error) {
    // Fail open on transient DB errors; the chat-time check still gates abuse.
    loggers.auth.error('Ban check failed; allowing sign-in', error);
  }
};
