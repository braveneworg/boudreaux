/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { generateUsername } from 'unique-username-generator';

/** The subset of the to-be-created user this hook reads and writes. */
export interface UsernameBackfillInput {
  username?: string | null;
  [key: string]: unknown;
}

/**
 * Generate a placeholder username, matching how the signup action seeds one
 * (`generateUsername('', 4)`). Users are prompted to set their real username
 * later via the change-username action.
 */
export const generatePlaceholderUsername = (): string => generateUsername('', 4);

/**
 * better-auth `databaseHooks.user.create.before` body.
 *
 * `User.username` is `@unique`, and better-auth creates users with no username
 * on its own paths — the magic-link auto-create for an unknown email at
 * `/signin`, and OAuth first sign-in. A null/absent value collides on the unique
 * index for the second such user, so sign-in would break. The previous Auth.js
 * adapter backfilled a placeholder username for exactly this reason; this hook
 * restores that behavior after the adapter was removed.
 *
 * The signup action sets its own generated username before creating the user, so
 * an already-present username is preserved. Returns `{ data }` (better-auth uses
 * it instead of the original record).
 */
export const backfillUsername = <InputType extends UsernameBackfillInput>(
  user: InputType
): { data: Omit<InputType, 'username'> & { username: string } } => ({
  data: { ...user, username: user.username || generatePlaceholderUsername() },
});
