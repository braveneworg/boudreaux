/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import type { User } from '@/lib/types/domain/user';

/**
 * Normalized server session. The single shape every server-side reader sees,
 * regardless of the underlying auth provider. `user` is the authoritative DB
 * record (role, username, profile fields), keeping the legacy
 * `session.user.role === 'admin'` access pattern working unchanged.
 */
export interface ServerSession {
  user: User;
}

/**
 * Resolve the current server session via better-auth, then re-hydrate the user
 * from the database so callers always see authoritative `role`/profile fields
 * (the better-auth session only carries default + additional fields).
 *
 * Returns `null` when there is no session, the session lacks a user id, or the
 * user no longer exists.
 */
export const getServerSession = async (): Promise<ServerSession | null> => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const user = await UserRepository.findById(userId);
  if (!user) {
    return null;
  }

  return { user };
};
