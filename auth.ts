/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

import { auth as betterAuth } from '@/lib/auth';
import { getServerSession } from '@/lib/auth/get-server-session';
import type { ServerSession } from '@/lib/auth/get-server-session';

/**
 * Backwards-compatible server-session reader.
 *
 * This is the single façade the rest of the server code imports as `@/auth` —
 * it returns the same `{ user: { id, email, role, username, ... } } | null`
 * shape the Auth.js `auth()` helper used to, so the ~30 downstream call sites
 * (decorators, server actions, API routes) keep working unchanged after the
 * migration to better-auth. The implementation now delegates to
 * {@link getServerSession}, which re-hydrates the user from the database.
 */
export const auth = async (): Promise<ServerSession | null> => getServerSession();

/**
 * Server-side sign-out façade. Mirrors the old Auth.js `signOut` signature
 * (an optional `{ redirect }` flag, ignored here — server actions handle their
 * own redirect) and revokes the better-auth session for the current request.
 */
export const signOut = async (_options?: { redirect?: boolean }): Promise<void> => {
  const requestHeaders = await headers();
  await betterAuth.api.signOut({ headers: requestHeaders });
};
