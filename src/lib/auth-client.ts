/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { adminClient, inferAdditionalFields, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { auth } from '@/lib/auth';

/**
 * Browser-side better-auth client. Drives `useSession`, magic-link sign-in, and
 * the admin plugin (role-aware) from React components. `inferAdditionalFields`
 * surfaces the server-defined `role` / `termsAcceptedAt` fields on the client
 * session type so call sites can read `data.user.role`.
 *
 * `baseURL` is read from the public app URL so the client targets the same
 * origin the catch-all `/api/auth/[...all]` route is mounted on.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL,
  plugins: [magicLinkClient(), adminClient(), inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession, getSession } = authClient;
