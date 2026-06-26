/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MAGIC_LINK_ERROR_MESSAGES = {
  new_user_signup_disabled: 'Signups are temporarily paused.',
} as const;

type MagicLinkErrorCode = keyof typeof MAGIC_LINK_ERROR_MESSAGES;

/**
 * Maps a better-auth magic-link error code to a user-facing message.
 * Returns null for unknown or nullish codes so callers can gate rendering.
 */
export const magicLinkErrorMessage = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return (MAGIC_LINK_ERROR_MESSAGES as Record<string, string>)[code as MagicLinkErrorCode] ?? null;
};
