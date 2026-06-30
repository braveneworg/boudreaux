/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { adminClient, inferAdditionalFields, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { auth } from '@/lib/auth';
import { getApiBaseUrl } from '@/lib/utils/api-base-url';

/**
 * Browser-side better-auth client. Drives `useSession`, magic-link sign-in, and
 * the admin plugin (role-aware) from React components. `inferAdditionalFields`
 * surfaces the server-defined `role` / `termsAcceptedAt` fields on the client
 * session type so call sites can read `data.user.role`.
 *
 * `baseURL` targets the *served* origin (`getApiBaseUrl()` returns
 * `location.origin` in the browser) rather than a fixed public URL, so the
 * catch-all `/api/auth/[...all]` request stays same-origin no matter which host
 * served the page — apex, `www`, or a preview. Same-origin keeps the request
 * under CSP `connect-src 'self'` and the host-only session cookie first-party;
 * a fixed apex `baseURL` would be cross-origin (and CSP-blocked) when the page
 * is served from `www`. The server mirrors this with a dynamic `baseURL` (see
 * `auth.ts`).
 */
export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  plugins: [magicLinkClient(), adminClient(), inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession, getSession } = authClient;
