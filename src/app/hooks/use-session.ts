/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { authClient } from '@/lib/auth-client';

/** Auth status, mirroring the legacy next-auth `useSession().status` values. */
export type SessionStatus = 'authenticated' | 'loading' | 'unauthenticated';

/** The user shape exposed on the client session (better-auth user + our fields). */
export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  image?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  allowSmsNotifications?: boolean | null;
  // Allow extra better-auth fields (e.g. emailVerified, banned) to ride along
  // without forcing every consumer to enumerate them.
  [key: string]: unknown;
}

/** Normalized client session, shaped like the data the components already read. */
export interface ClientSessionData {
  user: SessionUser;
}

/** Return value of {@link useSession}, matching the legacy next-auth hook surface. */
export interface UseSessionResult {
  data: ClientSessionData | null;
  status: SessionStatus;
  /**
   * Force a fresh session fetch (bypassing the cookie cache). Mirrors the legacy
   * next-auth `useSession().update()` used to re-sync the session after a
   * profile/email/username change.
   */
  update: () => Promise<unknown>;
}

/**
 * Client session hook. Adapts better-auth's `authClient.useSession()`
 * (`{ data, isPending }`) to the legacy `{ data, status, update }` shape the
 * auth components were written against, so call sites keep reading
 * `data?.user?.role` / `status === 'authenticated'` and calling `update()`
 * unchanged after the migration. `data` is non-null only once an authenticated
 * session resolves.
 *
 * @returns the current session data, a derived `status`, and an `update` refetch.
 */
export const useSession = (): UseSessionResult => {
  const { data, isPending } = authClient.useSession();

  const status: SessionStatus = isPending
    ? 'loading'
    : data?.user
      ? 'authenticated'
      : 'unauthenticated';

  return {
    data: data?.user ? { user: data.user as unknown as SessionUser } : null,
    status,
    // better-auth refetches the session atom on getSession; force-skip the
    // cookie cache so freshly-written profile fields are reflected.
    update: () => authClient.getSession({ query: { disableCookieCache: true } }),
  };
};
